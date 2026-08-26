/**
 * Talking to the local detection sidecar.
 *
 * The sidecar is `services/prelabel` — YOLO11 on this machine, proposing boxes a
 * labeller then corrects. Everything here treats it as strictly optional: if it is
 * not running, every function returns a shape that says so, and the trainer carries
 * on. A labelling tool that cannot label because an accelerator is down has its
 * dependency the wrong way round.
 *
 * The timeout matters more than it looks. A labeller clicks "find people", and the
 * only two acceptable outcomes are boxes or a quick, clear "not available" — a
 * button that hangs for thirty seconds trains people to stop using it, and then the
 * assist is worse than not having built it.
 */

const SIDECAR = process.env.SITEWIREAI_PRELABEL_URL ?? "http://127.0.0.1:4181";

/** Long enough for a cold model load on a laptop CPU, short enough to give up. */
const DETECT_TIMEOUT_MS = 25_000;
const HEALTH_TIMEOUT_MS = 1_500;
/** Segmentation is about a second on a CPU. Generous, because a cold model load
 *  on first use is not. */
const SEGMENT_TIMEOUT_MS = 120_000;

export interface Proposal {
  className: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrelabelHealth {
  available: boolean;
  weights: string;
  classes: string[];
  knowsPeople: boolean;
  /** Why it is unavailable, in a sentence a labeller can act on. */
  reason: string;
}

export interface PrelabelResult {
  ok: boolean;
  model: string;
  proposals: Proposal[];
  /** True when the model has no class that answers the question that was asked. */
  unsupportedRequest: boolean;
  note: string;
  error: string;
}

async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${SIDECAR}${path}`, { ...init, signal: controller.signal });
  } catch {
    // Connection refused, DNS, abort — all the same answer to the caller: the
    // assist is not there. Distinguishing them would give a labeller a decision
    // they cannot act on differently.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function prelabelHealth(): Promise<PrelabelHealth> {
  const offline: PrelabelHealth = {
    available: false,
    weights: "",
    classes: [],
    knowsPeople: false,
    reason: `No detector at ${SIDECAR}. Start it: cd services/prelabel && uv run prelabel-server`,
  };

  const response = await call("/healthz", { method: "GET" }, HEALTH_TIMEOUT_MS);
  if (!response) return offline;

  const body = (await response.json().catch(() => ({}))) as {
    status?: string;
    weights?: string;
    classes?: unknown;
    knowsPeople?: boolean;
    error?: string;
  };

  if (!response.ok) {
    return { ...offline, reason: body.error ?? `Detector replied ${response.status}.` };
  }

  return {
    available: true,
    weights: body.weights ?? "unknown",
    classes: Array.isArray(body.classes)
      ? body.classes.filter((c): c is string => typeof c === "string")
      : [],
    knowsPeople: body.knowsPeople === true,
    reason: "",
  };
}

/**
 * Asks for boxes.
 *
 * `want` is either "people" — the redaction question intake asks — or "all", the
 * open question the region assist asks. They are separate because the honest
 * answer to the second one, with stock COCO weights, is "this model has never seen
 * a device box", and that has to come back as a stated fact rather than as an
 * empty list a labeller would read as "nothing there".
 */
export async function requestProposals(
  imageBase64: string,
  want: "people" | "all",
  confidence = 0.25,
): Promise<PrelabelResult> {
  const empty: PrelabelResult = {
    ok: false,
    model: "",
    proposals: [],
    unsupportedRequest: false,
    note: "",
    error: "",
  };

  const response = await call(
    "/detect",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: imageBase64, want, confidence }),
    },
    DETECT_TIMEOUT_MS,
  );

  if (!response) {
    return {
      ...empty,
      error: `No detector at ${SIDECAR}. Start it, or draw the boxes by hand.`,
    };
  }

  const body = (await response.json().catch(() => ({}))) as {
    model?: string;
    detections?: unknown;
    unsupportedRequest?: boolean;
    note?: string;
    error?: string;
  };

  if (!response.ok) {
    return { ...empty, error: body.error ?? `Detector replied ${response.status}.` };
  }

  return {
    ok: true,
    model: body.model ?? "unknown",
    proposals: parseProposals(body.detections),
    unsupportedRequest: body.unsupportedRequest === true,
    note: body.note ?? "",
    error: "",
  };
}

function parseProposals(value: unknown): Proposal[] {
  if (!Array.isArray(value)) return [];
  const proposals: Proposal[] = [];

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const numbers = ["confidence", "x", "y", "w", "h"].map((key) => r[key]);
    if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const className = typeof r.className === "string" ? r.className : "";
    if (!className) continue;

    const [confidence, x, y, w, h] = numbers as number[];
    // A zero-area proposal is noise, and one that lands outside the frame is a
    // decoding disagreement between the two processes worth dropping rather than
    // drawing somewhere misleading.
    if (w === undefined || h === undefined || w <= 0 || h <= 0) continue;
    if (x === undefined || y === undefined || x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) {
      continue;
    }

    proposals.push({
      className,
      confidence: confidence ?? 0,
      x,
      y,
      w: Math.min(w, 1 - x),
      h: Math.min(h, 1 - y),
    });
  }

  return proposals;
}

export interface SegmentedPolygon {
  points: [number, number][];
  score: number;
}

export interface SegmentResult {
  ok: boolean;
  model: string;
  polygons: SegmentedPolygon[];
  note: string;
  error: string;
}

/**
 * Stage two: hands a box to the segmenter and gets an outline back.
 *
 * The box arrives in the same normalised shape the detector emits, so a YOLO
 * proposal goes straight through without conversion — which is the point of the
 * two stages sharing a coordinate space.
 *
 * A longer timeout than detection, not because inference is slow — it is about a
 * second — but because the first call downloads and loads the weights.
 */
export async function requestSegmentation(
  imageBase64: string,
  box: { x: number; y: number; w: number; h: number },
): Promise<SegmentResult> {
  const empty: SegmentResult = { ok: false, model: "", polygons: [], note: "", error: "" };

  const response = await call(
    "/segment",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: imageBase64, boxes: [[box.x, box.y, box.w, box.h]] }),
    },
    SEGMENT_TIMEOUT_MS,
  );

  if (!response) {
    return { ...empty, error: `No segmenter at ${SIDECAR}. Trace it by hand, or start it.` };
  }

  const body = (await response.json().catch(() => ({}))) as {
    model?: string;
    polygons?: unknown;
    note?: string;
    error?: string;
  };

  if (!response.ok) {
    return { ...empty, error: body.error ?? `Segmenter replied ${response.status}.` };
  }

  return {
    ok: true,
    model: body.model ?? "unknown",
    polygons: parsePolygons(body.polygons),
    note: body.note ?? "",
    error: "",
  };
}

function parsePolygons(value: unknown): SegmentedPolygon[] {
  if (!Array.isArray(value)) return [];
  const polygons: SegmentedPolygon[] = [];

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.points)) continue;

    const points: [number, number][] = [];
    for (const point of r.points) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const [x, y] = point as unknown[];
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
    }

    // A traced outline that collapsed below a triangle is not a region.
    if (points.length < 3) continue;
    polygons.push({ points, score: typeof r.score === "number" ? r.score : 0 });
  }

  return polygons;
}

export const sidecarUrl = SIDECAR;
