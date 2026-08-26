"""Fine-tuning the redaction detector on real construction imagery.

The stock COCO weights detect `person` well on everyday photographs — people
standing in bright rooms, facing the camera, unoccluded. A jobsite is the opposite
of that: hi-vis over the torso, a hard hat breaking the head silhouette, half a
body behind a stud wall, backlit against a window opening, twenty metres down a dim
corridor. COCO person detection degrades on exactly those, and every miss is a face
that reaches the corpus unredacted.

So this fine-tunes on construction imagery. Two public sources are worth it:

  **SODA** — 19,846 real site images, 286,201 objects, 15 classes across worker,
  material, machine and layout (Duan et al., *Automation in Construction*, 2022;
  arXiv:2202.09554). VOC format. The worker and PPE classes are what matter here.

  **Roboflow Universe PPE sets** — several thousand more images of hardhats, vests
  and workers, already in YOLO format. Smaller and noisier than SODA, useful as
  additional variety rather than as a base.

What this is **not** for, and the distinction is load-bearing: none of this trains
a quantity model. These datasets label site-level objects — a worker, a rebar
bundle, a scaffold — not the installed quantities the product estimates. Nothing
here answers "how many device boxes are on that wall".

There is also a provenance reason, not just a practical one. A third-party public
dataset is neither self-measured (§5.4a) nor the anchor firm's as-builts (§5.4b).
If its images ever fed a quantity model they would sit in the same category as
simulated data: may train, may never measure. Used for redaction they never enter
the corpus at all — no third-party image becomes a training sample, only the
detector's weights change — so the leak rule is not implicated. Keep it that way.

Licensing: SODA and most Universe sets are CC BY 4.0, which requires attribution.
Weights fine-tuned from them carry that obligation. Record it before shipping
anything derived from them.
"""

from __future__ import annotations

import shutil
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

__all__ = [
    "PERSON_EVIDENCE_CLASSES",
    "VocBox",
    "coco_class_names",
    "convert_coco_dir",
    "convert_voc_tree",
    "read_voc_annotation",
    "voc_class_names",
    "write_dataset_yaml",
]

#: Classes whose presence means "a person is here, redact it".
#:
#: This is an **inference-time union, not a training-time filter** — and getting
#: that distinction right is what makes these datasets usable at all.
#:
#: The earlier version collapsed all of these into one `person` class during
#: conversion, which was wrong twice over. It threw away 95% of the annotations
#: (42 boxes out of 799 survived), and it corrupted box geometry: a hardhat box is
#: a head, a vest box is a torso, and teaching one class all three extents produces
#: a detector that emits head-sized boxes and mosaics the hat while leaving the
#: face.
#:
#: Keeping the dataset's own tags as distinct classes fixes both. `hardhat` stays a
#: hardhat, with correct head-sized extents, and the union happens here — at the
#: moment the redaction question is asked. A hardhat detection still means a person
#: is present; it just no longer pretends to be a whole-body box.
PERSON_EVIDENCE_CLASSES = frozenset(
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

#: Retained under the old name so existing imports keep working.
PERSON_LIKE_CLASSES = PERSON_EVIDENCE_CLASSES

#: The single class the fine-tuned model emits.
OUTPUT_CLASS = "person"


@dataclass(frozen=True)
class VocBox:
    """One VOC annotation box, in absolute pixels as VOC stores them."""

    name: str
    xmin: float
    ymin: float
    xmax: float
    ymax: float


def read_voc_annotation(path: Path) -> tuple[int, int, list[VocBox]]:
    """Reads one VOC XML file into image dimensions and boxes.

    Returns zero dimensions when the file does not declare them, which happens in
    real VOC exports more often than the format suggests. The caller skips those
    rather than dividing by zero and writing a label file full of infinities.
    """
    root = ElementTree.parse(path).getroot()
    size = root.find("size")
    width = int(float(size.findtext("width", "0"))) if size is not None else 0
    height = int(float(size.findtext("height", "0"))) if size is not None else 0

    boxes: list[VocBox] = []
    for obj in root.findall("object"):
        bnd = obj.find("bndbox")
        if bnd is None:
            continue
        try:
            boxes.append(
                VocBox(
                    name=(obj.findtext("name") or "").strip().lower(),
                    xmin=float(bnd.findtext("xmin", "0")),
                    ymin=float(bnd.findtext("ymin", "0")),
                    xmax=float(bnd.findtext("xmax", "0")),
                    ymax=float(bnd.findtext("ymax", "0")),
                )
            )
        except ValueError:
            # A malformed box is one box, not one dataset. Skip it and keep going.
            continue

    return width, height, boxes


def voc_box_to_yolo(box: VocBox, width: int, height: int) -> tuple[float, float, float, float]:
    """VOC corners in pixels to YOLO centre-and-size, normalised.

    Clamped to the frame. VOC boxes routinely run a pixel or two outside the image
    and ultralytics rejects a label file with a coordinate above 1.0, which turns a
    rounding artefact into a failed training run an hour later.
    """
    cx = ((box.xmin + box.xmax) / 2) / width
    cy = ((box.ymin + box.ymax) / 2) / height
    bw = (box.xmax - box.xmin) / width
    bh = (box.ymax - box.ymin) / height

    cx = min(max(cx, 0.0), 1.0)
    cy = min(max(cy, 0.0), 1.0)
    bw = min(max(bw, 0.0), 1.0)
    bh = min(max(bh, 0.0), 1.0)
    return cx, cy, bw, bh


def voc_class_names(annotations_dir: Path) -> list[str]:
    """Every class name the VOC tree actually uses, sorted for a stable order.

    Sorted rather than first-seen: first-seen depends on filesystem ordering, and a
    class list that reshuffles between two runs silently retrains the model on
    permuted labels.
    """
    found: set[str] = set()
    for annotation in annotations_dir.glob("*.xml"):
        _, _, boxes = read_voc_annotation(annotation)
        found.update(box.name for box in boxes if box.name)
    return sorted(found)


def convert_voc_tree(
    images_dir: Path,
    annotations_dir: Path,
    out_dir: Path,
    *,
    classes: list[str] | None = None,
    keep: Iterable[str] | None = None,
    split: str = "train",
) -> dict[str, int]:
    """Converts a VOC tree to the YOLO layout ultralytics expects.

    Writes `out_dir/images/<split>/` and `out_dir/labels/<split>/`, keeping only
    the classes in `keep` and collapsing them all to class 0.

    Images with no kept boxes are written anyway, with an empty label file. That is
    deliberate: a detector trained only on frames containing people learns that
    every frame contains a person, and on an empty corridor it invents one. Negative
    examples are what teach it to return nothing — and returning nothing correctly
    is the behaviour a labeller most needs to be able to trust.
    """
    names = classes if classes is not None else voc_class_names(annotations_dir)
    index_of = {name.lower(): i for i, name in enumerate(names)}
    wanted = {n.lower() for n in keep} if keep is not None else None
    image_out = out_dir / "images" / split
    label_out = out_dir / "labels" / split
    image_out.mkdir(parents=True, exist_ok=True)
    label_out.mkdir(parents=True, exist_ok=True)

    counts = {"images": 0, "boxes": 0, "skipped": 0, "negatives": 0}

    for annotation in sorted(annotations_dir.glob("*.xml")):
        width, height, boxes = read_voc_annotation(annotation)
        if width <= 0 or height <= 0:
            counts["skipped"] += 1
            continue

        image = _matching_image(images_dir, annotation.stem)
        if image is None:
            counts["skipped"] += 1
            continue

        lines: list[str] = []
        for box in boxes:
            if wanted is not None and box.name not in wanted:
                continue
            class_index = index_of.get(box.name)
            if class_index is None:
                continue
            cx, cy, bw, bh = voc_box_to_yolo(box, width, height)
            if bw <= 0 or bh <= 0:
                continue
            lines.append(f"{class_index} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")

        shutil.copy2(image, image_out / image.name)
        (label_out / f"{annotation.stem}.txt").write_text(
            "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8"
        )

        counts["images"] += 1
        counts["boxes"] += len(lines)
        if not lines:
            counts["negatives"] += 1

    return counts


def coco_class_names(coco_dir: Path, annotations_name: str = "_annotations.coco.json") -> list[str]:
    """The dataset's own class names, in a stable order.

    Read once and passed to every split, because YOLO label files carry class
    *indices*. Deriving the order separately per split is the classic way to end up
    training on `hardhat` and validating on `excavator` under the same number.

    Roboflow exports usually carry a placeholder supercategory as category 0 with
    no annotations; it is dropped so the indices stay tight.
    """
    import json

    document = json.loads((coco_dir / annotations_name).read_text(encoding="utf-8"))
    used = {int(a.get("category_id", -1)) for a in document.get("annotations", [])}

    names: list[str] = []
    for category in sorted(document.get("categories", []), key=lambda c: int(c["id"])):
        name = str(category.get("name", "")).strip()
        if name and int(category["id"]) in used and name not in names:
            names.append(name)
    return names


def convert_coco_dir(
    coco_dir: Path,
    out_dir: Path,
    *,
    classes: list[str] | None = None,
    keep: Iterable[str] | None = None,
    split: str = "train",
    annotations_name: str = "_annotations.coco.json",
) -> dict[str, int]:
    """Converts a Roboflow-style COCO directory to the YOLO layout.

    The layout these ship in — every image in one directory beside a single
    `_annotations.coco.json` — is what Hugging Face and Roboflow both export, so
    this is the path most public sets arrive on.

    By default **every class the dataset defines is kept, under its own name**.
    That is the whole point: the tags are the value. Pass `keep` to narrow it, but
    narrowing to one class is what made this dataset produce 42 usable boxes out of
    799 — the tags are worth more as themselves than collapsed.

    `classes` fixes the index order across splits and must be the same list for all
    of them; get it from `coco_class_names`.

    Images with no kept boxes are still written, with an empty label file. A
    detector trained only on frames containing its classes learns that every frame
    contains one, and returning nothing correctly is behaviour worth training.
    """
    import json

    annotations_path = coco_dir / annotations_name
    if not annotations_path.exists():
        raise FileNotFoundError(f"no COCO annotations at {annotations_path}")

    document = json.loads(annotations_path.read_text(encoding="utf-8"))
    names = classes if classes is not None else coco_class_names(coco_dir, annotations_name)
    index_of = {name.lower(): i for i, name in enumerate(names)}
    wanted = {n.lower() for n in keep} if keep is not None else None

    # COCO category ids are neither contiguous nor ordered; map them by name onto
    # the caller's index list.
    id_to_index: dict[int, int] = {}
    for category in document.get("categories", []):
        name = str(category.get("name", "")).strip().lower()
        if wanted is not None and name not in wanted:
            continue
        if name in index_of:
            id_to_index[int(category["id"])] = index_of[name]

    images = {int(image["id"]): image for image in document.get("images", [])}
    boxes_by_image: dict[int, list[str]] = {image_id: [] for image_id in images}

    for annotation in document.get("annotations", []):
        image_id = int(annotation.get("image_id", -1))
        class_index = id_to_index.get(int(annotation.get("category_id", -1)))
        if image_id not in images or class_index is None:
            continue
        image = images[image_id]
        width = float(image.get("width", 0))
        height = float(image.get("height", 0))
        if width <= 0 or height <= 0:
            continue

        # COCO bbox is [x, y, w, h] with the origin at the top-left corner.
        x, y, w, h = (float(v) for v in annotation.get("bbox", [0, 0, 0, 0]))
        if w <= 0 or h <= 0:
            continue

        cx = min(max((x + w / 2) / width, 0.0), 1.0)
        cy = min(max((y + h / 2) / height, 0.0), 1.0)
        bw = min(max(w / width, 0.0), 1.0)
        bh = min(max(h / height, 0.0), 1.0)
        boxes_by_image[image_id].append(f"{class_index} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")

    image_out = out_dir / "images" / split
    label_out = out_dir / "labels" / split
    image_out.mkdir(parents=True, exist_ok=True)
    label_out.mkdir(parents=True, exist_ok=True)

    counts = {"images": 0, "boxes": 0, "skipped": 0, "negatives": 0}

    for image_id, image in images.items():
        source = coco_dir / str(image.get("file_name", ""))
        if not source.exists():
            counts["skipped"] += 1
            continue

        lines = boxes_by_image.get(image_id, [])
        shutil.copy2(source, image_out / source.name)
        (label_out / f"{source.stem}.txt").write_text(
            "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8"
        )

        counts["images"] += 1
        counts["boxes"] += len(lines)
        if not lines:
            counts["negatives"] += 1

    return counts


def _matching_image(images_dir: Path, stem: str) -> Path | None:
    for suffix in (".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"):
        candidate = images_dir / f"{stem}{suffix}"
        if candidate.exists():
            return candidate
    return None


def write_dataset_yaml(
    out_dir: Path, classes: list[str] | None = None, *, has_val: bool = True
) -> Path:
    """Writes the dataset descriptor ultralytics trains from.

    `classes` must be the same ordered list the labels were written against.
    Defaults to the single output class for the old collapsed behaviour.
    """
    names = classes if classes else [OUTPUT_CLASS]
    lines = [
        "# Generated by services/prelabel. Detection assist only — this trains a",
        "# detector, never a quantity model. See finetune.py for why.",
        f"path: {out_dir.resolve().as_posix()}",
        "train: images/train",
    ]
    if has_val:
        lines.append("val: images/val")
    lines.append("names:")
    lines += [f"  {i}: {name}" for i, name in enumerate(names)]
    lines.append("")

    path = out_dir / "dataset.yaml"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def train(
    dataset_yaml: Path,
    *,
    base_weights: str = "yolo11n.pt",
    epochs: int = 40,
    imgsz: int = 640,
    project: str = "runs/redaction",
) -> Any:
    """Fine-tunes from `base_weights`.

    Starting from the COCO checkpoint rather than from scratch: the low-level
    features that find a human silhouette transfer perfectly well, and there is no
    version of this project where training a detector from random initialisation on
    twenty thousand images beats fine-tuning one trained on a hundred times that.

    On a CPU this is measured in hours. Check for a GPU before starting a run you
    intend to wait for.
    """
    try:
        from ultralytics import YOLO
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("ultralytics is not installed; run `uv sync`") from exc

    model = YOLO(base_weights)
    return model.train(
        data=str(dataset_yaml),
        epochs=epochs,
        imgsz=imgsz,
        project=project,
        name="finetune",
        exist_ok=True,
    )
