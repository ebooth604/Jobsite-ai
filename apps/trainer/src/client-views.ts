/**
 * The two client surfaces: pick a client, then work through their photos.
 *
 * These live apart from `views.ts` because they are about *whose* photos these
 * are, where the library is about the photos themselves. The card markup is
 * shared — a photo looks the same wherever it is listed, and two copies of that
 * markup would drift the first time one of them gained a badge.
 */

import type { ClassifyAllResult } from "./api.js";
import { classifierAvailable, modelName } from "./classify.js";
import type { Client, ClientsProblem } from "./clients.js";
import { clientLabel } from "./clients.js";
import { isHandClassified, type Photo, tradeLabel } from "./photo.js";
import { escapeHtml, page, statTiles } from "./ui.js";
import {
  type ClientContext,
  clientsProblemNote,
  conditionChips,
  type Displayable,
  keyWarning,
  UNASSIGNED,
} from "./views.js";

/** Shared card markup, used by the library and by a client's profile. */
export function photoCards(photos: readonly Displayable[], clients: readonly Client[]): string {
  return photos
    .map((photo) => {
      const c = photo.classification;
      return `
<div class="card">
  <a href="/photo/${escapeHtml(photo.id)}">
    <img src="${escapeHtml(photo.url)}" alt="" loading="lazy">
  </a>
  <div class="card-body">
    <a href="/photo/${escapeHtml(photo.id)}" class="card-title">${escapeHtml(
      c?.scopeDescription || "Unclassified photo",
    )}</a>
    <div class="muted">${escapeHtml(clientLabel(clients, photo.clientRef))} · ${escapeHtml(
      photo.projectRef || "—",
    )} · ${escapeHtml(photo.area || "—")}</div>
    <div style="margin-top:6px">
      ${
        c
          ? `<span class="chip">${escapeHtml(tradeLabel(c.trade))}</span>`
          : '<span class="chip warning">unclassified</span>'
      }
      ${isHandClassified(c) ? '<span class="chip">by hand</span>' : ""}
      ${conditionChips(photo)}
    </div>
  </div>
</div>`;
    })
    .join("");
}

export function resultBanner(result: ClassifyAllResult | null): string {
  if (!result) return "";
  const failed = result.failed > 0 ? `, ${result.failed} failed` : "";
  const errors =
    result.errors.length > 0
      ? `<ul style="margin:8px 0 0 18px">${result.errors
          .map((e) => `<li>${escapeHtml(e)}</li>`)
          .join("")}</ul>`
      : "";
  return `<div class="note" style="margin-bottom:14px">
  <strong>Classified ${result.classified}${failed}.</strong>
  ${
    result.remaining > 0
      ? `${result.remaining} still unclassified — run it again to keep going.`
      : "Nothing left unclassified."
  }
  ${errors}
</div>`;
}

interface Tally {
  total: number;
  unclassified: number;
}

function tally(photos: readonly Photo[]): Map<string, Tally> {
  const counts = new Map<string, Tally>();
  for (const photo of photos) {
    const key = photo.clientRef || UNASSIGNED;
    const row = counts.get(key) ?? { total: 0, unclassified: 0 };
    row.total++;
    if (!photo.classification) row.unclassified++;
    counts.set(key, row);
  }
  return counts;
}

function clientRow(href: string, name: string, sub: string, row: Tally): string {
  return `<tr>
  <td><a href="${escapeHtml(href)}"><strong>${escapeHtml(name)}</strong></a>
    <div class="muted" style="font-size:13px">${escapeHtml(sub)}</div></td>
  <td>${row.total}</td>
  <td>${row.unclassified > 0 ? `<span class="chip warning">${row.unclassified}</span>` : "—"}</td>
  <td><a href="${escapeHtml(href)}">Open profile →</a></td>
</tr>`;
}

/**
 * The client picker — the app's front door.
 *
 * Unassigned is listed alongside the real clients rather than hidden behind a
 * filter. Every photo uploaded before clients existed is in it, and a pile of
 * unfiled work you cannot see is a pile nobody files.
 *
 * A ref that is on photos but not in the client list gets its own row too,
 * labelled as such. That is a client deleted from the tenant store while its
 * photos remained, and it should look wrong rather than disappear.
 */
export function clientsView(
  photos: readonly Photo[],
  ctx: ClientContext,
  storePath: string,
): string {
  const counts = tally(photos);
  const unassigned = counts.get(UNASSIGNED) ?? { total: 0, unclassified: 0 };

  const rows = ctx.clients
    .map((client) =>
      clientRow(
        `/client/${encodeURIComponent(client.slug)}`,
        client.name,
        client.slug,
        counts.get(client.id) ?? { total: 0, unclassified: 0 },
      ),
    )
    .join("");

  const orphans = [...counts.keys()]
    .filter((key) => key !== UNASSIGNED && !ctx.clients.some((c) => c.id === key))
    .map((ref) =>
      clientRow(
        `/client/${encodeURIComponent(ref)}`,
        ref,
        "not in the client list",
        counts.get(ref) ?? { total: 0, unclassified: 0 },
      ),
    )
    .join("");

  const empty = `<tr><td colspan="4" class="muted">No clients in the tenant store.
    Create one in the dashboard's admin console.</td></tr>`;

  const body = `
${keyWarning()}
${clientsProblemNote(ctx.problem)}
${statTiles([
  { label: "Clients", value: String(ctx.clients.length), note: "from the tenant store" },
  { label: "Photos", value: String(photos.length), note: "across every client" },
  {
    label: "Unassigned",
    value: String(unassigned.total),
    note: "not filed against a client",
    ...(unassigned.total > 0 ? { status: "warning" as const } : {}),
  },
])}

<div class="panel">
  <table>
    <thead><tr><th>Client</th><th>Photos</th><th>Unclassified</th><th></th></tr></thead>
    <tbody>
      ${rows || empty}
      ${orphans}
      ${clientRow(`/client/${UNASSIGNED}`, "Unassigned", "no client on the photo", unassigned)}
    </tbody>
  </table>
</div>

<p class="field-hint" style="margin-top:14px">
  Clients come from the same tenant store the dashboard signs people into, so a photo
  filed here means the same client there. Creating one is the admin console's job.
</p>`;

  return page({
    title: "Clients",
    path: "/",
    heading: "Clients",
    lede: "Pick a client to work through their photos.",
    storePath,
    photoCount: photos.length,
    body,
  });
}

export interface ClientViewArgs {
  clientRef: string;
  clientName: string;
  photos: readonly Displayable[];
  ctx: ClientContext;
  storePath: string;
  totalPhotos: number;
  result: ClassifyAllResult | null;
}

/**
 * One client's photos, and the work still outstanding on them.
 *
 * `clientName` is passed rather than resolved here so this still renders for a
 * ref that no longer matches a client — see `assignClient` in `api.ts`.
 */
export function clientView(args: ClientViewArgs): string {
  const { clientRef, clientName, photos, ctx, storePath, totalPhotos, result } = args;

  const unclassified = photos.filter((p) => !p.classification).length;
  const byHand = photos.filter((p) => isHandClassified(p.classification)).length;
  const withConditions = photos.filter((p) => (p.classification?.conditions.length ?? 0) > 0).length;

  // Unassigned is a bucket, not a client, so its scope is the empty ref.
  const scope = clientRef === UNASSIGNED ? "" : clientRef;

  const classifyAllForm =
    unclassified > 0 && classifierAvailable()
      ? `<form method="post" action="/classify-all" class="panel" style="margin-bottom:14px">
  <input type="hidden" name="clientRef" value="${escapeHtml(scope)}">
  <input type="hidden" name="returnTo" value="/client/${escapeHtml(clientRef)}">
  <button type="submit" class="btn primary">Classify ${Math.min(unclassified, 20)} photo(s)</button>
  <p class="field-hint" style="margin:6px 0 0">
    Sends this client's unclassified photos to ${escapeHtml(modelName())}, up to 20 at a
    time. Or open any photo and write the classification yourself.
  </p>
</form>`
      : "";

  const body = `
${keyWarning()}
${resultBanner(result)}
<p><a href="/">← All clients</a></p>

${statTiles([
  { label: "Photos", value: String(photos.length), note: "filed against this client" },
  {
    label: "Unclassified",
    value: String(unclassified),
    note: "no reading yet",
    ...(unclassified > 0 ? { status: "warning" as const } : {}),
  },
  { label: "By hand", value: String(byHand), note: "classified by a person" },
  {
    label: "With conditions",
    value: String(withConditions),
    note: "something is costing time",
    ...(withConditions > 0 ? { status: "warning" as const } : {}),
  },
])}

${classifyAllForm}

${
  photos.length === 0
    ? `<div class="empty">No photos for ${escapeHtml(clientName)} yet.
       <a href="/upload">Upload some</a>, or file an existing photo against this client
       from its photo page.</div>`
    : `<div class="grid">${photoCards(photos, ctx.clients)}</div>`
}`;

  return page({
    title: clientName,
    path: "/",
    heading: clientName,
    lede: "Every photo filed against this client. Open one to classify it by hand.",
    storePath,
    photoCount: totalPhotos,
    body,
  });
}
