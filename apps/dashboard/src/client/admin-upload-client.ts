/**
 * The admin console's photo uploader.
 *
 * The console is otherwise server-rendered form posts with no client script, and
 * that is a property worth keeping. A file upload is the one thing that cannot be
 * done that way without either multipart parsing on the server or a hidden iframe,
 * so this is a deliberate exception rather than the thin end of a bundle.
 *
 * It reads the file, encodes it, and posts JSON — the same shape the capture
 * console posts — so the server side is `saveCapture`, unchanged, and an admin's
 * photo is classified by exactly the same path a client's is. Anything else would
 * be a second upload pipeline that drifts.
 */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

/** Reads a File as a base64 data URL, then strips the prefix the API rejects. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ""));
    reader.readAsDataURL(file);
  });
}

function start(): void {
  const form = document.getElementById("admin-upload");
  if (!form) return;

  const file = el<HTMLInputElement>("au-file");
  const button = el<HTMLButtonElement>("au-submit");
  const status = el<HTMLElement>("au-status");

  const say = (text: string, bad = false) => {
    status.textContent = text;
    status.className = bad ? "muted bad" : "muted";
  };

  file.addEventListener("change", () => {
    button.disabled = file.files === null || file.files.length === 0;
    say(file.files?.[0] ? `${file.files[0].name} ready.` : "");
  });

  button.addEventListener("click", () => {
    void (async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;

      button.disabled = true;
      say("Uploading and classifying — this takes a few seconds.");

      try {
        const response = await fetch("/admin/capture/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orgId: el<HTMLInputElement>("au-org").value,
            scopeItemId: el<HTMLSelectElement>("au-scope").value,
            area: el<HTMLInputElement>("au-area").value,
            capturedAt: el<HTMLInputElement>("au-date").value,
            origin: el<HTMLSelectElement>("au-origin").value,
            capturedBy: el<HTMLInputElement>("au-by").value,
            image: await readAsBase64(chosen),
          }),
        });

        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          captureId?: string;
          classified?: boolean;
        };

        if (!response.ok) {
          say(body.error ?? `Upload failed (${response.status}).`, true);
          button.disabled = false;
          return;
        }

        // The classifier is best-effort on the server, so say which happened
        // rather than implying a reading exists when it does not.
        say(
          body.classified
            ? "Uploaded and classified. Reloading."
            : "Uploaded. The classifier was unavailable — it can be classified later.",
        );
        window.location.reload();
      } catch (err) {
        say(err instanceof Error ? err.message : "Upload failed.", true);
        button.disabled = false;
      }
    })();
  });
}

start();
