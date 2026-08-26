/**
 * The uploader — the only client-side script left in the app.
 *
 * It exists because two things genuinely need the browser: a file picker, and
 * reading each image's real dimensions before upload. Everything else in this
 * app is a server-rendered page.
 *
 * Uploads run one at a time. The old build did this to keep a CPU-bound redaction
 * render from queueing; the reason now is simpler — twenty parallel multi-megabyte
 * POSTs to a local server is a good way to hit the body limit on all of them at
 * once, and sequential gives an honest progress count.
 */

interface Picked {
  file: File;
  dataUrl: string;
  width: number;
  height: number;
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element: ${id}`);
  return node as T;
};

const drop = el<HTMLDivElement>("drop");
const fileInput = el<HTMLInputElement>("file");
const thumbs = el<HTMLDivElement>("thumbs");
const uploadButton = el<HTMLButtonElement>("upload");
const uploadStatus = el<HTMLSpanElement>("upload-status");
const classifyNow = el<HTMLInputElement>("classify-now");

const picked: Picked[] = [];

function readFile(file: File): Promise<Picked | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl) return resolve(null);
      const image = new Image();
      image.onerror = () => resolve(null);
      image.onload = () =>
        resolve({ file, dataUrl, width: image.naturalWidth, height: image.naturalHeight });
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function addFiles(files: FileList | null): Promise<void> {
  if (!files) return;
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    const entry = await readFile(file);
    if (entry) picked.push(entry);
  }
  render();
}

function render(): void {
  thumbs.replaceChildren();
  for (const [index, entry] of picked.entries()) {
    const wrap = document.createElement("div");
    wrap.className = "thumb";

    const img = document.createElement("img");
    img.src = entry.dataUrl;
    img.alt = "";
    wrap.appendChild(img);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "thumb-remove";
    remove.textContent = "×";
    remove.title = "Remove from batch";
    remove.addEventListener("click", () => {
      picked.splice(index, 1);
      render();
    });
    wrap.appendChild(remove);

    thumbs.appendChild(wrap);
  }

  uploadButton.disabled = picked.length === 0;
  uploadButton.textContent = picked.length > 0 ? `Upload ${picked.length}` : "Upload";
}

fileInput.addEventListener("change", () => {
  void addFiles(fileInput.files);
  fileInput.value = "";
});

drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("over");
  void addFiles(event.dataTransfer?.files ?? null);
});

async function uploadOne(entry: Picked): Promise<string | null> {
  const response = await fetch("/api/photos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image: entry.dataUrl,
      mime: entry.file.type || "image/jpeg",
      width: entry.width,
      height: entry.height,
      projectRef: el<HTMLInputElement>("project").value,
      area: el<HTMLInputElement>("area").value,
      capturedAt: el<HTMLInputElement>("captured-at").value,
      notes: el<HTMLTextAreaElement>("notes").value,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Upload failed (${response.status}).`);
  return body.id ?? null;
}

uploadButton.addEventListener("click", async () => {
  uploadButton.disabled = true;
  const total = picked.length;
  const failures: string[] = [];
  let done = 0;

  while (picked.length > 0) {
    const entry = picked[0];
    if (!entry) break;

    uploadStatus.textContent = `Uploading ${done + 1} of ${total}…`;

    try {
      const id = await uploadOne(entry);

      if (id && classifyNow.checked) {
        uploadStatus.textContent = `Classifying ${done + 1} of ${total}…`;
        // A classification failure must not lose the upload — the photo is
        // already stored and can be classified again from the library.
        const classified = await fetch(`/api/photos/${id}/classify`, { method: "POST" });
        if (!classified.ok) {
          const body = (await classified.json().catch(() => ({}))) as { error?: string };
          failures.push(body.error ?? "classification failed");
        }
      }

      picked.shift();
      done++;
      render();
      uploadButton.disabled = true;
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
      picked.shift();
      render();
      uploadButton.disabled = true;
    }
  }

  const problems = failures.length > 0 ? ` ${failures.length} problem(s): ${failures[0]}` : "";
  uploadStatus.textContent = `Uploaded ${done} of ${total}.${problems}`;
  uploadButton.disabled = picked.length === 0;

  if (done > 0 && failures.length === 0) {
    window.location.href = "/";
  }
});

render();
