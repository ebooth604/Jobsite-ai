/**
 * The three routes sign-in needs: start, return, end.
 *
 * Kept apart from `app.ts` because these are the only handlers that set
 * cookies and issue redirects rather than rendering a view, and because the
 * security-relevant logic — state checking, code exchange — is easier to audit
 * when it is not interleaved with routing.
 */

import {
  authorizeUrl,
  clearedCookie,
  exchangeCode,
  logoutUrl,
  newState,
  parseCookies,
  SESSION_COOKIE,
  sessionCookie,
  STATE_COOKIE,
  stateCookie,
  stateMatches,
} from "./auth.js";

export interface AuthResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
}

const HTML = "text/html; charset=utf-8";

function page(title: string, message: string, link: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title} — SiteWireAi</title></head><body
style="font:15px/1.6 system-ui,sans-serif;max-width:40rem;margin:6rem auto;padding:0 1.5rem">
<h1 style="font-size:1.3rem">${title}</h1><p>${message}</p>
<p><a href="${link}">Try again</a></p></body></html>`;
}

/**
 * The origin this request arrived on.
 *
 * The redirect URI must match the one registered with Cognito byte for byte,
 * and it must also match between the authorize call and the token exchange — a
 * mismatch there is the single most common cause of a failed exchange. Deriving
 * it from the request rather than hardcoding it is what lets the same build
 * serve localhost and the deployed origin.
 */
export function originOf(host: string, forwardedProto: string): { origin: string; secure: boolean } {
  const secure = forwardedProto === "https" || !/^(localhost|127\.0\.0\.1)/.test(host);
  return { origin: `${secure ? "https" : "http"}://${host}`, secure };
}

export function beginLogin(host: string, proto: string): AuthResponse {
  const { origin, secure } = originOf(host, proto);
  const state = newState();

  return {
    status: 302,
    headers: {
      location: authorizeUrl(`${origin}/auth/callback`, state),
      "set-cookie": stateCookie(state, secure),
      "cache-control": "no-store",
    },
    body: "",
  };
}

/**
 * The return leg.
 *
 * Three things must hold before a session is issued: the callback carries a
 * code, the `state` matches the one this browser was given, and the code
 * exchanges successfully. The state check is what stops a third party from
 * feeding a victim's browser a code of their choosing.
 */
export async function completeLogin(
  host: string,
  proto: string,
  rawQuery: string,
  cookieHeader: string,
): Promise<AuthResponse> {
  const { origin, secure } = originOf(host, proto);
  const params = new URLSearchParams(rawQuery);

  const failure = (message: string): AuthResponse => ({
    status: 400,
    headers: {
      "content-type": HTML,
      "cache-control": "no-store",
      "set-cookie": clearedCookie(STATE_COOKIE, secure),
    },
    body: page("Sign-in failed", message, "/login"),
  });

  // Cognito reports its own refusals here rather than at the token endpoint.
  const oauthError = params.get("error");
  if (oauthError) {
    return failure(`The sign-in provider returned: ${oauthError}`);
  }

  const code = params.get("code") ?? "";
  if (!code) return failure("No authorization code was returned.");

  const expected = parseCookies(cookieHeader)[STATE_COOKIE] ?? "";
  if (!stateMatches(params.get("state") ?? "", expected)) {
    return failure("The sign-in request could not be verified. Start again from this device.");
  }

  const tokens = await exchangeCode(code, `${origin}/auth/callback`);
  if ("error" in tokens) return failure(tokens.error);

  return {
    status: 302,
    headers: {
      location: "/",
      "cache-control": "no-store",
      // The state cookie has done its job; leaving it would let a stale value
      // sit in the browser for ten minutes with nothing to check it against.
      "set-cookie": [
        sessionCookie(tokens.idToken, tokens.expiresIn, secure),
        clearedCookie(STATE_COOKIE, secure),
      ],
    },
    body: "",
  };
}

/**
 * Sign out both locally and at Cognito.
 *
 * Clearing the cookie alone would leave the user signed in at the identity
 * provider, so the next visit to /login would sail straight back through
 * without a prompt — which does not look like signing out.
 */
export function beginLogout(host: string, proto: string): AuthResponse {
  const { origin, secure } = originOf(host, proto);
  return {
    status: 302,
    headers: {
      location: logoutUrl(`${origin}/`),
      "cache-control": "no-store",
      "set-cookie": clearedCookie(SESSION_COOKIE, secure),
    },
    body: "",
  };
}
