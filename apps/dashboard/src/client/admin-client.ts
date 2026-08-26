/**
 * Onboarding form behaviour.
 *
 * There is no database wired up yet, so this validates and produces a JSON record
 * you can save or paste into whatever comes next. It says that plainly rather than
 * showing a "Saved" toast that means nothing — a form that pretends to persist is
 * worse than one that admits it does not.
 */

interface OnboardingRecord {
  createdAt: string;
  organization: Record<string, string | number | null>;
  primaryContact: Record<string, string>;
  firstProject: Record<string, string>;
  scope: { trades: string[]; costCodeConvention: string; bidFormat: string };
  integrations: { photoSources: string[]; hoursSources: string[] };
  compliance: Record<string, boolean>;
  notes: string;
}

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

const val = (id: string): string => $<HTMLInputElement>(`#${id}`).value.trim();
const checked = (id: string): boolean => $<HTMLInputElement>(`#${id}`).checked;

const checkedValues = (name: string): string[] =>
  Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)).map(
    (i) => i.value,
  );

function setError(fieldId: string, message: string | null): void {
  const wrap = document.querySelector<HTMLElement>(`[data-field="${fieldId}"]`);
  if (!wrap) return;
  const err = wrap.querySelector<HTMLElement>(".err");
  wrap.classList.toggle("bad", Boolean(message));
  if (err) {
    err.hidden = !message;
    err.textContent = message ?? "";
  }
}

/** Returns field-id -> message. Empty means valid. */
function validate(): Record<string, string> {
  const problems: Record<string, string> = {};

  const required: [string, string][] = [
    ["legalName", "Legal name is required — it goes on the contract."],
    ["startDate", "Contract start date is required."],
    ["contactName", "A primary contact is required."],
    ["contactEmail", "An email is required."],
    ["projectName", "First project name is required."],
    ["projectAddress", "Project address is required."],
  ];

  for (const [id, message] of required) {
    if (!val(id)) problems[id] = message;
  }

  const email = val("contactEmail");
  // Deliberately loose: the only reliable email validation is sending one, and a
  // strict regex rejects addresses that are perfectly valid.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.contactEmail = "That does not look like an email address.";
  }

  const headcount = val("orgSize");
  if (headcount && (!Number.isFinite(Number(headcount)) || Number(headcount) < 1)) {
    problems.orgSize = "Headcount should be a positive number.";
  }

  if (checkedValues("trades").length === 0) {
    problems.trades = "At least one trade must be in scope.";
  }

  const start = val("startDate");
  const siteStart = val("projectStart");
  if (start && siteStart && siteStart < start) {
    problems.projectStart = "Site start is before the contract start — check which is right.";
  }

  return problems;
}

function build(): OnboardingRecord {
  const headcount = val("orgSize");
  return {
    createdAt: new Date().toISOString(),
    organization: {
      legalName: val("legalName"),
      tradeName: val("tradeName"),
      province: val("province"),
      dataRegion: val("dataRegion"),
      fieldHeadcount: headcount ? Number(headcount) : null,
      contractStart: val("startDate"),
    },
    primaryContact: {
      name: val("contactName"),
      role: val("contactRole"),
      email: val("contactEmail"),
      phone: val("contactPhone"),
    },
    firstProject: {
      name: val("projectName"),
      address: val("projectAddress"),
      province: val("projectProvince"),
      siteStart: val("projectStart"),
    },
    scope: {
      trades: checkedValues("trades"),
      costCodeConvention: val("costCodeConvention"),
      bidFormat: val("bidFormat"),
    },
    integrations: {
      photoSources: checkedValues("photoSources"),
      hoursSources: checkedValues("hoursSources"),
    },
    compliance: {
      workerNoticeIssued: checked("workerNotice"),
      privacyReviewComplete: checked("privacyReview"),
      offshoreProcessingDisclosed: checked("offshoreProcessing"),
    },
    notes: val("notes"),
  };
}

let lastRecord: OnboardingRecord | null = null;

function init(): void {
  const form = $<HTMLFormElement>("#onboard");
  const out = $<HTMLDivElement>("#admin-out");
  const summary = $<HTMLParagraphElement>("#admin-summary");
  const json = $<HTMLPreElement>("#admin-json");
  const download = $<HTMLButtonElement>("#download");

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();

    for (const id of [
      "legalName",
      "startDate",
      "contactName",
      "contactEmail",
      "projectName",
      "projectAddress",
      "orgSize",
      "projectStart",
      "trades",
    ]) {
      setError(id, null);
    }

    const problems = validate();
    const ids = Object.keys(problems);

    if (ids.length > 0) {
      for (const [id, message] of Object.entries(problems)) setError(id, message);
      out.hidden = false;
      summary.className = "bad";
      summary.textContent = `${ids.length} field(s) need attention before this record is usable.`;
      json.textContent = "";
      download.hidden = true;
      document.querySelector(`[data-field="${ids[0]}"]`)?.scrollIntoView({ block: "center" });
      return;
    }

    lastRecord = build();
    out.hidden = false;
    summary.className = "ok";
    summary.textContent =
      "Record complete. Not saved anywhere — there is no database wired up yet, so copy or download it.";
    json.textContent = JSON.stringify(lastRecord, null, 2);
    download.hidden = false;
  });

  download.addEventListener("click", () => {
    if (!lastRecord) return;
    const blob = new Blob([JSON.stringify(lastRecord, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug =
      String(lastRecord.organization.legalName ?? "client")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "client";
    a.href = url;
    a.download = `onboarding-${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

init();

// Loaded as <script type="module">. This marks the file a module so its
// top-level names stay local rather than colliding in the global scope.
export {};
