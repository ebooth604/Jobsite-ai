/**
 * Admin routing and writes.
 *
 * **`requireAdmin` is the whole of this surface's security.** Everything here
 * crosses tenant boundaries by design, so there is exactly one check and it
 * happens before any handler runs. A signed-in non-admin gets a refusal page; a
 * request with no session at all gets sent to sign in.
 *
 * Writes are form posts rather than JSON, deliberately: this is a server-
 * rendered console with no client script, so there is no bundle to keep in step
 * and nothing to go stale between the form and the handler.
 */

import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as db from "@sitewireai/db";
import { deniedView, type OrgDetail, orgView, type OrgSummary, overviewView } from "./admin-console.js";
import type { Session } from "./auth.js";

export interface AdminResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const HTML = "text/html; charset=utf-8";

const html = (status: number, body: string): AdminResponse => ({
  status,
  headers: { "content-type": HTML, "cache-control": "no-store" },
  body,
});

const redirect = (to: string): AdminResponse => ({
  status: 303,
  headers: { location: to, "cache-control": "no-store" },
  body: "",
});

/** Carries a one-line result through the redirect that follows a write. */
function withMessage(path: string, message: string, bad = false): AdminResponse {
  const sep = path.includes("?") ? "&" : "?";
  return redirect(`${path}${sep}msg=${encodeURIComponent(message)}${bad ? "&bad=1" : ""}`);
}

function field(form: URLSearchParams, name: string, max = 200): string {
  return (form.get(name) ?? "").trim().slice(0, max);
}

function numberField(form: URLSearchParams, name: string): number | null {
  const raw = (form.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** A slug that is safe in a URL and in the `custom:orgId` binding on a user. */
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ---- the gate --------------------------------------------------------------

export type AdminGate = { ok: true; session: Session } | { ok: false; response: AdminResponse };

/**
 * The only authorization check on this surface.
 *
 * Signed out and not-an-admin are answered differently on purpose: a redirect
 * to sign in is useful when you simply are not logged in, and misleading when
 * you are logged in and still not allowed — that would loop you through a login
 * that changes nothing.
 */
export function requireAdmin(session: Session | null): AdminGate {
  if (!session) {
    return { ok: false, response: redirect("/login") };
  }
  if (!session.isAdmin) {
    return { ok: false, response: html(403, deniedView(session.email)) };
  }
  return { ok: true, session };
}

// ---- reads -----------------------------------------------------------------

async function summarise(): Promise<OrgSummary[]> {
  const orgs = await db.listOrgs();
  return Promise.all(
    orgs.map(async (org) => {
      const [projects, scopeItems, captures, hours] = await Promise.all([
        db.listProjects(org.id),
        db.listScopeItems(org.id),
        db.listCaptures(org.id),
        db.listHours(org.id),
      ]);
      return {
        org,
        projects: projects.length,
        scopeItems: scopeItems.length,
        captures: captures.length,
        hours: hours.length,
      };
    }),
  );
}

async function detailFor(orgId: string): Promise<OrgDetail | null> {
  const org = (await db.listOrgs()).find((o) => o.id === orgId);
  if (!org) return null;

  const [projects, scopeItems, captures, hours, estimates] = await Promise.all([
    db.listProjects(orgId),
    db.listScopeItems(orgId),
    db.listCaptures(orgId),
    db.listHours(orgId),
    db.listEstimates(orgId),
  ]);
  return { org, projects, scopeItems, captures, hours, estimates };
}

// ---- deletion of bytes -----------------------------------------------------

const BUCKET = process.env.SITEWIREAI_BUCKET ?? "";
let s3: S3Client | null = null;

/**
 * Removes a capture's photograph.
 *
 * Failure is swallowed on purpose: the record is already gone, and leaving the
 * row behind because an S3 call failed would be worse than an orphaned object.
 * The bucket's lifecycle rule expires noncurrent versions anyway.
 */
async function deleteImage(imageKey: string | null | undefined): Promise<void> {
  if (!imageKey || !BUCKET) return;
  try {
    if (!s3) s3 = new S3Client({});
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `images/${imageKey}` }));
  } catch {
    // Intentionally ignored — see above.
  }
}

// ---- routing ---------------------------------------------------------------

export async function handleAdmin(
  path: string,
  method: string,
  rawQuery: string,
  rawBody: string,
  session: Session | null,
): Promise<AdminResponse | null> {
  if (!path.startsWith("/admin")) return null;

  const gate = requireAdmin(session);
  if (!gate.ok) return gate.response;
  const { email } = gate.session;

  const params = new URLSearchParams(rawQuery);
  const message = params.get("msg") ?? "";
  const bad = params.get("bad") === "1";

  // ---- reads
  if (method === "GET" && (path === "/admin" || path === "/admin/")) {
    return html(200, overviewView(await summarise(), email, message));
  }

  if (method === "GET" && path.startsWith("/admin/org/")) {
    const orgId = decodeURIComponent(path.slice("/admin/org/".length));
    const detail = await detailFor(orgId);
    if (!detail) return html(404, overviewView(await summarise(), email, "No such organization.", ));
    return html(200, orgView(detail, email, message, bad));
  }

  if (method !== "POST") return null;

  const form = new URLSearchParams(rawBody);
  const orgId = field(form, "orgId");

  // ---- writes
  if (path === "/admin/org/create") {
    const name = field(form, "name");
    const slug = slugify(field(form, "slug") || name);
    if (!name || !slug) return withMessage("/admin", "A name and slug are both required.", true);

    if (await db.getOrgBySlug(slug)) {
      return withMessage("/admin", `The slug "${slug}" is already taken.`, true);
    }
    await db.saveOrg({ id: `org-${slug}`, name, slug });
    return withMessage("/admin", `Created ${name}.`);
  }

  const back = `/admin/org/${encodeURIComponent(orgId)}`;

  if (path === "/admin/project/create") {
    const name = field(form, "name");
    if (!orgId || !name) return withMessage(back, "A project name is required.", true);

    await db.saveProject(orgId, {
      id: `proj-${randomUUID().slice(0, 8)}`,
      name,
      address: field(form, "address"),
      province: field(form, "province", 2).toUpperCase(),
      dataRegion: "ca-central-1",
    });
    return withMessage(back, `Added ${name}.`);
  }

  if (path === "/admin/project/delete") {
    const projectId = field(form, "projectId");
    if (!orgId || !projectId) return withMessage(back, "Nothing to delete.", true);

    // Photographs go before the rows that name them; a row deleted first would
    // leave bytes nothing knows about.
    const captures = await db.listCaptures(orgId, projectId);
    for (const c of captures) await deleteImage(c.imageKey);

    const removed = await db.removeProjectCascade(orgId, projectId);
    return withMessage(
      back,
      `Deleted the project and ${removed.scopeItems} scope item(s), ${removed.captures} capture(s), ` +
        `${removed.hours} hours record(s) and ${removed.estimates} estimate(s).`,
    );
  }

  if (path === "/admin/scope/create") {
    const projectId = field(form, "projectId");
    const trade = field(form, "trade");
    const bidQuantity = numberField(form, "bidQuantity");
    const budgetedUnitsPerHour = numberField(form, "budgetedUnitsPerHour");

    if (!orgId || !projectId || !trade) {
      return withMessage(back, "Project and trade are required.", true);
    }
    if (bidQuantity === null || budgetedUnitsPerHour === null) {
      return withMessage(back, "Bid quantity and budgeted rate must be numbers.", true);
    }
    if (budgetedUnitsPerHour === 0) {
      // A factor is installed rate over budgeted rate. Zero here would divide by
      // zero on every reconciliation for this scope item.
      return withMessage(back, "Budgeted units per hour cannot be zero.", true);
    }

    await db.saveScopeItem(orgId, {
      id: `scope-${randomUUID().slice(0, 8)}`,
      projectId,
      trade,
      description: field(form, "description"),
      unitOfMeasure: field(form, "unitOfMeasure", 60),
      bidQuantity,
      budgetedUnitsPerHour,
    });
    return withMessage(back, `Added ${trade}.`);
  }

  if (path === "/admin/scope/delete") {
    const scopeItemId = field(form, "scopeItemId");
    if (!orgId || !scopeItemId) return withMessage(back, "Nothing to delete.", true);
    await db.removeEntity(orgId, "SCOPE", scopeItemId);
    return withMessage(back, "Scope item deleted.");
  }

  if (path === "/admin/hours/create") {
    const projectId = field(form, "projectId");
    const date = field(form, "date", 20);
    const hours = numberField(form, "hours");
    if (!orgId || !projectId || !date) {
      return withMessage(back, "Project and date are required.", true);
    }
    if (hours === null) return withMessage(back, "Hours must be a number.", true);

    const scopeItemId = field(form, "scopeItemId") || null;

    await db.saveHours(orgId, {
      id: `hrs-${randomUUID().slice(0, 8)}`,
      projectId,
      scopeItemId,
      date,
      hours,
      sourceSystem: field(form, "sourceSystem", 60) || "manual",
      // An unmapped record is flagged so the data-quality page can report it
      // rather than it silently vanishing from every factor.
      normalizationFlags: scopeItemId ? [] : ["unmapped_cost_code:manual-entry"],
    });
    return withMessage(back, scopeItemId ? "Hours recorded." : "Hours recorded, held back as unmapped.");
  }

  if (path === "/admin/capture/delete") {
    const captureId = field(form, "captureId");
    if (!orgId || !captureId) return withMessage(back, "Nothing to delete.", true);

    const capture = (await db.listCaptures(orgId)).find((c) => c.id === captureId);
    await deleteImage(capture?.imageKey);
    await db.removeEntity(orgId, "CAPTURE", captureId);
    await db.removeEntity(orgId, "ESTIMATE", `est-${captureId}`);
    return withMessage(back, "Capture deleted.");
  }

  return null;
}
