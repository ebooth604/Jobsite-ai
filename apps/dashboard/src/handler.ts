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

export const handler = async (event: FunctionUrlEvent): Promise<FunctionUrlResult> => {
  const path = event.rawPath ?? "/";

  if (path === "/healthz") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ok" }),
    };
  }

  const { status, html } = renderPath(path);

  return {
    statusCode: status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // The pages are self-contained: no external scripts, styles, or images, so
      // the policy can be this tight without breaking anything.
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
    body: html,
  };
};
