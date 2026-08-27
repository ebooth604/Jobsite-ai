/**
 * The Lambda handler — API Gateway in front, `router.ts` behind.
 *
 * This file exists to do two things the local server does not: adapt API
 * Gateway's payload shape, and refuse the request when nobody has authenticated.
 *
 * **On the authentication here.** It is HTTP Basic against a single shared
 * credential held in Secrets Manager. That is a deliberately modest mechanism —
 * no accounts, no per-user identity, no revocation short of rotating the secret —
 * chosen because the alternative on the table was deploying with no gate at all
 * over unredacted photographs of identifiable workers. It is the floor, not the
 * finish: §3 of the technical plan calls for Cognito, and when a second person
 * needs their own login this should be replaced rather than extended.
 */

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { route } from "./router.js";

interface ApiGatewayEvent {
  requestContext?: { http?: { method?: string; path?: string } };
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface ApiGatewayResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

const SECRET_ID = process.env.SITEWIREAI_SECRET_ID ?? "";

let secrets: SecretsManagerClient | null = null;

/**
 * Cached across invocations on purpose.
 *
 * A Secrets Manager read per request would add latency and cost to every page
 * view for a value that changes when someone deliberately rotates it. The trade
 * is that a rotation takes effect when the execution environment recycles rather
 * than instantly — acceptable for a shared password, and the reason this is not
 * the mechanism to reach for once real accounts exist.
 */
let cached: { user: string; password: string; apiKey: string } | null = null;

async function loadSecret(): Promise<{ user: string; password: string; apiKey: string } | null> {
  if (cached) return cached;
  if (!SECRET_ID) return null;

  if (!secrets) secrets = new SecretsManagerClient({});
  const result = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  if (!result.SecretString) return null;

  const parsed = JSON.parse(result.SecretString) as Record<string, unknown>;
  cached = {
    user: typeof parsed.username === "string" ? parsed.username : "",
    password: typeof parsed.password === "string" ? parsed.password : "",
    apiKey: typeof parsed.anthropic_api_key === "string" ? parsed.anthropic_api_key : "",
  };

  // The classifier reads its key from the environment. Putting it there once, on
  // the first request, keeps the key out of the function's configuration — where
  // it would be visible to anyone with console read access.
  if (cached.apiKey) process.env.ANTHROPIC_API_KEY = cached.apiKey;
  return cached;
}

/** Constant-time-ish compare. Not a defence against a remote timing attack over
 *  the internet, but it costs nothing and avoids the habit of `===` on secrets. */
function matches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function unauthorized(): ApiGatewayResult {
  return {
    statusCode: 401,
    headers: {
      "www-authenticate": 'Basic realm="SiteWireAi", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
    body: "Authentication required.",
  };
}

export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResult> {
  const method = event.requestContext?.http?.method ?? "GET";
  const path = event.requestContext?.http?.path ?? event.rawPath ?? "/";

  const secret = await loadSecret();

  // Fail closed. A missing or unreadable secret means the gate cannot be checked,
  // and the only safe reading of that is "nobody gets in" — never "let everyone
  // in because the lock is broken".
  if (!secret || !secret.password) {
    return {
      statusCode: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      body: "Authentication is not configured. Refusing to serve.",
    };
  }

  const header = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return unauthorized();

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return unauthorized();

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  if (!matches(user, secret.user) || !matches(password, secret.password)) {
    return unauthorized();
  }

  const body = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  const result = await route({ method, path, body, query: event.rawQueryString ?? "" });

  return {
    statusCode: result.status,
    headers: result.headers,
    body: result.body,
    ...(result.isBase64 ? { isBase64Encoded: true } : {}),
  };
}
