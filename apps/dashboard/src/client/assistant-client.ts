/**
 * The assistant panel, present on every page.
 *
 * It applies what the model suggests to the *form*, never to the data. Filling a
 * field and submitting it are different acts, and only the second one is the
 * user's. Every applied field is flashed so it is obvious what changed.
 *
 * Photos are never part of a request. The panel sends the typed message and a
 * short page-context string; image bytes stay in the tab.
 */

interface AssistAction {
  type: "fill_capture_form" | "suggest_cost_code_mapping" | "navigate";
  fields?: Record<string, string>;
  costCode?: string;
  bidLine?: number;
  path?: string;
}

interface AssistResult {
  reply: string;
  actions: AssistAction[];
}

const el = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

function flash(node: HTMLElement): void {
  node.classList.add("ai-flash");
  window.setTimeout(() => node.classList.remove("ai-flash"), 1600);
}

/** Returns a human-readable note for each action actually applied. */
function apply(action: AssistAction): string | null {
  if (action.type === "navigate" && action.path) {
    window.location.href = action.path;
    return `Opening ${action.path}`;
  }

  if (action.type === "fill_capture_form" && action.fields) {
    const map: Record<string, string> = {
      scopeItemId: "#scope",
      area: "#area",
      capturedAt: "#captured-at",
      origin: "#origin",
    };
    const applied: string[] = [];
    for (const [key, value] of Object.entries(action.fields)) {
      const selector = map[key];
      if (!selector) continue;
      const field = el<HTMLInputElement | HTMLSelectElement>(selector);
      if (!field) continue;
      field.value = value;
      flash(field);
      applied.push(key);
    }
    return applied.length ? `Filled ${applied.join(", ")} — review before queueing.` : null;
  }

  if (action.type === "suggest_cost_code_mapping" && action.costCode) {
    const select = document.querySelector<HTMLSelectElement>(
      `.maprow select[data-code="${CSS.escape(action.costCode)}"]`,
    );
    if (!select) return null;
    select.value = String(action.bidLine ?? "");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flash(select);
    return `Suggested ${action.costCode} → line ${action.bidLine}. Change it if that is wrong.`;
  }

  return null;
}

function pageContext(): string {
  const path = window.location.pathname;
  const heading = document.querySelector("h1")?.textContent?.trim() ?? "";
  const summary =
    document.querySelector(".summary")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return [`path=${path}`, `heading=${heading}`, summary && `summary=${summary}`]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 600);
}

function addMessage(role: "you" | "assistant", text: string): void {
  const log = el<HTMLDivElement>("#ai-log");
  if (!log) return;
  const row = document.createElement("div");
  row.className = `ai-msg ${role}`;
  row.textContent = text;
  log.append(row);
  log.scrollTop = log.scrollHeight;
}

async function send(): Promise<void> {
  const input = el<HTMLInputElement>("#ai-input");
  const button = el<HTMLButtonElement>("#ai-send");
  if (!input || !button) return;

  const message = input.value.trim();
  if (!message) return;

  addMessage("you", message);
  input.value = "";
  button.disabled = true;
  input.disabled = true;

  try {
    const res = await fetch("/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, context: pageContext() }),
    });

    if (!res.ok) {
      addMessage("assistant", `Assistant unavailable (HTTP ${res.status}).`);
      return;
    }

    const data = (await res.json()) as AssistResult;
    addMessage("assistant", data.reply);

    for (const action of data.actions ?? []) {
      const note = apply(action);
      if (note) addMessage("assistant", note);
    }
  } catch (err) {
    addMessage("assistant", `Assistant unavailable — ${err instanceof Error ? err.message : err}`);
  } finally {
    button.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

function init(): void {
  const toggle = el<HTMLButtonElement>("#ai-toggle");
  const panel = el<HTMLDivElement>("#ai-panel");
  const button = el<HTMLButtonElement>("#ai-send");
  const input = el<HTMLInputElement>("#ai-input");
  if (!toggle || !panel || !button || !input) return;

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) input.focus();
  });

  button.addEventListener("click", () => {
    void send();
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      void send();
    }
  });
}

init();

// Loaded as <script type="module">. This marks the file a module so its
// top-level names stay local rather than colliding in the global scope.
export {};
