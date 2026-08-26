/**
 * Layout shell and shared visual pieces for the trainer.
 *
 * Visually this is the dashboard's language — same palette, same type scale — so
 * that moving between the two does not feel like moving between two products. It
 * does not import the dashboard's `ui.ts`, though: that module carries the demo's
 * "simulated data" banner and its navigation, and a labelling tool that quietly
 * inherited a banner about invented data would be actively misleading. The overlap
 * is a stylesheet, and a stylesheet is cheap to have twice.
 *
 * The one deliberate difference is the header. This app holds photographs of real
 * jobsites and real people's workplaces, and where they are stored is the fact a
 * user most needs in front of them at all times.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

/** JSON destined for a `type="application/json"` block. Data, never code. */
export const jsonBlock = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

const NAV: readonly { href: string; label: string }[] = [
  { href: "/", label: "Library" },
  { href: "/intake", label: "Intake" },
  { href: "/assist", label: "Assist" },
  { href: "/review", label: "Review queue" },
  { href: "/coverage", label: "Coverage" },
  { href: "/export", label: "Export" },
  { href: "/integrity", label: "Integrity" },
];

const STYLES = `
  :root {
    --bg: #10131a; --panel: #171c26; --line: #2b3242; --ink: #e8ecf3;
    --ink-2: #b6c0d0; --muted: #8792a5; --accent: #4c8dff;
    --good: #35b37e; --warning: #e2a03f; --critical: #e5484d;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--accent); }
  code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .92em; }

  .topbar { border-bottom: 1px solid var(--line); background: var(--panel); }
  .topbar-inner { display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    padding: 12px 24px; }
  .brand { font-weight: 700; letter-spacing: .01em; }
  .brand span { font-weight: 400; color: var(--muted); margin-left: 10px; }
  .badge { display: inline-block; margin-left: 8px; padding: 3px 9px; font-size: 12px;
    border: 1px solid var(--line); border-radius: 999px; color: var(--ink-2); }
  .badge.path { font-family: ui-monospace, Consolas, monospace; }
  nav { display: flex; gap: 4px; padding: 0 16px; flex-wrap: wrap; }
  nav a { padding: 9px 12px; font-size: 14px; text-decoration: none; color: var(--ink-2);
    border-bottom: 2px solid transparent; }
  nav a:hover { color: var(--ink); }
  nav a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--accent); }

  .wrap { max-width: 1180px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  h2 { font-size: 18px; margin: 28px 0 10px; }
  h3 { font-size: 15px; margin: 18px 0 8px; }
  .lede { color: var(--ink-2); margin: 0 0 18px; max-width: 74ch; }
  .muted { color: var(--muted); }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line);
    color: var(--muted); font-size: 13px; }

  .note { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--accent);
    border-radius: 8px; padding: 14px 16px; font-size: 14px; color: var(--ink-2); }
  .note strong { color: var(--ink); }
  .note.warn { border-left-color: var(--warning); }
  .note.stop { border-left-color: var(--critical); }

  .tiles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 8px; }
  .tile { background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 14px 16px; }
  .tile-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted); }
  .tile-value { font-size: 26px; font-weight: 700; margin: 4px 0 2px; }
  .tile-note { font-size: 12px; color: var(--muted); }
  .tile.accent-good { border-left: 3px solid var(--good); }
  .tile.accent-warning { border-left: 3px solid var(--warning); }
  .tile.accent-critical { border-left: 3px solid var(--critical); }

  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line);
    vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

  .chip { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 9px; border-radius: 999px;
    border: 1px solid var(--line); font-size: 11px; color: var(--ink-2); white-space: nowrap; }
  .chip.good { border-color: var(--good); color: var(--good); }
  .chip.warning { border-color: var(--warning); color: var(--warning); }
  .chip.critical { border-color: var(--critical); color: var(--critical); }
  .chip.sim { border-color: var(--warning); color: var(--warning); }

  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    overflow: hidden; text-decoration: none; color: inherit; display: block; }
  .card:hover { border-color: var(--accent); }
  .card img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block;
    background: #0b0e14; }
  .card-body { padding: 10px 12px; font-size: 13px; }
  .card-body strong { display: block; font-size: 14px; margin-bottom: 2px; }

  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 16px; }
  .field { margin-bottom: 12px; }
  .field label { display: block; font-size: 11px; text-transform: uppercase;
    letter-spacing: .06em; color: var(--muted); margin-bottom: 4px; }
  .field input, .field select, .field textarea { width: 100%; padding: 8px 10px; font: inherit;
    font-size: 14px; color: var(--ink); background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; }
  .field textarea { min-height: 68px; resize: vertical; }
  .field input:disabled, .field select:disabled { opacity: .45; }
  .field-hint { font-size: 12px; color: var(--muted); margin: 4px 0 0; }
  .row { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  .check { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; margin-bottom: 10px; }
  .check input { margin-top: 3px; }
  .check label { font-size: 14px; color: var(--ink); }

  button { font: inherit; }
  .btn { display: inline-block; padding: 8px 14px; border: 1px solid var(--line);
    border-radius: 6px; background: var(--bg); color: var(--ink); cursor: pointer;
    font-size: 14px; text-decoration: none; }
  .btn:hover { border-color: var(--accent); }
  .btn.primary { border-color: var(--accent); background: var(--accent); color: #fff;
    font-weight: 600; }
  .btn.danger { color: var(--critical); border-color: var(--critical); }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .btn.on { border-color: var(--accent); color: var(--accent); }
  .btnrow { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  .gate { font-size: 13px; border-radius: 6px; padding: 10px 12px; margin: 12px 0; }
  .gate.ok { border: 1px solid var(--good);
    background: color-mix(in srgb, var(--good) 10%, transparent); }
  .gate.todo { border: 1px solid var(--critical);
    background: color-mix(in srgb, var(--critical) 10%, transparent); }
  .gate ul { margin: 6px 0 0 18px; padding: 0; }

  .bar { height: 8px; border-radius: 999px; background: #0b0e14; overflow: hidden;
    border: 1px solid var(--line); min-width: 90px; }
  .bar > span { display: block; height: 100%; background: var(--accent); }
  .bar > span.warning { background: var(--warning); }
  .bar > span.critical { background: var(--critical); }
  .bar > span.good { background: var(--good); }

  .empty { color: var(--muted); background: var(--panel); border: 1px dashed var(--line);
    border-radius: 8px; padding: 22px; text-align: center; }
`;

export interface PageOptions {
  title: string;
  path: string;
  heading: string;
  lede: string;
  storePath: string;
  sampleCount: number;
  body: string;
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
<title>${escapeHtml(opts.title)} · SiteWireAi trainer</title>
<style>${STYLES}</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand">SiteWireAi<span>training corpus</span></div>
    <div style="margin-left:auto">
      <span class="badge">${opts.sampleCount} samples</span>
      <span class="badge path" title="Every photo and label lives here">${escapeHtml(opts.storePath)}</span>
    </div>
  </div>
  <nav>${navLinks}</nav>
</header>

<div class="wrap">
  <h1>${escapeHtml(opts.heading)}</h1>
  <p class="lede">${escapeHtml(opts.lede)}</p>
  ${opts.body}
  <footer>
    Local tool · runs on 127.0.0.1 · photos are redacted in the browser before they
    reach disk · nothing here is uploaded anywhere
  </footer>
</div>
</body>
</html>`;
}

export interface StatTile {
  label: string;
  value: string;
  note: string;
  status?: "good" | "warning" | "critical";
}

export function statTiles(tiles: readonly StatTile[]): string {
  return `<div class="tiles">${tiles
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
    .join("")}</div>`;
}

/** A proportion bar with its number beside it. Colour never carries meaning alone. */
export function proportionBar(
  value: number,
  total: number,
  status?: "good" | "warning" | "critical",
): string {
  const share = total === 0 ? 0 : Math.min(1, value / total);
  const cls = status ? ` class="${status}"` : "";
  return [
    '<div style="display:flex;gap:8px;align-items:center">',
    `<div class="bar"><span${cls} style="width:${(share * 100).toFixed(1)}%"></span></div>`,
    `<span class="muted" style="font-size:12px">${value}/${total}</span>`,
    "</div>",
  ].join("");
}
