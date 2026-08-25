/**
 * Contact form. Composes a mailto: rather than posting anywhere, because there is
 * no mail transport behind this yet and a form that silently drops a message is
 * worse than one that hands it to a mail client.
 */

const CONTACT_EMAIL = "info@sitewireai.com";

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const val = (id: string): string => $<HTMLInputElement>(`#${id}`)?.value.trim() ?? "";

function setError(field: string, message: string | null): void {
  const wrap = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
  if (!wrap) return;
  const err = wrap.querySelector<HTMLElement>(".err");
  wrap.classList.toggle("bad", Boolean(message));
  if (err) {
    err.hidden = !message;
    err.textContent = message ?? "";
  }
}

function init(): void {
  const form = $<HTMLFormElement>("#contact-form");
  const status = $<HTMLParagraphElement>("#contact-status");
  if (!form || !status) return;

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    for (const f of ["cName", "cEmail", "cMessage"]) setError(f, null);

    const problems: [string, string][] = [];
    if (!val("cName")) problems.push(["cName", "Please give us a name to reply to."]);
    const email = val("cEmail");
    if (!email) problems.push(["cEmail", "We need an email to reply to."]);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      problems.push(["cEmail", "That does not look like an email address."]);
    }
    if (!val("cMessage")) problems.push(["cMessage", "Tell us what you need."]);

    if (problems.length) {
      for (const [f, m] of problems) setError(f, m);
      status.textContent = "";
      document.querySelector(`[data-field="${problems[0]?.[0]}"]`)?.scrollIntoView({
        block: "center",
      });
      return;
    }

    const topic = val("cTopic") || "General enquiry";
    const company = val("cCompany");
    const bodyLines = [
      val("cMessage"),
      "",
      "—",
      `From: ${val("cName")}${company ? ` (${company})` : ""}`,
      `Reply to: ${email}`,
    ];

    const href =
      `mailto:${CONTACT_EMAIL}` +
      `?subject=${encodeURIComponent(`[${topic}] ${val("cName")}`)}` +
      `&body=${encodeURIComponent(bodyLines.join("\n"))}`;

    window.location.href = href;
    status.textContent = `Opening your mail client to ${CONTACT_EMAIL}. If nothing happens, email us directly.`;
  });
}

init();

// Loaded as <script type="module">. This marks the file a module so its
// top-level names stay local rather than colliding in the global scope.
export {};
