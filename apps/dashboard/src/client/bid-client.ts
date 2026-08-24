/**
 * Bid upload and scope alignment — client-side.
 *
 * Two jobs, both of which the plan is explicit about:
 *
 *   1. Turn a bid export into scope items with a `budgeted_units_per_hour` rate.
 *      A line with zero bid hours yields NO rate — it does not yield infinity, and
 *      it does not yield zero. Those lines fall back to crew-relative trending,
 *      which the plan requires be designed in now rather than retrofitted (§13.2).
 *
 *   2. Map labour cost codes onto those scope items. Cost-code data from Jonas /
 *      Vista / Rhumbix is expected to be dirty (§7), so this is a mapping layer,
 *      not a naive direct join. Anything unmapped or ambiguous is surfaced and
 *      held back — never silently joined into a productivity factor (§11).
 */

interface BidRow {
  line: number;
  costCode: string;
  trade: string;
  description: string;
  unitOfMeasure: string;
  bidQuantity: number | null;
  bidHours: number | null;
  /** null when it cannot be derived — the crew-relative case, not an error. */
  budgetedUnitsPerHour: number | null;
  problems: string[];
}

interface HoursRow {
  costCode: string;
  hours: number;
  sourceSystem: string;
}

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

/** Labour cost codes as they arrive from the timekeeping export, dirt included. */
const incomingHours: HoursRow[] = JSON.parse(
  document.getElementById("incoming-hours")?.textContent ?? "[]",
);

let rows: BidRow[] = [];
/** cost code -> bid line number. The normalization layer, editable by the user. */
const mapping = new Map<string, number>();

const REQUIRED = ["cost_code", "trade", "description", "unit", "bid_quantity", "bid_hours"];

/** Minimal CSV reader: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

function toRows(table: string[][]): { rows: BidRow[]; fatal: string | null } {
  const header = table[0];
  if (!header) return { rows: [], fatal: "The file is empty." };

  const cols = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = REQUIRED.filter((r) => !cols.includes(r));
  if (missing.length) {
    return {
      rows: [],
      fatal: `Missing required column(s): ${missing.join(", ")}. Expected: ${REQUIRED.join(", ")}.`,
    };
  }

  const idx = (name: string) => cols.indexOf(name);
  const parsed: BidRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    if (!r) continue;
    const problems: string[] = [];

    const costCode = (r[idx("cost_code")] ?? "").trim();
    const trade = (r[idx("trade")] ?? "").trim();
    const description = (r[idx("description")] ?? "").trim();
    const unitOfMeasure = (r[idx("unit")] ?? "").trim();
    const bidQuantity = num(r[idx("bid_quantity")]);
    const bidHours = num(r[idx("bid_hours")]);

    if (!costCode) problems.push("no cost code — cannot be mapped to labour hours");
    if (!trade) problems.push("no trade");
    if (bidQuantity === null) problems.push("bid_quantity is not a number");
    else if (bidQuantity <= 0) problems.push("bid_quantity must be greater than zero");
    if (bidHours === null) problems.push("bid_hours is not a number");

    // The whole point: no rate rather than a fabricated one.
    let rate: number | null = null;
    if (bidQuantity !== null && bidHours !== null && bidQuantity > 0 && bidHours > 0) {
      rate = bidQuantity / bidHours;
    } else if (bidHours === 0) {
      problems.push("bid_hours is zero — no bid rate can be derived; crew-relative only");
    }

    parsed.push({
      line: i,
      costCode,
      trade,
      description,
      unitOfMeasure,
      bidQuantity,
      bidHours,
      budgetedUnitsPerHour: rate,
      problems,
    });
  }

  const seen = new Map<string, number>();
  for (const row of parsed) {
    if (!row.costCode) continue;
    const first = seen.get(row.costCode);
    if (first !== undefined) {
      row.problems.push(`duplicate cost code, also on line ${first} — ambiguous mapping`);
    } else {
      seen.set(row.costCode, row.line);
    }
  }

  return { rows: parsed, fatal: null };
}

function autoMap(): void {
  mapping.clear();
  const byCode = new Map<string, BidRow[]>();
  for (const row of rows) {
    if (!row.costCode) continue;
    const list = byCode.get(row.costCode) ?? [];
    list.push(row);
    byCode.set(row.costCode, list);
  }
  for (const incoming of incomingHours) {
    const matches = byCode.get(incoming.costCode.trim());
    // Only an unambiguous single match auto-maps. A duplicate code stays unmapped
    // and waits for a human, rather than picking the first row and moving on.
    if (matches && matches.length === 1 && matches[0]) {
      mapping.set(incoming.costCode, matches[0].line);
    }
  }
}

function rowByLine(line: number): BidRow | undefined {
  return rows.find((r) => r.line === line);
}

function render(): void {
  renderBid();
  renderAlignment();
}

function renderBid(): void {
  const host = $<HTMLDivElement>("#bid-table");
  if (rows.length === 0) {
    host.innerHTML = '<div class="empty">No bid loaded.</div>';
    return;
  }

  const body = rows
    .map((r) => {
      const rate =
        r.budgetedUnitsPerHour === null
          ? '<span class="muted">— no rate</span>'
          : r.budgetedUnitsPerHour.toFixed(2);
      const flags = r.problems.length
        ? `<ul class="probs">${r.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
        : '<span class="muted">—</span>';
      return `<tr class="${r.problems.length ? "bad" : ""}">
        <td>${r.line}</td>
        <td><code>${esc(r.costCode || "—")}</code></td>
        <td><strong>${esc(r.trade)}</strong><br><span class="muted">${esc(r.description)}</span></td>
        <td class="num">${r.bidQuantity ?? "—"} ${esc(r.unitOfMeasure)}</td>
        <td class="num">${r.bidHours ?? "—"}</td>
        <td class="num">${rate}</td>
        <td>${flags}</td>
      </tr>`;
    })
    .join("");

  const clean = rows.filter((r) => r.problems.length === 0).length;
  const noRate = rows.filter((r) => r.budgetedUnitsPerHour === null).length;

  host.innerHTML = `
    <div class="summary">
      <span><strong>${rows.length}</strong> line(s)</span>
      <span><strong>${clean}</strong> clean</span>
      <span><strong>${rows.length - clean}</strong> with problems</span>
      <span><strong>${noRate}</strong> without a derivable bid rate</span>
    </div>
    <div class="panel scroll"><table>
      <thead><tr><th>Line</th><th>Cost code</th><th>Scope</th>
      <th class="num">Bid qty</th><th class="num">Bid hrs</th>
      <th class="num">Units/hr</th><th>Problems</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

function renderAlignment(): void {
  const host = $<HTMLDivElement>("#alignment");
  if (rows.length === 0) {
    host.innerHTML = '<div class="empty">Load a bid to align cost codes.</div>';
    return;
  }

  const options = rows
    .map(
      (r) =>
        `<option value="${r.line}">${esc(r.costCode || `line ${r.line}`)} — ${esc(r.trade)} ${esc(
          r.description,
        )}</option>`,
    )
    .join("");

  let joinable = 0;
  let held = 0;

  const items = incomingHours
    .map((h) => {
      const line = mapping.get(h.costCode);
      const target = line === undefined ? undefined : rowByLine(line);
      const rateOk = target?.budgetedUnitsPerHour != null;
      if (target && rateOk) joinable++;
      else held++;

      const state = !target
        ? '<span class="tag bad">unmapped — held back</span>'
        : rateOk
          ? '<span class="tag ok">will join</span>'
          : '<span class="tag warn">mapped, but no bid rate — crew-relative only</span>';

      return `<div class="maprow">
        <div><code>${esc(h.costCode)}</code>
          <div class="muted">${h.hours} h · ${esc(h.sourceSystem)}</div></div>
        <select data-code="${esc(h.costCode)}">
          <option value="">— unmapped —</option>${options}
        </select>
        <div>${state}</div>
      </div>`;
    })
    .join("");

  host.innerHTML = `
    <div class="summary">
      <span><strong>${joinable}</strong> hours record(s) will join</span>
      <span><strong>${held}</strong> held back</span>
    </div>
    <div class="panel" style="padding:16px">${items}</div>`;

  for (const sel of host.querySelectorAll<HTMLSelectElement>("select[data-code]")) {
    const code = sel.dataset.code ?? "";
    sel.value = String(mapping.get(code) ?? "");
    sel.addEventListener("change", () => {
      if (sel.value === "") mapping.delete(code);
      else mapping.set(code, Number(sel.value));
      renderAlignment();
    });
  }
}

const esc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

function loadText(text: string): void {
  const { rows: parsed, fatal } = toRows(parseCsv(text));
  const err = $<HTMLParagraphElement>("#bid-error");

  if (fatal) {
    rows = [];
    mapping.clear();
    err.hidden = false;
    err.textContent = fatal;
    render();
    return;
  }

  err.hidden = true;
  rows = parsed;
  autoMap();
  render();
}

function init(): void {
  $<HTMLInputElement>("#bid-file").addEventListener("change", (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void file.text().then(loadText);
  });

  $("#load-sample").addEventListener("click", () => {
    const sample = $<HTMLScriptElement>("#sample-bid").textContent ?? "";
    loadText(sample);
  });

  render();
}

init();

// Loaded as <script type="module">. This marks the file a module so its
// top-level names stay local rather than colliding in the global scope.
export {};
