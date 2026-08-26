"""Stage two: instance segmentation with YOLO11.

This replaced SAM 2, deliberately, and the reasons are worth keeping written down
because the trade is not all in one direction.

**Why SAM went.** It took roughly eleven seconds per box on this CPU. A labeller
confirming geometry makes a hundred decisions in a session, and an eleven-second
wait between each one is not a slow tool, it is an unused tool. YOLO11's
segmentation variant does the same job in well under a second because it is one
forward pass rather than a promptable model reasoning about arbitrary masks.

**What YOLO11-seg also buys.** It detects *and* segments in the same pass, so
stages one and two collapse into one model call rather than a handoff — no boxes
crossing a socket twice, no second image encode, one set of weights to fine-tune.
And its masks arrive already labelled, because it knows its classes; SAM returned
a shape with no idea what it was.

**What was lost, honestly.** SAM segments *anything* — it needed no training for
any object because it was promptable. YOLO11-seg only segments classes it was
trained on. With COCO weights that is `person` and seventy-nine everyday objects,
which covers redaction well and covers device boxes and conduit runs not at all.

Closing that gap needs mask annotations, and every public construction dataset
worth having — SODA included — is bounding boxes only. So construction-class
segmentation waits on masks drawn in this tool, which is the same chicken-and-egg
the trainer exists to break: label by hand, train, come back.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

__all__ = [
    "DEFAULT_SEG_WEIGHTS",
    "Polygon",
    "SegmentResult",
    "segment",
    "segmentation_available",
]

#: YOLO11 small, segmentation head. `s` rather than `n` because segmentation edges
#: are where the nano model visibly frays — a mask that follows the wall two pixels
#: inside the actual edge is worse than no mask, since a labeller then has to
#: correct something they could have drawn correctly in the first place.
DEFAULT_SEG_WEIGHTS = "yolo11s-seg.pt"

# One lock around inference: ultralytics makes no thread-safety promise about a
# shared model instance and a labeller clicking quickly can have two in flight.
_INFERENCE_LOCK = threading.Lock()


@dataclass(frozen=True)
class Polygon:
    """One outline, normalised 0..1, in the trainer's own region format."""

    points: list[tuple[float, float]]
    score: float
    #: What the model thinks it outlined. SAM could not answer this at all.
    class_name: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "points": [[round(x, 6), round(y, 6)] for x, y in self.points],
            "score": round(self.score, 4),
            "className": self.class_name,
        }


@dataclass(frozen=True)
class SegmentResult:
    model: str
    polygons: list[Polygon] = field(default_factory=list)
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "polygons": [p.as_dict() for p in self.polygons],
            "note": self.note,
        }


@lru_cache(maxsize=2)
def _load(weights: str) -> Any:
    from .detect import ModelUnavailable

    try:
        from ultralytics import YOLO
    except ImportError as exc:  # pragma: no cover
        raise ModelUnavailable(
            "ultralytics is not installed. From services/prelabel: `uv sync`."
        ) from exc

    try:
        return YOLO(weights)
    except Exception as exc:
        raise ModelUnavailable(f"could not load segmentation weights {weights!r}: {exc}") from exc


def segmentation_available(weights: str = DEFAULT_SEG_WEIGHTS) -> bool:
    """Whether the segmenter can be loaded, without raising.

    The health check uses this so the trainer can disable the control with a reason
    rather than offering a button that fails on click. Weights download on first
    use, so "not yet" is a normal state on a fresh machine rather than a fault.
    """
    from .detect import ModelUnavailable

    try:
        _load(weights)
        return True
    except ModelUnavailable:
        return False


def _simplify(
    points: list[tuple[float, float]], epsilon_ratio: float = 0.004
) -> list[tuple[float, float]]:
    """Reduces a dense outline to something a person can edit.

    Ultralytics returns a contour per instance, often several hundred points. That
    is unusable in an editor — nobody can drag one vertex of it — and it bloats
    every export that carries it. Douglas-Peucker at a fraction of the perimeter
    keeps the shape and drops the noise.

    Operates in normalised space, so `epsilon_ratio` means the same thing on a
    phone photo and a DSLR frame.
    """
    import cv2
    import numpy as np

    if len(points) < 3:
        return []

    contour = np.array([[[x, y]] for x, y in points], dtype=np.float32)
    perimeter = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon_ratio * perimeter, True)

    simplified = [(float(p[0][0]), float(p[0][1])) for p in approx]
    # A polygon needs a triangle. Fewer means the trace collapsed, and a degenerate
    # shape in the corpus is worse than an honest failure.
    return simplified if len(simplified) >= 3 else []


def _normalised_segments(result: Any) -> list[list[tuple[float, float]]]:
    """Pulls already-normalised outlines out of an ultralytics result.

    This uses `masks.xyn` rather than tracing `masks.data` by hand, and the
    distinction caused a real bug worth recording: **the raw mask array is at the
    model's input resolution, not the image's.** Normalising those pixel
    coordinates against the original width and height silently places every outline
    in the wrong part of the frame — far enough off that a containment check
    rejects all of them, which reads as "the model found nothing" rather than as a
    coordinate-space error.

    `xyn` is normalised by ultralytics against the original image, which is the one
    source of truth for this, and it removes the contour-tracing step entirely.
    """
    masks = getattr(result, "masks", None)
    if masks is None:
        return []

    segments = getattr(masks, "xyn", None)
    if segments is None:
        return []

    outlines: list[list[tuple[float, float]]] = []
    for segment_points in segments:
        points = [(float(x), float(y)) for x, y in segment_points]
        outlines.append(_simplify(points))
    return outlines


def _overlaps(polygon: list[tuple[float, float]], box: list[float]) -> bool:
    """Does this outline actually sit inside the box that was asked about?

    YOLO11-seg segments the whole frame in one pass, so a request about one box
    comes back with every instance in the image. Without this filter, clicking
    "segment" on one worker would return outlines for all four, and the labeller
    would accept a region for something they never pointed at.

    Centroid containment with a margin, rather than IoU: the mask is often tighter
    than the detector's box, and a strict overlap test rejects correct outlines.
    """
    if not polygon:
        return False

    x, y, w, h = box
    cx = sum(px for px, _ in polygon) / len(polygon)
    cy = sum(py for _, py in polygon) / len(polygon)

    margin = 0.05
    return (x - margin) <= cx <= (x + w + margin) and (y - margin) <= cy <= (y + h + margin)


def segment(
    image_bytes: bytes,
    *,
    boxes: list[list[float]] | None = None,
    points: list[list[float]] | None = None,
    weights: str = DEFAULT_SEG_WEIGHTS,
    confidence: float = 0.25,
) -> SegmentResult:
    """Segments the image and returns the outlines relevant to the prompt.

    `boxes` are normalised [x, y, w, h] — the same shape the detector returns, so a
    stage-one proposal can be handed straight here. `points` are normalised [x, y]
    clicks, matched by containment.

    Unlike SAM this model is not promptable: it segments what it knows, wherever it
    is, and the prompt is used to *select* from that rather than to direct it. When
    neither is given, everything it found comes back.
    """
    from .detect import ModelUnavailable, _decode

    if not image_bytes:
        raise ValueError("no image bytes supplied")

    image = _decode(image_bytes)  # decoded here so a bad image fails before inference
    height, width = image.shape[:2]

    model = _load(weights)
    try:
        with _INFERENCE_LOCK:
            results = model.predict(image, conf=confidence, verbose=False)
    except Exception as exc:
        raise ModelUnavailable(f"segmentation failed: {exc}") from exc

    found: list[Polygon] = []
    for result in results:
        names = getattr(result, "names", {}) or getattr(model, "names", {}) or {}
        boxes_out = getattr(result, "boxes", None)

        for index, traced in enumerate(_normalised_segments(result)):
            if not traced:
                continue

            score = 1.0
            class_name = ""
            if boxes_out is not None and index < len(boxes_out):
                score = float(boxes_out.conf[index])
                class_id = int(boxes_out.cls[index])
                class_name = str(names.get(class_id, class_id))

            found.append(Polygon(points=traced, score=score, class_name=class_name))

    if not found:
        return SegmentResult(
            model=weights,
            polygons=[],
            note=(
                f"{weights} found nothing it recognises here. It segments only the classes "
                "it was trained on — unlike a promptable model, it cannot outline an "
                "arbitrary shape."
            ),
        )

    # Select down to what was actually asked about.
    selected = found
    if boxes:
        selected = [p for p in found if any(_overlaps(p.points, b) for b in boxes)]
    elif points:
        selected = [
            p
            for p in found
            if any(_overlaps(p.points, [px - 0.02, py - 0.02, 0.04, 0.04]) for px, py in points)
        ]

    if not selected:
        return SegmentResult(
            model=weights,
            polygons=[],
            note=(
                f"{weights} segmented {len(found)} object(s), none of them where you "
                "pointed. It may not know this class."
            ),
        )

    selected.sort(key=lambda p: p.score, reverse=True)
    return SegmentResult(model=weights, polygons=selected)
