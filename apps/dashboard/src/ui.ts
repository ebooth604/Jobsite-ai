/**
 * Layout shell, navigation, and the shared visual components.
 *
 * Status colours come from a fixed four-role palette (good / warning / critical).
 * They are never used to distinguish one scope item from another — that would make
 * a status colour impersonate a series. On the light surface `warning` sits below
 * 3:1 contrast by design, so every status mark ships an icon *and* a text label
 * *and* its numeric value, and every chart is backed by the same data as a table.
 * Colour never carries meaning alone here.
 */

export type StatusRole = "good" | "warning" | "critical";

/** Thresholds mirror detectDrift, so the chart and the alerts cannot disagree. */
export function statusFor(factor: number): StatusRole {
  if (factor < 0.7) return "critical";
  if (factor < 0.85) return "warning";
  return "good";
}

const STATUS_LABEL: Record<StatusRole, string> = {
  good: "On rate",
  warning: "Drifting",
  critical: "Critical",
};

// Simple geometric glyphs rather than emoji: they inherit currentColor, scale with
// the type, and render identically across the machines a demo might run on.
const STATUS_ICON: Record<StatusRole, string> = {
  good: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2 8.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 1.5l6.5 12h-13z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 6.5v3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="11.6" r="1" fill="currentColor"/></svg>',
  critical:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4.5v4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="11.4" r="1.05" fill="currentColor"/></svg>',
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

/** Icon + label + value. Never the colour on its own. */
export function statusPill(status: StatusRole, value: string): string {
  return [
    `<span class="pill ${status}">`,
    STATUS_ICON[status],
    `<span class="pill-value">${escapeHtml(value)}</span>`,
    `<span class="pill-label">${escapeHtml(STATUS_LABEL[status])}</span>`,
    "</span>",
  ].join("");
}

export interface StatTile {
  label: string;
  value: string;
  note: string;
  status?: StatusRole;
}

/**
 * A stat tile, not a chart: four unrelated single numbers have no shared scale, so
 * plotting them would invent a comparison that does not exist.
 */
export function statTiles(tiles: StatTile[]): string {
  const cards = tiles
    .map((t) => {
      const accent = t.status ? ` accent-${t.status}` : "";
      return [
        `<div class="tile${accent}">`,
        `<div class="tile-label">${escapeHtml(t.label)}</div>`,
        `<div class="tile-value">${escapeHtml(t.value)}</div>`,
        `<div class="tile-note">${escapeHtml(t.note)}</div>`,
        "</div>",
      ].join("");
    })
    .join("");
  return `<div class="tiles">${cards}</div>`;
}

export interface FactorBar {
  label: string;
  sublabel: string;
  factor: number;
}

/**
 * Horizontal bars against a reference line at 1.00 (bid rate).
 *
 * Horizontal because the category labels are trade descriptions — long text reads
 * straight rather than rotated. The reference line is the point of the chart: the
 * question is never "how big is this bar" but "which side of bid is it on".
 */
export function factorChart(bars: FactorBar[]): string {
  if (bars.length === 0) {
    return '<p class="muted">Nothing reconciled yet.</p>';
  }

  // Scale headroom so a factor above bid still has room to render.
  const max = Math.max(1.2, ...bars.map((b) => b.factor)) * 1.05;
  const pct = (v: number) => `${((v / max) * 100).toFixed(2)}%`;

  const rows = bars
    .map((b) => {
      const status = statusFor(b.factor);
      return [
        '<div class="bar-row">',
        '<div class="bar-label">',
        `<strong>${escapeHtml(b.label)}</strong>`,
        `<span class="muted">${escapeHtml(b.sublabel)}</span>`,
        "</div>",
        '<div class="bar-track">',
        `<div class="bar-fill ${status}" style="width:${pct(b.factor)}"></div>`,
        "</div>",
        `<div class="bar-value">${statusPill(status, b.factor.toFixed(2))}</div>`,
        "</div>",
      ].join("");
    })
    .join("");

  // The reference line is positioned by multiplying the track width by a UNITLESS
  // ratio. calc() cannot multiply a percentage by a percentage, and doing so is
  // silently wrong rather than an error — it lands the line a few pixels off the
  // value it claims to mark, which on this chart is the one thing that must be exact.
  // The 12px/24px terms are the grid gaps either side of the track column.
  const refRatio = (1 / max).toFixed(4);
  const refLeft = `calc(var(--label-w) + 12px + (100% - var(--label-w) - var(--value-w) - 24px) * ${refRatio})`;

  return [
    '<div class="chart">',
    '<div class="bars">',
    `<div class="chart-ref" style="left:${refLeft}"></div>`,
    rows,
    "</div>",
    '<div class="chart-legend">',
    '<span class="legend-line"></span> Bid rate (1.00) — bars left of this line are installing slower than bid',
    "</div>",
    "</div>",
  ].join("");
}

export interface NavItem {
  href: string;
  label: string;
}

export const NAV: NavItem[] = [
  { href: "/projects", label: "Dashboard" },
  { href: "/", label: "Overview" },
  { href: "/productivity", label: "Productivity" },
  { href: "/alerts", label: "Alerts" },
  { href: "/capture", label: "Capture" },
  { href: "/bid", label: "Bid alignment" },
  { href: "/data-quality", label: "Data quality" },
  { href: "/help", label: "Help" },
  { href: "/contact", label: "Contact" },
];

const STYLES = `
  :root {
    --bg: #f9f9f7; --panel: #ffffff; --ink: #0b0b0b; --ink-2: #52514e;
    --muted: #898781; --line: #e1e0d9;
    --good: #0ca30c; --warning: #fab219; --critical: #d03b3b;
    --accent: #2a78d6;
    --label-w: 240px; --value-w: 132px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d0d0d; --panel: #1c2024; --ink: #ffffff; --ink-2: #c3c2b7;
      --muted: #898781; --line: #2c2c2a;
      --accent: #3987e5;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }

  .topbar { background: var(--panel); border-bottom: 1px solid var(--line); }
  .topbar-inner { max-width: 1120px; margin: 0 auto; padding: 14px 20px 0;
    display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline;
    justify-content: space-between; }
  .brand { font-weight: 700; letter-spacing: -0.01em; font-size: 17px; }
  .brand span { color: var(--muted); font-weight: 400; margin-left: 8px;
    font-size: 13px; }
  nav { max-width: 1120px; margin: 0 auto; padding: 10px 20px 0;
    display: flex; gap: 4px; flex-wrap: wrap; }
  nav a { padding: 8px 14px 10px; text-decoration: none; color: var(--ink-2);
    font-size: 14px; border-bottom: 2px solid transparent; }
  nav a:hover { color: var(--ink); }
  nav a[aria-current="page"] { color: var(--ink); font-weight: 600;
    border-bottom-color: var(--accent); }

  .wrap { max-width: 1120px; margin: 0 auto; padding: 24px 20px 64px; }
  h1 { font-size: 21px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--muted); margin: 32px 0 12px; }
  .muted { color: var(--muted); }
  .lede { color: var(--ink-2); margin: 0 0 4px; max-width: 68ch; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 999px;
    border: 1px solid var(--line); font-size: 12px; color: var(--muted); }

  .banner { border: 1px solid var(--warning); border-left-width: 4px;
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    padding: 12px 14px; border-radius: 6px; margin: 16px 0 4px; }
  .banner strong { color: var(--ink); }

  .panel { background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 4px 16px 16px; }
  .note { background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 14px 16px; }
  .note ul { margin: 0; padding-left: 18px; }
  .note li { margin-bottom: 8px; }
  .note li:last-child { margin-bottom: 0; }
  .scroll { overflow-x: auto; }

  .tiles { display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  .tile { background: var(--panel); border: 1px solid var(--line);
    border-left-width: 3px; border-radius: 8px; padding: 14px 16px; }
  .tile.accent-good { border-left-color: var(--good); }
  .tile.accent-warning { border-left-color: var(--warning); }
  .tile.accent-critical { border-left-color: var(--critical); }
  .tile-label { font-size: 12px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); }
  .tile-value { font-size: 28px; font-weight: 650; letter-spacing: -0.02em;
    margin: 4px 0 2px; font-variant-numeric: tabular-nums; }
  .tile-note { font-size: 13px; color: var(--ink-2); }

  .chart { background: var(--panel);
    border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
  .bars { position: relative; }
  .bar-row { display: grid; align-items: center; gap: 12px;
    grid-template-columns: var(--label-w) 1fr var(--value-w);
    padding: 10px 0; }
  .bar-label { display: flex; flex-direction: column; font-size: 13px;
    line-height: 1.35; }
  .bar-label span { font-size: 12px; }
  .bar-track { position: relative; height: 14px; background: var(--bg);
    border-radius: 4px; }
  .bar-fill { height: 100%; border-radius: 4px; min-width: 3px; }
  .bar-fill.good { background: var(--good); }
  .bar-fill.warning { background: var(--warning); }
  .bar-fill.critical { background: var(--critical); }
  .bar-value { text-align: right; }
  .chart-ref { position: absolute; top: 4px; bottom: 4px; width: 0;
    border-left: 2px dashed var(--muted); pointer-events: none; }
  .chart-legend { margin-top: 10px; padding-top: 10px;
    border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  .legend-line { display: inline-block; width: 22px; vertical-align: middle;
    border-top: 2px dashed var(--muted); margin-right: 6px; }

  .pill { display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600;
    border: 1px solid currentColor; }
  .pill-value { font-variant-numeric: tabular-nums; font-size: 13px; }
  .pill-label { font-weight: 500; opacity: .85; }
  .pill.good { color: var(--good); }
  .pill.warning { color: #8a5b00; }
  .pill.critical { color: var(--critical); }
  @media (prefers-color-scheme: dark) {
    .pill.warning { color: var(--warning); }
  }

  table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 680px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase;
    letter-spacing: .05em; color: var(--muted); padding: 12px 8px;
    border-bottom: 1px solid var(--line); font-weight: 600; }
  td { padding: 12px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  .alert { border: 1px solid var(--line); border-left-width: 4px; border-radius: 6px;
    padding: 12px 14px; margin-bottom: 10px; background: var(--panel); }
  .alert.critical { border-left-color: var(--critical); }
  .alert.warning { border-left-color: var(--warning); }
  .alert-head { font-size: 12px; letter-spacing: .06em; color: var(--muted); }
  .alert-msg { font-weight: 600; margin: 4px 0 8px; }
  .conditions ul { margin: 6px 0 0; padding-left: 18px; }

  .empty { background: var(--panel); border: 1px dashed var(--line);
    border-radius: 8px; padding: 28px 16px; text-align: center; color: var(--muted); }
  code { font-size: 13px; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line);
    font-size: 13px; color: var(--muted); }

  #ai-toggle { position: fixed; right: 20px; bottom: 20px; z-index: 40;
    padding: 10px 16px; border-radius: 999px; border: 1px solid var(--accent);
    background: var(--accent); color: #fff; font: inherit; font-size: 14px;
    font-weight: 600; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.18); }
  /* display:flex below would otherwise beat the UA rule for [hidden], leaving the
     panel permanently open over the page. */
  #ai-panel[hidden] { display: none; }
  #ai-panel { position: fixed; right: 20px; bottom: 72px; z-index: 40;
    width: min(380px, calc(100vw - 40px)); background: var(--panel);
    border: 1px solid var(--line); border-radius: 10px; overflow: hidden;
    box-shadow: 0 6px 24px rgba(0,0,0,.18); display: flex; flex-direction: column; }
  .ai-head { padding: 10px 12px; font-size: 12px; color: var(--muted);
    border-bottom: 1px solid var(--line); }
  #ai-log { max-height: 300px; overflow-y: auto; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
  .ai-msg { padding: 8px 10px; border-radius: 8px; max-width: 92%; }
  .ai-msg.you { align-self: flex-end; background: var(--bg);
    border: 1px solid var(--line); }
  .ai-msg.assistant { align-self: flex-start;
    background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .ai-row { display: flex; gap: 8px; padding: 10px 12px;
    border-top: 1px solid var(--line); }
  .ai-row input { flex: 1; min-width: 0; padding: 8px 10px; font: inherit;
    font-size: 14px; color: var(--ink); background: var(--bg);
    border: 1px solid var(--line); border-radius: 6px; }
  .ai-row button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--accent);
    background: var(--accent); color: #fff; font: inherit; font-size: 14px;
    cursor: pointer; }
  .ai-row button:disabled { opacity: .5; cursor: not-allowed; }
  .ai-flash { animation: aiflash 1.6s ease-out; }
  @keyframes aiflash {
    0%, 40% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent); }
    100% { box-shadow: 0 0 0 0 transparent; }
  }

  @media (max-width: 720px) {
    :root { --label-w: 1fr; --value-w: auto; }
    .bar-row { grid-template-columns: 1fr; gap: 6px; }
    .bar-value { text-align: left; }
    .chart-ref { display: none; }
  }
`;

export interface PageOptions {
  title: string;
  path: string;
  heading: string;
  lede: string;
  projectName: string;
  dataRegion: string;
  body: string;
  footer: string;
}

export function page(opts: PageOptions): string {
  const navLinks = NAV.map((item) => {
    const current = item.href === opts.path ? ' aria-current="page"' : "";
    return `<a href="${item.href}"${current}>${escapeHtml(item.label)}</a>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>${STYLES}</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand">SiteWireAi<span>${escapeHtml(opts.projectName)}</span></div>
    <div>
      <span class="badge">Data region ${escapeHtml(opts.dataRegion)}</span>
    </div>
  </div>
  <nav>${navLinks}</nav>
</header>

<div class="wrap">
  <h1>${escapeHtml(opts.heading)}</h1>
  <p class="lede">${escapeHtml(opts.lede)}</p>

  <div class="banner">
    <strong>Simulated data.</strong> Every capture in this demo is
    <code>origin: "simulated"</code> — invented, not recorded on a jobsite. These
    pages show <em>how a productivity factor is derived</em>. No model-accuracy
    figure is reported anywhere: simulated captures may train a model and may never
    measure one, so an accuracy number computed here would be meaningless.
  </div>

  ${opts.body}

  <footer>${escapeHtml(opts.footer)}</footer>
</div>

<button type="button" id="ai-toggle" aria-expanded="false">Ask SiteWireAi</button>
<div id="ai-panel" hidden>
  <div class="ai-head">
    Assistant · fills forms and explains numbers. It never sets a quantity
    or an abstention — those stay yours.
  </div>
  <div id="ai-log"></div>
  <div class="ai-row">
    <input id="ai-input" type="text" autocomplete="off"
      placeholder="e.g. set the area to L5 north corridor">
    <button type="button" id="ai-send">Send</button>
  </div>
</div>
<script type="module" src="/assistant.js"></script>
</body>
</html>`;
}
