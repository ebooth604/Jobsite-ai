/**
 * Routing, expressed independently of how the request arrived.
 *
 * There are two front doors — a `node:http` server for local development and a
 * Lambda handler behind API Gateway — and they used to be one, which meant
 * deploying implied rewriting the routes. This module is the shared middle: it
 * takes a method, a path and a body, and returns a status, headers and a body.
 * Neither adapter knows anything about the other.
 *
 * Images are the one thing that does not route through here on AWS. `imageUrl()`
 * hands the browser a presigned S3 link and the bytes never enter this process —
 * see the note in `store.ts` about the 6 MB response cap.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignClient,
  type ClassifyAllResult,
  classifyAll,
  classifyPhoto,
  createPhoto,
  jsonType,
  removePhoto,
  saveClassification,
} from "./api.js";
import { classifierAvailable, modelName } from "./classify.js";
import { clientsView, clientView } from "./client-views.js";
import { clientLabel, findClient, loadClients } from "./clients.js";
import type { Photo } from "./photo.js";
import {
  getPhoto,
  imageUrl,
  listPhotos,
  mediaTypeFor,
  readImage,
  storeLocation,
  usingAws,
} from "./store.js";
import {
  type ClientContext,
  type Displayable,
  libraryView,
  photoView,
  UNASSIGNED,
  uploadView,
} from "./views.js";

export interface RouteRequest {
  method: string;
  path: string;
  body: string;
  /** Raw query string, without the "?". Used for the one-line result message. */
  query?: string;
}

export interface RouteResponse {
  status: number;
  headers: Record<string, string>;
  /** Base64 when `isBase64` — the Lambda adapter needs that distinction. */
  body: string;
  isBase64?: boolean;
}

const HTML = "text/html; charset=utf-8";

const html = (status: number, body: string): RouteResponse => ({
  status,
  headers: { "content-type": HTML, "cache-control": "no-store" },
  body,
});

const json = (status: number, body: unknown): RouteResponse => ({
  status,
  headers: { "content-type": jsonType, "cache-control": "no-store" },
  body: JSON.stringify(body),
});

const redirect = (to: string): RouteResponse => ({
  status: 303,
  headers: { location: to, "cache-control": "no-store" },
  body: "",
});

/** Only this name is servable. A request path never becomes a file path. */
const CLIENT_SCRIPTS: Record<string, string> = { "/upload.js": "upload-client.js" };

const HERE = dirname(fileURLToPath(import.meta.url));
const scriptCache = new Map<string, string>();

function clientScript(file: string): string {
  const cached = scriptCache.get(file);
  if (cached !== undefined) return cached;
  const text = readFileSync(join(HERE, "client", file), "utf8");
  scriptCache.set(file, text);
  return text;
}

/**
 * The last batch result, held until the next page render consumes it.
 *
 * Module state, which is only sound because a classify-all POST and the redirect
 * that follows it land on the same warm Lambda in practice. If it does not, the
 * batch still ran and the library still shows the new classifications — only the
 * summary banner is lost, which is the right thing to lose.
 */
let lastBatch: ClassifyAllResult | null = null;

/** Attaches a fetchable image URL to each photo, resolving presigned links once. */
async function displayable(photos: readonly Photo[]): Promise<Displayable[]> {
  return Promise.all(photos.map(async (p) => ({ ...p, url: await imageUrl(p.imageFile) })));
}

export async function route(req: RouteRequest): Promise<RouteResponse> {
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, "") : req.path;
  const { method } = req;

  const scriptFile = CLIENT_SCRIPTS[path];
  if (scriptFile) {
    return {
      status: 200,
      headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
      body: clientScript(scriptFile),
    };
  }

  if (path === "/healthz") {
    return json(200, {
      status: "ok",
      store: storeLocation(),
      backend: usingAws() ? "aws" : "local",
      photos: (await listPhotos()).length,
      model: modelName(),
      classifier: classifierAvailable() ? "ready" : "no ANTHROPIC_API_KEY",
    });
  }

  // Local only. On AWS the browser fetches images straight from S3.
  if (path.startsWith("/images/") && !usingAws()) {
    const file = path.slice("/images/".length);
    const bytes = await readImage(file);
    if (!bytes) return { status: 404, headers: { "content-type": "text/plain" }, body: "Not found." };
    return {
      status: 200,
      headers: {
        "content-type": mediaTypeFor(file),
        "cache-control": "private, max-age=31536000, immutable",
      },
      body: bytes.toString("base64"),
      isBase64: true,
    };
  }

  // ---- JSON API (the uploader) -------------------------------------------

  if (path === "/api/photos" && method === "POST") {
    const result = await createPhoto(req.body);
    return json(result.status, result.body);
  }

  if (path.startsWith("/api/photos/") && path.endsWith("/classify") && method === "POST") {
    const id = decodeURIComponent(path.slice("/api/photos/".length, -"/classify".length));
    const result = await classifyPhoto(id);
    return json(result.status, result.body);
  }

  // ---- form posts ---------------------------------------------------------

  if (path === "/classify-all" && method === "POST") {
    const form = new URLSearchParams(req.body);
    // An absent field means "everything"; a present-but-empty one means the
    // unassigned bucket, which is a real scope and not the same thing.
    const scope = form.has("clientRef") ? (form.get("clientRef") ?? "") : undefined;
    lastBatch = await classifyAll(scope);
    return redirect(form.get("returnTo") || "/library");
  }

  if (path.startsWith("/photo/") && method === "POST") {
    if (path.endsWith("/classify")) {
      const id = decodeURIComponent(path.slice("/photo/".length, -"/classify".length));
      await classifyPhoto(id);
      return redirect(`/photo/${encodeURIComponent(id)}`);
    }
    if (path.endsWith("/save")) {
      const id = decodeURIComponent(path.slice("/photo/".length, -"/save".length));
      const result = await saveClassification(id, new URLSearchParams(req.body));
      // A refusal has to reach the person who typed it. Redirecting on a 400
      // regardless would render as a successful save that quietly kept the old
      // reading — the one failure mode worse than an error message.
      const problem =
        result.status >= 400
          ? (result.body as { error?: string }).error ?? "That classification could not be saved."
          : "";
      const query = problem ? `?msg=${encodeURIComponent(problem)}` : "";
      return redirect(`/photo/${encodeURIComponent(id)}${query}`);
    }
    if (path.endsWith("/client")) {
      const id = decodeURIComponent(path.slice("/photo/".length, -"/client".length));
      const form = new URLSearchParams(req.body);
      await assignClient(id, form.get("clientRef") ?? "");
      return redirect(`/photo/${encodeURIComponent(id)}`);
    }
    if (path.endsWith("/delete")) {
      const id = decodeURIComponent(path.slice("/photo/".length, -"/delete".length));
      await removePhoto(id);
      return redirect("/");
    }
  }

  // ---- pages --------------------------------------------------------------

  const photos = await listPhotos();
  const { clients, problem } = await loadClients();
  const ctx: ClientContext = { clients, problem };

  if (path.startsWith("/photo/")) {
    const id = decodeURIComponent(path.slice("/photo/".length));
    const photo = await getPhoto(id);
    if (!photo) return html(404, libraryView(await displayable(photos), storeLocation(), null));
    const [one] = await displayable([photo]);
    if (!one) return html(404, libraryView(await displayable(photos), storeLocation(), null));
    const message = new URLSearchParams(req.query ?? "").get("msg") ?? "";
    return html(200, photoView(one, storeLocation(), photos.length, ctx, message));
  }

  // One client's photos. The path segment is a slug or an id, and both resolve
  // to the same profile — a link written either way lands somewhere sensible.
  if (path.startsWith("/client/")) {
    const ref = decodeURIComponent(path.slice("/client/".length));
    const batch = lastBatch;
    lastBatch = null;

    const client = findClient(clients, ref);
    const clientRef = ref === UNASSIGNED ? UNASSIGNED : (client?.id ?? ref);
    const mine =
      clientRef === UNASSIGNED
        ? photos.filter((p) => !p.clientRef)
        : photos.filter((p) => p.clientRef === clientRef);

    return html(
      200,
      clientView({
        clientRef,
        clientName: clientRef === UNASSIGNED ? "Unassigned" : clientLabel(clients, clientRef),
        photos: await displayable(mine),
        ctx,
        storePath: storeLocation(),
        totalPhotos: photos.length,
        result: batch,
      }),
    );
  }

  switch (path) {
    case "/":
      return html(200, clientsView(photos, ctx, storeLocation()));
    case "/library": {
      // Shown once, then cleared, so a refresh does not repeat a stale summary.
      const batch = lastBatch;
      lastBatch = null;
      return html(200, libraryView(await displayable(photos), storeLocation(), batch));
    }
    case "/upload":
      return html(200, uploadView(storeLocation(), photos.length, ctx));
    default:
      return html(404, libraryView(await displayable(photos), storeLocation(), null));
  }
}
