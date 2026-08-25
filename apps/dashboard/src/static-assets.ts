/**
 * Static asset serving, shared by the local server and the Lambda.
 *
 * This lives outside admin.ts deliberately: admin is stripped from the deployment
 * bundle, and anything it owned would vanish with it. The demo capture ships now,
 * so its image has to be served by code that ships too.
 *
 * The asset root differs between the two environments. Locally the compiled files
 * sit in `dist/` with `static/` beside it; in the bundle everything is flattened
 * into the task root with `static/` inside it. Rather than encode an assumption
 * about which, both are checked.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Bundle layout first (static/ inside the task root), then local (dist/../static). */
const CANDIDATE_ROOTS = [join(HERE, "static"), join(HERE, "..", "static")];

function staticRoot(): string | null {
  for (const root of CANDIDATE_ROOTS) {
    if (existsSync(root)) return root;
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

const DEMO_BASENAME = "drywall-l4";

/**
 * The demo photo's extension is whatever the source happened to be. Stock photos
 * are routinely WebP behind a .jpg name, and serving those bytes as image/jpeg is
 * the kind of thing that works in one browser and not the next — so resolve the
 * real file and let its extension pick the content type.
 */
export function resolveDemoImage(): string | null {
  const root = staticRoot();
  if (!root) return null;
  for (const ext of Object.keys(CONTENT_TYPES)) {
    if (existsSync(join(root, "demo", DEMO_BASENAME + ext))) {
      return `/static/demo/${DEMO_BASENAME}${ext}`;
    }
  }
  return null;
}

export interface StaticAsset {
  body: Buffer;
  contentType: string;
}

/**
 * Reads a file under the static root. Traversal is blocked by resolving and then
 * checking containment, rather than by filtering ".." — which misses encodings.
 */
export function readStatic(urlPath: string): StaticAsset | null {
  const root = staticRoot();
  if (!root) return null;

  const rel = urlPath.replace(/^\/static\//, "");
  const full = resolve(root, rel);
  if (!full.startsWith(resolve(root))) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;

  const contentType = CONTENT_TYPES[full.slice(full.lastIndexOf(".")).toLowerCase()];
  if (!contentType) return null;

  return { body: readFileSync(full), contentType };
}
