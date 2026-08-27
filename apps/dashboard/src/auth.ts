/**
 * Sign-in: the OAuth authorization-code flow against Cognito.
 *
 * This is a **confidential client**. The dashboard is server-rendered, so the
 * code-for-token exchange happens here, where a client secret can actually be
 * kept. PKCE is the answer for public clients that cannot hold a secret; it is
 * not what this shape needs.
 *
 * What a signed-in session is: an httpOnly cookie holding the Cognito ID token,
 * verified against the pool's JWKS on **every** request. The cookie is not
 * itself trusted — it is a carrier for a token whose signature, issuer,
 * audience and expiry are checked each time. A forged or edited cookie fails
 * verification and resolves to no session, which the app treats as signed out.
 *
 * The tenant comes from the `custom:orgId` claim inside that verified token.
 * That is the whole point of doing it this way: tenancy is not something the
 * caller can influence by editing a URL or a cookie, because changing it
 * invalidates the signature.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";

/**
 * Read on use, not at module load.
 *
 * In Lambda the client secret arrives from Secrets Manager during the first
 * request — it is deliberately not a function environment variable, where anyone
 * with console read access could see it. A top-level `const` would capture the
 * empty string before that read happened, and sign-in would fail for the whole
 * life of the execution environment with nothing in the logs to explain it.
 *
 * Locally these come from `.env` and are set before anything imports this, so
 * the laziness costs nothing and removes a whole class of ordering bug.
 */
const USER_POOL_ID = () => process.env.SITEWIREAI_USER_POOL_ID ?? "";
const CLIENT_ID = () => process.env.SITEWIREAI_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.SITEWIREAI_CLIENT_SECRET ?? "";
const LOGIN_DOMAIN = () => process.env.SITEWIREAI_LOGIN_DOMAIN ?? "";

export const SESSION_COOKIE = "sw_session";
const STATE_COOKIE = "sw_state";

export function authConfigured(): boolean {
  return Boolean(USER_POOL_ID() && CLIENT_ID() && CLIENT_SECRET() && LOGIN_DOMAIN());
}

/**
 * The verifier caches the pool's JWKS after its first fetch, so it is built once
 * per process rather than per request — a key fetch on every page view would add
 * a network round trip to every render.
 */
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function jwtVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID(),
      tokenUse: "id",
      clientId: CLIENT_ID(),
    });
  }
  return verifier;
}

export interface Session {
  orgId: string;
  email: string;
  subject: string;
  /**
   * Cross-tenant administrative access, from `cognito:groups`.
   *
   * A claim rather than an attribute on purpose: a user cannot put themselves
   * in a group, whereas a `custom:isAdmin` attribute would be writable by them
   * unless the app client's write permissions were carefully locked down. The
   * check is therefore something the identity provider asserts, not something
   * the request carries.
   */
  isAdmin: boolean;
}

const ADMIN_GROUP = "admins";

/**
 * Verifies a token and extracts the session.
 *
 * Returns null for anything that does not verify — bad signature, wrong
 * audience, expired, or belonging to nobody. A user with neither an org nor
 * admin group is authenticated but has no access, and is treated as having no
 * session rather than being shown a default tenant's data.
 *
 * An administrator is allowed to have no `custom:orgId`: they are not a member
 * of any one tenant, which is the point.
 */
export async function verifySession(token: string): Promise<Session | null> {
  if (!token || !authConfigured()) return null;

  try {
    const payload = await jwtVerifier().verify(token);
    const orgId = typeof payload["custom:orgId"] === "string" ? payload["custom:orgId"] : "";

    const groups = payload["cognito:groups"];
    const isAdmin = Array.isArray(groups) && groups.includes(ADMIN_GROUP);

    if (!orgId && !isAdmin) return null;

    return {
      orgId,
      email: typeof payload.email === "string" ? payload.email : "",
      subject: String(payload.sub ?? ""),
      isAdmin,
    };
  } catch {
    return null;
  }
}

// ---- the flow --------------------------------------------------------------

/** Single-use CSRF value, bound to the browser by cookie and checked on return. */
export function newState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Compares two state values without leaking length or position through timing.
 *
 * Hashed first so `timingSafeEqual` gets equal-length buffers — it throws on a
 * length mismatch, which would itself be an oracle.
 */
export function stateMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID(),
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state,
  });
  return `https://${LOGIN_DOMAIN()}/oauth2/authorize?${params}`;
}

export function logoutUrl(returnTo: string): string {
  const params = new URLSearchParams({ client_id: CLIENT_ID(), logout_uri: returnTo });
  return `https://${LOGIN_DOMAIN()}/logout?${params}`;
}

export interface TokenSet {
  idToken: string;
  expiresIn: number;
}

/**
 * Exchanges an authorization code for tokens.
 *
 * The client secret goes in the Basic auth header, which is where Cognito
 * expects it for a confidential client — not in the body.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<TokenSet | { error: string }> {
  if (!authConfigured()) return { error: "Authentication is not configured on this server." };

  const basic = Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString("base64");

  const res = await fetch(`https://${LOGIN_DOMAIN()}/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID(),
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Cognito's token endpoint returns invalid_request / invalid_client /
    // invalid_grant / unauthorized_client / unsupported_grant_type. The most
    // common in practice is a redirect_uri that does not match the one used on
    // the authorize call, byte for byte.
    return { error: `Token exchange failed (${res.status}): ${detail.slice(0, 200)}` };
  }

  const body = (await res.json()) as { id_token?: string; expires_in?: number };
  if (!body.id_token) return { error: "Token response carried no ID token." };

  return { idToken: body.id_token, expiresIn: body.expires_in ?? 3600 };
}

// ---- cookies ---------------------------------------------------------------

export function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) out[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

/**
 * `secure` is conditional on purpose.
 *
 * The local dev server is plain HTTP on 127.0.0.1, and a Secure cookie is simply
 * never sent there — sign-in would appear to succeed and then every page would
 * think it was signed out. It is set whenever the request arrived over HTTPS,
 * which is every deployed request.
 */
function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    // Lax rather than Strict: the OAuth callback is a top-level navigation from
    // Cognito's domain, and Strict would withhold the cookie on exactly that hop.
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return cookie(SESSION_COOKIE, token, maxAge, secure);
}

export function stateCookie(state: string, secure: boolean): string {
  // Ten minutes: long enough to sign in and enrol MFA, short enough that a stale
  // state from an abandoned attempt cannot be replayed later.
  return cookie(STATE_COOKIE, state, 600, secure);
}

export function clearedCookie(name: string, secure: boolean): string {
  return cookie(name, "", 0, secure);
}

export { STATE_COOKIE };
