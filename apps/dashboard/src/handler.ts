/**
 * Lambda function URL handler.
 *
 * The demo is deployed as a single function rather than ECS/Fargate: it is a
 * read-only set of pages over baked-in synthetic data, so a container, a load
 * balancer and a VPC would be cost and ceremony with nothing behind them. The §3
 * stack still applies to the real services — this is the demo surface, not the
 * architecture.
 */

import { handleAssist, renderPath, renderWithQuery } from "./app.js";

interface FunctionUrlEvent {
  rawPath?: string;
  rawQueryString?: string;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
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
  // 'self' so the page can reach /ai, and nothing else. A photo still has
  // nowhere to go: no other origin is reachable from this document.
  "connect-src 'self'",
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

  if (path === "/ai" && event.requestContext?.http?.method === "POST") {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    const ai = await handleAssist(raw);
    return {
      statusCode: ai.status,
      headers: {
        "content-type": ai.contentType,
        "cache-control": "no-store",
        "content-security-policy": CSP,
        "x-content-type-options": "nosniff",
      },
      body: ai.body,
    };
  }

  const url = event.rawQueryString ? `${path}?${event.rawQueryString}` : path;
  const withQuery = renderWithQuery(url);
  const { status, contentType, body } = withQuery ?? renderPath(path);

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
