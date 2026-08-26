/**
 * Lambda function URL handler.
 *
 * The demo is deployed as a single function rather than ECS/Fargate: it is a
 * read-only set of pages over baked-in synthetic data, so a container, a load
 * balancer and a VPC would be cost and ceremony with nothing behind them. The §3
 * stack still applies to the real services — this is the demo surface, not the
 * architecture.
 */

import {
  handleAssist,
  handleCaptureUpload,
  handleVision,
  renderPath,
  renderStatic,
  renderWithQuery,
} from "./app.js";
import { resolveTenant } from "./tenant.js";

interface FunctionUrlEvent {
  rawPath?: string;
  rawQueryString?: string;
  body?: string;
  isBase64Encoded?: boolean;
  // Declared for the milestone that reads an Authorization header here. Today
  // nothing does, and every request resolves to the default tenant.
  headers?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string } };
}

interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

/**
 * `script-src 'self'` rather than `'unsafe-inline'`: the capture console's code is
 * served as its own file, so inline script stays forbidden and an injected
 * `<script>` cannot execute.
 *
 * `img-src` allows `blob:` and `data:` because the editor renders local files the
 * user picked and previews the redacted result as a data URL. Neither is a remote
 * origin — `connect-src 'none'` still means the page cannot send anything anywhere,
 * which is the property that matters for unredacted photos.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'unsafe-inline'",
  "img-src 'self' blob: data:",
  // 'self' so the page can reach /ai, and nothing else. A photo still has
  // nowhere to go: no other origin is reachable from this document.
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
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

export const handler = async (event: FunctionUrlEvent): Promise<FunctionUrlResult> => {
  const path = event.rawPath ?? "/";

  if (path === "/healthz") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "strict-transport-security": HSTS },
      body: JSON.stringify({ status: "ok" }),
    };
  }

  // One identity resolution per request, threaded down. Nothing below re-derives
  // a tenant from the URL.
  const tenant = await resolveTenant(event.rawQueryString ?? "");
  const orgId = tenant?.orgId ?? null;

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
