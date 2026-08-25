/**
 * The annotated demo capture — what a capture looks like once the model has run.
 *
 * The photograph is real. Every number drawn on it is invented: sheet detections,
 * confidences, condition scores. Nobody measured this room, so the capture carries
 * `origin: "simulated"` and can never reach a held-out set or an accuracy figure
 * (technical plan §5.4d, §11).
 *
 * That combination — a real photo with invented numbers — is the most quotable
 * thing in the whole demo and the easiest to misread as measured performance. It
 * is labelled on the page, in the exhibit, and here.
 *
 * Coordinates are normalized 0–1 fractions of the image box, not pixels, so the
 * overlay survives any rendered size and does not depend on the source file's
 * exact dimensions.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetDetection extends Box {
  id: string;
  confidence: number;
}

export interface ConditionMarkup extends Box {
  id: string;
  type: string;
  label: string;
  confidence: number;
}

export interface DemoCapture {
  id: string;
  imagePath: string;
  fileName: string;
  projectId: string;
  scopeItemId: string;
  area: string;
  capturedAt: string;
  capturedBy: string;
  origin: "simulated";
  faceBlurStatus: "blurred" | "declared_no_people";
  modelVersion: string;
  /** Per-sheet detections the counting model would emit. */
  sheets: SheetDetection[];
  /** Secondary head output — what feeds the alerting engine (§5.6). */
  conditions: ConditionMarkup[];
  /** Wall planes the model segmented before counting. */
  planes: { id: string; label: string; box: Box }[];
}

/**
 * Back wall reads as a grid of taped sheets; left and right returns carry more.
 * Confidences are deliberately uneven — a detector that returns 0.95 on every
 * box is a detector nobody should trust, and a demo that shows that is lying
 * about how the technology behaves.
 */
const backWall: SheetDetection[] = [
  { id: "s1", x: 0.205, y: 0.1, w: 0.078, h: 0.27, confidence: 0.94 },
  { id: "s2", x: 0.29, y: 0.1, w: 0.078, h: 0.27, confidence: 0.92 },
  { id: "s3", x: 0.375, y: 0.1, w: 0.078, h: 0.27, confidence: 0.89 },
  { id: "s4", x: 0.46, y: 0.1, w: 0.078, h: 0.27, confidence: 0.91 },
  { id: "s5", x: 0.545, y: 0.1, w: 0.078, h: 0.27, confidence: 0.86 },
  { id: "s6", x: 0.63, y: 0.1, w: 0.075, h: 0.27, confidence: 0.72 },
  { id: "s7", x: 0.205, y: 0.385, w: 0.078, h: 0.27, confidence: 0.93 },
  { id: "s8", x: 0.29, y: 0.385, w: 0.078, h: 0.27, confidence: 0.9 },
  { id: "s9", x: 0.375, y: 0.385, w: 0.078, h: 0.27, confidence: 0.88 },
  { id: "s10", x: 0.46, y: 0.385, w: 0.078, h: 0.27, confidence: 0.87 },
  { id: "s11", x: 0.545, y: 0.385, w: 0.078, h: 0.27, confidence: 0.83 },
  { id: "s12", x: 0.63, y: 0.385, w: 0.075, h: 0.27, confidence: 0.69 },
];

const leftReturn: SheetDetection[] = [
  { id: "s13", x: 0.03, y: 0.13, w: 0.075, h: 0.34, confidence: 0.81 },
  { id: "s14", x: 0.115, y: 0.14, w: 0.06, h: 0.33, confidence: 0.76 },
  { id: "s15", x: 0.03, y: 0.48, w: 0.075, h: 0.31, confidence: 0.78 },
  { id: "s16", x: 0.115, y: 0.48, w: 0.06, h: 0.29, confidence: 0.7 },
];

const rightReturn: SheetDetection[] = [
  { id: "s17", x: 0.815, y: 0.11, w: 0.075, h: 0.33, confidence: 0.84 },
  { id: "s18", x: 0.9, y: 0.1, w: 0.075, h: 0.35, confidence: 0.8 },
  { id: "s19", x: 0.815, y: 0.45, w: 0.075, h: 0.3, confidence: 0.79 },
  { id: "s20", x: 0.9, y: 0.46, w: 0.075, h: 0.31, confidence: 0.74 },
];

export const DEMO_CAPTURE: DemoCapture = {
  id: "cap-demo-l4",
  imagePath: "/static/demo/drywall-l4.jpg",
  fileName: "drywall-l4.jpg",
  projectId: "proj-demo-1",
  scopeItemId: "scope-drywall-l4",
  area: "L4 north corridor",
  capturedAt: "2026-08-17",
  capturedBy: "user-foreman-a",
  origin: "simulated",
  // No people are in frame, so redaction had nothing to act on. That is recorded
  // as a declaration rather than left blank — silence is not the same as checked.
  faceBlurStatus: "declared_no_people",
  modelVersion: "drywall-v0.3-demo",
  sheets: [...backWall, ...leftReturn, ...rightReturn],
  planes: [
    { id: "p1", label: "Back wall", box: { x: 0.195, y: 0.085, w: 0.52, h: 0.58 } },
    { id: "p2", label: "Left return", box: { x: 0.02, y: 0.11, w: 0.165, h: 0.7 } },
    { id: "p3", label: "Right return", box: { x: 0.805, y: 0.085, w: 0.185, h: 0.71 } },
  ],
  conditions: [
    {
      id: "c1",
      type: "out_of_sequence",
      label: "Overhead mechanical incomplete above partition line",
      confidence: 0.77,
      x: 0.2,
      y: 0.005,
      w: 0.5,
      h: 0.075,
    },
    {
      id: "c2",
      type: "blocked_access",
      label: "Offcuts and debris across working floor",
      confidence: 0.64,
      x: 0.1,
      y: 0.66,
      w: 0.42,
      h: 0.19,
    },
    {
      id: "c3",
      type: "trade_damage_risk",
      label: "Unprotected standpipe adjacent to finished board",
      confidence: 0.58,
      x: 0.735,
      y: 0.03,
      w: 0.06,
      h: 0.63,
    },
  ],
};

/** Detections at or above this contribute to the count; below it they are shown but excluded. */
export const COUNT_THRESHOLD = 0.75;

export interface DemoTally {
  counted: number;
  belowThreshold: number;
  meanConfidence: number;
  abstained: boolean;
}

/**
 * What the counting head would report. Detections below the threshold are drawn
 * but not counted — showing them is the honest version, because a demo that hides
 * its low-confidence boxes implies a cleaner detector than exists.
 */
export function tally(capture: DemoCapture = DEMO_CAPTURE): DemoTally {
  const counted = capture.sheets.filter((s) => s.confidence >= COUNT_THRESHOLD);
  const below = capture.sheets.length - counted.length;
  const mean = counted.length
    ? counted.reduce((sum, s) => sum + s.confidence, 0) / counted.length
    : 0;

  return {
    counted: counted.length,
    belowThreshold: below,
    meanConfidence: Number(mean.toFixed(3)),
    // The real abstention rule is a tuned threshold on the aggregate, not this.
    abstained: counted.length === 0 || mean < 0.7,
  };
}
