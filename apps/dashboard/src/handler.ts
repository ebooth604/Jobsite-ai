/**
 * Lambda function URL handler.
 *
 * The demo is deployed as a single function rather than ECS/Fargate: it is a
 * read-only set of pages over baked-in synthetic data, so a container, a load
 * balancer and a VPC would be cost and ceremony with nothing behind them. The §3
 * stack still applies to the real services — this is the demo surface, not the
 * architecture.
 */

import { renderPath } from "./app.js";

interface FunctionUrlEvent {
  rawPath?: string;
}

interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
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
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const handler = async (event: FunctionUrlEvent): Promise<FunctionUrlResult> => {
  const path = event.rawPath ?? "/";

  if (path === "/healthz") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ok" }),
    };
  }

  const { status, contentType, body } = renderPath(path);

  return {
    statusCode: status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
    body,
  };
};
