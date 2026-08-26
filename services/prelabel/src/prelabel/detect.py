"""YOLO11 detection, run locally, proposing labels for a human to correct.

What this is for, stated plainly because the distinction matters: this is a
**labelling accelerator**, not a model the product ships. It draws boxes a person
then fixes. Nothing it outputs is ground truth, nothing it outputs is an estimate,
and nothing it outputs may set a quantity, an abstention, or a face-blur
declaration — the same line the dashboard's assistant already respects.

It is emphatically not `services/quantity-ml`. That service is deliberately not
started: its README's rule is that the quantity model does not begin before the
technical spike reports its accuracy honestly. Running a stock detector to speed up
labelling does not start it, and this module must never grow into it by accident.

Two uses, and they are in very different states today:

  **People, for redaction.** The stock COCO weights detect `person` well. That is
  immediately useful: it proposes the rectangles a labeller would otherwise draw by
  hand on every photo, which is the slowest part of intake. A person proposal is
  still confirmed by a human before anything is stored — see the trainer's gate.

  **Construction scope, for regions.** The stock weights know nothing about device
  boxes, conduit runs or form panels; COCO's eighty classes are cats, cars and
  chairs. Until a custom model is trained on this corpus, region suggestion has
  nothing useful to say, and this module says so rather than proposing `bench` on a
  wall of conduit. That is the chicken-and-egg the trainer exists to break: label
  by hand first, train, then come back and let the model do the first pass.

Everything runs on this machine. The weights are downloaded once by ultralytics and
cached; no image ever leaves the process.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

__all__ = [
    "DEFAULT_WEIGHTS",
    "PERSON_CLASSES",
    "Detection",
    "DetectionResult",
    "ModelUnavailable",
    "detect",
    "model_identity",
]

#: Small rather than nano. Nano was the right default while SAM dominated the
#: latency budget at eleven seconds a box — model size was rounding error next to
#: that. With SAM gone, detection is the whole cost, and `s` buys a real accuracy
#: gain for a fraction of a second.
#:
#: The constraint behind both choices is unchanged: on a laptop CPU, model size is
#: the difference between a proposal appearing while the labeller is still reading
#: the photo and one arriving after they have already drawn the box by hand.
#: Accuracy that costs more than the work it saves is not a saving. Point `weights`
#: at `m` or `l` when there is a GPU under it.
DEFAULT_WEIGHTS = "yolo11s.pt"

#: Classes that mean "a person is here, redact it".
#:
#: Wider than `person` on purpose, because the model answering this question is no
#: longer necessarily the stock COCO one. A detector fine-tuned on construction
#: imagery returns the tags those datasets actually carry — `hardhat`, `safety
#: vest`, `no-hardhat` — and every one of them implies a person is in frame even
#: when no whole-body box was found. On a jobsite that is the common case: a worker
#: behind a stud wall shows a hard hat and nothing else.
#:
#: This union belongs here, at the moment the redaction question is asked, and not
#: in the training labels. Collapsing these classes during conversion is what threw
#: away 95% of a dataset and taught the detector head-sized "person" boxes.
#:
#: The stock COCO model only has `person`, so the extra names simply never match
#: there — no behaviour changes until a fine-tuned model is loaded.
PERSON_CLASSES = frozenset(
    {
        "person",
        "worker",
        "helmet",
        "hardhat",
        "hard-hat",
        "no-hardhat",
        "vest",
        "safety vest",
        "safety-vest",
        "no-safety vest",
        "mask",
        "no-mask",
        "gloves",
        "safety shoes",
    }
)

# Ultralytics is not documented as thread-safe for concurrent predicts on one model
# instance, and the trainer can fire two requests while a labeller clicks quickly.
# One lock around inference costs nothing at this scale and removes the question.
_INFERENCE_LOCK = threading.Lock()


class ModelUnavailable(RuntimeError):
    """Raised when the detector cannot be loaded or run.

    Its own type because the trainer treats it as "the assist is offline, carry on
    labelling by hand" rather than as an error worth interrupting anyone over. A
    labelling tool whose core workflow breaks because an optional accelerator is
    missing has the dependency the wrong way round.
    """


@dataclass(frozen=True)
class Detection:
    """One proposed box.

    Coordinates are normalised 0..1 against the image, matching how the trainer
    stores every region — so a proposal survives the same resize a hand-drawn box
    does, and the two are directly comparable.
    """

    class_name: str
    confidence: float
    x: float
    y: float
    w: float
    h: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "className": self.class_name,
            "confidence": round(self.confidence, 4),
            "x": round(self.x, 6),
            "y": round(self.y, 6),
            "w": round(self.w, 6),
            "h": round(self.h, 6),
        }


@dataclass(frozen=True)
class DetectionResult:
    """What one image produced, plus what produced it.

    `model` travels with the result on purpose. A proposal accepted by a labeller
    becomes part of the corpus, and "which model suggested this box" is a question
    worth being able to answer six months later — particularly if that model turns
    out to have had a systematic bias a tired labeller kept accepting.
    """

    model: str
    detections: list[Detection] = field(default_factory=list)
    #: True when the weights have no class that maps to what was asked for, so an
    #: empty result means "this model cannot help", not "there is nothing there".
    unsupported_request: bool = False
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "detections": [d.as_dict() for d in self.detections],
            "unsupportedRequest": self.unsupported_request,
            "note": self.note,
        }


@lru_cache(maxsize=4)
def _load(weights: str) -> Any:
    """Loads and caches a model. Cached because loading dominates a small predict."""
    try:
        from ultralytics import YOLO
    except ImportError as exc:  # pragma: no cover - exercised by absence, not by test
        raise ModelUnavailable(
            "ultralytics is not installed. From services/prelabel: `uv sync`."
        ) from exc

    try:
        return YOLO(weights)
    except Exception as exc:
        raise ModelUnavailable(f"could not load weights {weights!r}: {exc}") from exc


def model_identity(weights: str = DEFAULT_WEIGHTS) -> dict[str, Any]:
    """Describes the loaded model — its name and the classes it actually knows.

    The trainer shows the class list, because the honest answer to "why did the
    assist propose nothing" is usually "this model has never heard of a device box".
    """
    model = _load(weights)
    names = _class_names(model)
    return {
        "weights": weights,
        "classes": sorted(names.values()),
        "knowsPeople": bool(PERSON_CLASSES & set(names.values())),
    }


def _class_names(model: Any) -> dict[int, str]:
    names = getattr(model, "names", None)
    if isinstance(names, dict):
        return {int(k): str(v) for k, v in names.items()}
    if isinstance(names, (list, tuple)):
        return dict(enumerate(str(n) for n in names))
    return {}


def detect(
    image_bytes: bytes,
    *,
    weights: str = DEFAULT_WEIGHTS,
    want: frozenset[str] | None = None,
    confidence: float = 0.25,
) -> DetectionResult:
    """Runs detection over one image.

    `want` filters to a set of class names. Passing ``PERSON_CLASSES`` asks the
    redaction question; passing ``None`` asks for everything the model knows.

    When `want` names classes this model does not have, the result comes back
    flagged rather than empty-and-ambiguous. "The model found no people" and "this
    model cannot detect people" are different answers and a labeller deciding
    whether to trust an empty frame needs to know which one they got.
    """
    if not image_bytes:
        raise ValueError("no image bytes supplied")
    if not 0.0 <= confidence <= 1.0:
        raise ValueError(f"confidence must be in [0, 1], got {confidence}")

    model = _load(weights)
    known = set(_class_names(model).values())

    if want is not None and not (want & known):
        return DetectionResult(
            model=weights,
            detections=[],
            unsupported_request=True,
            note=(
                f"{weights} does not know {sorted(want)}. It knows "
                f"{len(known)} other classes, none of which answer this question."
            ),
        )

    image = _decode(image_bytes)

    try:
        with _INFERENCE_LOCK:
            # verbose=False: ultralytics otherwise prints a line per predict, which
            # turns a labelling session into thousands of lines of console noise.
            results = model.predict(image, conf=confidence, verbose=False)
    except Exception as exc:
        raise ModelUnavailable(f"inference failed: {exc}") from exc

    height, width = image.shape[:2]
    detections: list[Detection] = []

    for result in results:
        names = _class_names(result) or _class_names(model)
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        for box in boxes:
            class_name = names.get(int(box.cls[0]), str(int(box.cls[0])))
            if want is not None and class_name not in want:
                continue
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            detections.append(
                Detection(
                    class_name=class_name,
                    confidence=float(box.conf[0]),
                    x=max(0.0, x1 / width),
                    y=max(0.0, y1 / height),
                    w=min(1.0, (x2 - x1) / width),
                    h=min(1.0, (y2 - y1) / height),
                )
            )

    detections.sort(key=lambda d: d.confidence, reverse=True)
    return DetectionResult(model=weights, detections=detections)


def _decode(image_bytes: bytes) -> Any:
    """Bytes to an array, without writing a temp file.

    Writing the image to disk to hand ultralytics a path would put an unredacted
    frame on the filesystem — briefly, but on a machine whose whole promise is that
    unredacted bytes never touch storage. It stays in memory.
    """
    try:
        import cv2
        import numpy as np
    except ImportError as exc:  # pragma: no cover
        raise ModelUnavailable(
            "opencv/numpy missing — they ship with ultralytics; run `uv sync`."
        ) from exc

    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("could not decode that image")
    return image
