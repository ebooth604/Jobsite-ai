/**
 * The front door — what a signed-out visitor sees at `/`.
 *
 * Before this existed, `/` with no session rendered "this request could not be
 * matched to an organization", which is accurate and useless: it tells someone
 * who has an account nothing about where to sign in, and someone who does not
 * nothing about what this is.
 *
 * **Both doors lead to the same place.** There is one Cognito pool and one
 * hosted sign-in, and what you get afterwards is decided by your account — a
 * tenant binding lands you on your dashboard, membership of the `admins` group
 * lands you in the console. The two buttons are signposting, not two auth
 * systems, and the copy says so rather than implying a separation that does not
 * exist. If they ever do diverge, this is the file that should stop being
 * honest first.
 *
 * It uses its own shell rather than `page()`: that shell carries the product
 * navigation and the simulated-data banner, both of which are about the pages
 * behind the login, not the door itself.
 */

import { CONTACT_EMAIL } from "./emails.js";
import { escapeHtml } from "./ui.js";

const STYLES = `
  :root {
    --bg: #f9f9f7; --panel: #ffffff; --ink: #0b0b0b; --ink-2: #52514e;
    --muted: #898781; --line: #e1e0d9; --accent: #2a78d6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d0d0d; --panel: #1c2024; --ink: #ffffff; --ink-2: #c3c2b7;
      --muted: #898781; --line: #2c2c2a; --accent: #3987e5;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  a { color: var(--accent); }
  .topbar { background: var(--panel); border-bottom: 1px solid var(--line); }
  .topbar-inner { max-width: 960px; margin: 0 auto; padding: 16px 20px;
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .brand { font-weight: 700; font-size: 18px; letter-spacing: .01em; }
  .brand span { font-weight: 400; color: var(--muted); margin-left: 10px; font-size: 14px; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 56px 20px 40px; }
  h1 { font-size: 34px; line-height: 1.15; margin: 0 0 12px; }
  .lede { color: var(--ink-2); font-size: 18px; margin: 0 0 36px; max-width: 62ch; }
  .doors { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .door { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
    padding: 24px; display: flex; flex-direction: column; }
  .door h2 { font-size: 19px; margin: 0 0 8px; }
  .door p { color: var(--ink-2); font-size: 15px; margin: 0 0 20px; flex: 1; }
  .btn { display: inline-block; padding: 11px 18px; border-radius: 8px; font-size: 15px;
    font-weight: 600; text-decoration: none; text-align: center;
    background: var(--accent); color: #fff; border: 1px solid transparent; }
  .btn.secondary { background: transparent; color: var(--ink); border-color: var(--line); }
  .note { margin-top: 28px; background: var(--panel); border: 1px solid var(--line);
    border-left: 3px solid var(--accent); border-radius: 8px; padding: 14px 16px;
    font-size: 14px; color: var(--ink-2); }
  .note strong { color: var(--ink); }
  .more { margin-top: 32px; font-size: 14px; color: var(--ink-2); }
  .more a { margin-right: 16px; }
  footer { max-width: 960px; margin: 0 auto; padding: 24px 20px 48px;
    border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
`;

export function welcomeView(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SiteWireAi</title>
<style>${STYLES}</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand">SiteWireAi<span>Construction productivity</span></div>
    <div><a href="/help">How it works</a></div>
  </div>
</header>

<div class="wrap">
  <h1>What was installed, what it cost, and what got in the way.</h1>
  <p class="lede">
    Photographs from the crew become installed quantity, joined against labour hours
    and your bid rate. When work drifts below what you bid, you see it, along with the
    site conditions that explain it.
  </p>

  <div class="doors">
    <div class="door">
      <h2>Client sign-in</h2>
      <p>
        Your projects, productivity against bid, alerts, and the capture console for
        adding photos from site.
      </p>
      <a class="btn" href="/login">Sign in</a>
    </div>

    <div class="door">
      <h2>Admin sign-in</h2>
      <p>
        The console: every client, their projects and scope items, and the photo
        classification tooling.
      </p>
      <a class="btn secondary" href="/login">Sign in as admin</a>
    </div>
  </div>

  <div class="note">
    <strong>One sign-in serves both.</strong> Both buttons lead to the same page —
    your account decides where you land afterwards, so there is nothing to get wrong
    by picking the other one.
  </div>

  <p class="more">
    <a href="/capture/demo">See an annotated capture</a>
    <a href="/help">Help</a>
    <a href="/contact">Contact</a>
  </p>
</div>

<footer>
  SiteWireAi &middot; ${escapeHtml(CONTACT_EMAIL)} &middot; Canadian data residency,
  ca-central-1. Demo data throughout is simulated and labelled as such on every page
  behind the login.
</footer>
</body>
</html>`;
}
