/**
 * Lambda function URL handler.
 *
 * The demo is deployed as a single function rather than ECS/Fargate: it is a
 * read-only set of pages over baked-in synthetic data, so a container, a load
 * balancer and a VPC would be cost and ceremony with nothing behind them. The §3
 * stack still applies to the real services — this is the demo surface, not the
 * architecture.
 */

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  handleAssist,
  handleCaptureUpload,
  handleVision,
  renderPath,
  renderStatic,
  needsTenant,
  renderWithQuery,
} from "./app.js";
import { handleAdmin } from "./admin-routes.js";
import { parseCookies, SESSION_COOKIE, verifySession } from "./auth.js";
import { beginLogin, beginLogout, completeLogin } from "./auth-routes.js";
import { handleClassifications } from "./classification-routes.js";
import { isAdminWithoutTenant, resolveTenant, wantsSpecificOrg } from "./tenant.js";

interface FunctionUrlEvent {
  rawPath?: string;
  rawQueryString?: string;
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  /** API Gateway v2 delivers request cookies here, not in `headers.cookie`. */
  cookies?: string[];
  requestContext?: { http?: { method?: string } };
}

interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
  /** Response cookies. A `set-cookie` header would carry only the first one. */
  cookies?: string[];
}

/**
 * `script-src 'self'` rather than `'unsafe-inline'`: the capture console's code is
 * served as its own file, so inline script stays forbidden and an injected
 * `<script>` cannot execute.
 *
 * `img-src` allows `blob:` and `data:` because the editor renders local files the
 * user picked and previews the redacted result as a data URL. Neither is a remote
 * origin — `connect-src` still means the page cannot send anything anywhere,
 * which is the property that matters for unredacted photos.
 *
 * The S3 origin is allowed for images only, and only so the classification pages
 * can display a stored capture from a presigned link. Proxying those bytes
 * through the function instead would hit the 6 MB response cap on exactly the
 * large photographs most worth looking at. It widens `img-src` and nothing else:
 * a page still cannot *send* anywhere, which is the property that matters.
 */
const MEDIA_ORIGIN = "https://*.s3.ca-central-1.amazonaws.com";

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'unsafe-inline'",
  `img-src 'self' blob: data: ${MEDIA_ORIGIN}`,
  // 'self' so the page can reach /ai, and nothing else. A photo still has
  // nowhere to go: no other origin is reachable from this document.
  "connect-src 'self'",
  "base-uri 'none'",
  // `'self'`, not `'none'`. This said `'none'` when every page here was
  // read-only, and it silently broke the first server-rendered form to ship:
  // the classification adjustment posts back to this origin, and the browser
  // refused the submission with nothing shown to the user and nothing logged on
  // the server. `'self'` still blocks a submission to any other origin, which is
  // the property actually worth having.
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * HSTS — sent because the site is *unreachable* over HTTP, not merely because
 * HTTP is discouraged.
 *
 * API Gateway custom domains listen on 443 only. There is no port 80 listener to
 * redirect from, so `http://sitewireai.com` does not return a 301, it returns
 * `connection refused`. On a phone, where typing a bare domain still tries HTTP
 * first, that is indistinguishable from a domain that does not resolve — which is
 * exactly how this surfaced.
 *
 * This header cannot fix a first visit, and nothing served over HTTPS can: the
 * browser never reaches us to be told. What it fixes is every visit after the
 * first — once seen, the browser rewrites `http://` to `https://` itself and never
 * attempts the refused port again. First-time and shared-link traffic needs
 * something actually listening on 80, which means CloudFront in front of the API.
 *
 * Two deliberate omissions:
 *
 * `preload` is **not** here. Preloading bakes the domain into browsers' shipped
 * source and removal takes months to propagate. That is a decision to make on
 * purpose for a domain whose setup has settled, not a flag added in passing.
 *
 * A one-year max-age is safe here *specifically* because HTTP is impossible on
 * this domain rather than just unused — there is no later configuration that would
 * want plain HTTP and find itself locked out.
 *
 * `includeSubDomains` commits every future subdomain to HTTPS as well. Anything
 * served from AWS will be; an HTTP-only subdomain would need this narrowed first.
 */
const HSTS = "max-age=31536000; includeSubDomains";

/**
 * Secrets, read once per execution environment and put into the environment.
 *
 * Two values cannot be Lambda environment variables: the Anthropic API key and
 * the Cognito client secret. Both would then be readable by anyone with console
 * access to the function's configuration page, which is a wider audience than
 * either deserves. They live in Secrets Manager and are fetched on the first
 * request instead.
 *
 * This is why `auth.ts` reads its configuration lazily. A module-level
 * `const CLIENT_SECRET = process.env...` would capture the empty string before
 * this ran, and every sign-in for the life of the execution environment would
 * fail with nothing in the logs to say why.
 *
 * Cached deliberately: a Secrets Manager read per request would add latency and
 * cost to every page view for values that change only on a deliberate rotation.
 * The trade is that a rotation takes effect when the environment recycles.
 */
const SECRET_ID = process.env.SITEWIREAI_SECRET_ID ?? "";
let secrets: SecretsManagerClient | null = null;
let secretsLoaded = false;

async function loadSecrets(): Promise<void> {
  if (secretsLoaded || !SECRET_ID) return;
  secretsLoaded = true;

  try {
    if (!secrets) secrets = new SecretsManagerClient({});
    const result = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
    if (!result.SecretString) return;

    const parsed = JSON.parse(result.SecretString) as Record<string, unknown>;
    if (typeof parsed.anthropic_api_key === "string" && parsed.anthropic_api_key) {
      process.env.ANTHROPIC_API_KEY = parsed.anthropic_api_key;
    }
    if (typeof parsed.cognito_client_secret === "string" && parsed.cognito_client_secret) {
      process.env.SITEWIREAI_CLIENT_SECRET = parsed.cognito_client_secret;
    }
  } catch {
    // Deliberately swallowed. A page that renders without classification is
    // worth serving; a site that 500s because Secrets Manager had a moment is
    // not. Sign-in will fail loudly on its own if the client secret is missing.
  }
}

export const handler = async (event: FunctionUrlEvent): Promise<FunctionUrlResult> => {
  const path = event.rawPath ?? "/";

  await loadSecrets();

  if (path === "/healthz") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "strict-transport-security": HSTS },
      body: JSON.stringify({ status: "ok" }),
    };
  }

  const rawQuery = event.rawQueryString ?? "";
  const cookieHeader = (event.cookies ?? []).join("; ") || (event.headers?.cookie ?? "");
  const host = event.headers?.host ?? "";
  const proto = event.headers?.["x-forwarded-proto"] ?? "https";

  if (path === "/login" || path === "/auth/callback" || path === "/logout") {
    const result =
      path === "/login"
        ? beginLogin(host, proto)
        : path === "/logout"
          ? beginLogout(host, proto)
          : await completeLogin(host, proto, rawQuery, cookieHeader);

    // API Gateway v2 carries Set-Cookie in its own field, not in `headers` —
    // multiple cookies in a single header string are silently dropped.
    const raw = result.headers["set-cookie"];
    const cookies = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    const { "set-cookie": _omit, ...rest } = result.headers;

    return {
      statusCode: result.status,
      headers: { ...(rest as Record<string, string>), "strict-transport-security": HSTS },
      ...(cookies.length > 0 ? { cookies } : {}),
      body: result.body,
    };
  }

  // The admin console. Unlike everything else it crosses tenants, so it is
  // gated on the admins group rather than on a tenant binding — see
  // requireAdmin. It is reachable in production, deliberately: an admin surface
  // only the local dev server serves is one the founder cannot use.
  if (path.startsWith("/admin")) {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    const session = await verifySession(parseCookies(cookieHeader)[SESSION_COOKIE] ?? "");
    const admin = await handleAdmin(
      path,
      event.requestContext?.http?.method ?? "GET",
      rawQuery,
      body,
      session,
    );
    if (admin) {
      return {
        statusCode: admin.status,
        headers: {
          ...admin.headers,
          "strict-transport-security": HSTS,
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        },
        body: admin.body,
      };
    }
  }

  // One identity resolution per request, threaded down. Nothing below re-derives
  // a tenant from the URL.
  const tenant = await resolveTenant({ rawQuery, cookieHeader });
  const orgId = tenant?.orgId ?? null;

  // An admin belongs to no tenant, so the client view has nothing for them.
  // The local server has always done this; the deployed one did not, which
  // meant a signed-in admin hitting the root got a page that read as broken.
  if (path === "/" && !orgId && (await isAdminWithoutTenant({ rawQuery, cookieHeader }))) {
    return {
      statusCode: 303,
      headers: {
        location: "/admin",
        "cache-control": "no-store",
        "strict-transport-security": HSTS,
      },
      body: "",
    };
  }

  // The root is the front door for anyone without a session. The switcher is
  // disabled in production, so `wantsSpecificOrg` is false here and every
  // signed-out visitor gets the two sign-in choices.
  if (path === "/" && !tenant?.authenticated && !wantsSpecificOrg({ rawQuery, cookieHeader })) {
    const welcome = await renderPath("/welcome", null);
    return {
      statusCode: welcome.status,
      headers: {
        "content-type": welcome.contentType,
        "cache-control": "no-store",
        "strict-transport-security": HSTS,
        "content-security-policy": CSP,
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
      body: welcome.body,
    };
  }

  if (path === "/captures" || path.startsWith("/captures/")) {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    const result = await handleClassifications(
      path,
      event.requestContext?.http?.method ?? "GET",
      rawQuery,
      raw,
      orgId,
    );
    if (result) {
      return {
        statusCode: result.status,
        headers: {
          ...result.headers,
          "strict-transport-security": HSTS,
          "content-security-policy": CSP,
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        },
        body: result.body,
      };
    }
  }

  const POSTS: Record<string, typeof handleAssist> = {
    "/ai": handleAssist,
    "/ai/vision": handleVision,
    "/api/captures": handleCaptureUpload,
  };

  const post = POSTS[path];
  if (post && event.requestContext?.http?.method === "POST") {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    const ai = await post(raw, orgId);
    return {
      statusCode: ai.status,
      headers: {
        "content-type": ai.contentType,
        "cache-control": "no-store",
        "strict-transport-security": HSTS,
        "content-security-policy": CSP,
        "x-content-type-options": "nosniff",
      },
      body: ai.body,
    };
  }

  // Images are bytes. API Gateway carries them base64-encoded with the flag set;
  // returning raw bytes as a string corrupts them silently, which looks like a
  // broken image rather than an error.
  const asset = renderStatic(path);
  if (asset) {
    return {
      statusCode: 200,
      headers: {
        "content-type": asset.contentType,
        // Static demo imagery is immutable in practice and worth caching, unlike
        // every page here, which is regenerated per request.
        "cache-control": "public, max-age=3600",
        "strict-transport-security": HSTS,
        "x-content-type-options": "nosniff",
      },
      body: asset.body.toString("base64"),
      isBase64Encoded: true,
    };
  }

  if (!orgId && needsTenant(path)) {
    return {
      statusCode: 303,
      headers: {
        location: "/login",
        "cache-control": "no-store",
        "strict-transport-security": HSTS,
      },
      body: "",
    };
  }

  const url = event.rawQueryString ? `${path}?${event.rawQueryString}` : path;
  const withQuery = await renderWithQuery(url, orgId);
  const { status, contentType, body } = withQuery ?? (await renderPath(path, orgId));

  return {
    statusCode: status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      "strict-transport-security": HSTS,
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
    body,
  };
};
