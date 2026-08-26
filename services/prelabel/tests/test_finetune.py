"""Conversion tests.

These run without ultralytics, torch, or a single downloaded image — the geometry
and the file layout are where a conversion goes wrong, and both are testable in
milliseconds. A test that needs twenty thousand images is a test nobody runs.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from prelabel.finetune import (
    PERSON_LIKE_CLASSES,
    VocBox,
    convert_voc_tree,
    read_voc_annotation,
    voc_box_to_yolo,
    voc_class_names,
    write_dataset_yaml,
)

VOC_TEMPLATE = """<annotation>
  <size><width>{width}</width><height>{height}</height><depth>3</depth></size>
  {objects}
</annotation>
"""

OBJECT_TEMPLATE = """<object>
    <name>{name}</name>
    <bndbox><xmin>{xmin}</xmin><ymin>{ymin}</ymin><xmax>{xmax}</xmax><ymax>{ymax}</ymax></bndbox>
  </object>"""


def write_voc(path: Path, width: int, height: int, objects: list[tuple[str, int, int, int, int]]):
    body = "\n  ".join(
        OBJECT_TEMPLATE.format(name=n, xmin=a, ymin=b, xmax=c, ymax=d) for n, a, b, c, d in objects
    )
    path.write_text(VOC_TEMPLATE.format(width=width, height=height, objects=body), encoding="utf-8")


def fake_image(path: Path) -> None:
    # Content is irrelevant: conversion copies bytes and never decodes them.
    path.write_bytes(b"\xff\xd8\xff\xe0not-a-real-jpeg")


class TestGeometry:
    def test_centre_box_maps_to_centre(self):
        box = VocBox("person", 25, 50, 75, 150)
        cx, cy, bw, bh = voc_box_to_yolo(box, 100, 200)
        assert (cx, cy) == pytest.approx((0.5, 0.5))
        assert (bw, bh) == pytest.approx((0.5, 0.5))

    def test_corner_box(self):
        box = VocBox("person", 0, 0, 50, 50)
        cx, cy, bw, bh = voc_box_to_yolo(box, 100, 100)
        assert (cx, cy) == pytest.approx((0.25, 0.25))

    def test_overhanging_box_is_clamped(self):
        # VOC exports routinely run a pixel or two past the edge; ultralytics
        # rejects a label above 1.0, so a rounding artefact must not fail a run.
        box = VocBox("person", -5, -5, 105, 105)
        _, _, bw, bh = voc_box_to_yolo(box, 100, 100)
        assert bw <= 1.0 and bh <= 1.0


class TestReading:
    def test_reads_size_and_boxes(self, tmp_path: Path):
        path = tmp_path / "a.xml"
        write_voc(path, 640, 480, [("Person", 10, 20, 30, 40), ("rebar", 1, 2, 3, 4)])
        width, height, boxes = read_voc_annotation(path)
        assert (width, height) == (640, 480)
        assert [b.name for b in boxes] == ["person", "rebar"]

    def test_missing_size_reports_zero(self, tmp_path: Path):
        path = tmp_path / "b.xml"
        path.write_text("<annotation></annotation>", encoding="utf-8")
        width, height, _ = read_voc_annotation(path)
        assert (width, height) == (0, 0)


class TestConversion:
    def _tree(self, tmp_path: Path) -> tuple[Path, Path, Path]:
        images = tmp_path / "JPEGImages"
        annotations = tmp_path / "Annotations"
        out = tmp_path / "yolo"
        images.mkdir()
        annotations.mkdir()
        return images, annotations, out

    def test_keeps_every_dataset_tag_by_default(self, tmp_path: Path):
        images, annotations, out = self._tree(tmp_path)
        fake_image(images / "one.jpg")
        write_voc(
            annotations / "one.xml",
            100,
            100,
            [("worker", 10, 10, 40, 60), ("rebar", 50, 50, 90, 90), ("helmet", 12, 8, 30, 20)],
        )

        # The default is now everything. Narrowing to one class is what turned a
        # 799-box dataset into 42 usable boxes; the tags are worth more as tags.
        counts = convert_voc_tree(images, annotations, out)

        assert counts["images"] == 1
        assert counts["boxes"] == 3

        classes = voc_class_names(annotations)
        assert classes == ["helmet", "rebar", "worker"]

        label = (out / "labels" / "train" / "one.txt").read_text(encoding="utf-8")
        indices = sorted(int(line.split()[0]) for line in label.strip().splitlines())
        # Each tag keeps its own class index, so a helmet box stays head-sized
        # instead of teaching a "person" class inconsistent extents.
        assert indices == [0, 1, 2]

    def test_keep_still_narrows_when_asked(self, tmp_path: Path):
        images, annotations, out = self._tree(tmp_path)
        fake_image(images / "one.jpg")
        write_voc(
            annotations / "one.xml",
            100,
            100,
            [("worker", 10, 10, 40, 60), ("rebar", 50, 50, 90, 90)],
        )

        counts = convert_voc_tree(
            images, annotations, out, classes=["worker"], keep=PERSON_LIKE_CLASSES
        )

        assert counts["boxes"] == 1

    def test_keeps_negatives_with_empty_labels(self, tmp_path: Path):
        # The property that matters most: a frame with no people still ships, so
        # the detector learns that empty corridors are empty.
        images, annotations, out = self._tree(tmp_path)
        fake_image(images / "empty.jpg")
        write_voc(annotations / "empty.xml", 100, 100, [])

        counts = convert_voc_tree(images, annotations, out)

        assert counts["images"] == 1
        assert counts["negatives"] == 1
        assert (out / "labels" / "train" / "empty.txt").read_text(encoding="utf-8") == ""
        assert (out / "images" / "train" / "empty.jpg").exists()

    def test_skips_annotation_with_no_image(self, tmp_path: Path):
        images, annotations, out = self._tree(tmp_path)
        write_voc(annotations / "orphan.xml", 100, 100, [("person", 1, 1, 9, 9)])
        counts = convert_voc_tree(images, annotations, out)
        assert counts["images"] == 0
        assert counts["skipped"] == 1

    def test_skips_annotation_with_no_dimensions(self, tmp_path: Path):
        images, annotations, out = self._tree(tmp_path)
        fake_image(images / "nodim.jpg")
        (annotations / "nodim.xml").write_text("<annotation></annotation>", encoding="utf-8")
        counts = convert_voc_tree(images, annotations, out)
        assert counts["skipped"] == 1

    def test_writes_dataset_yaml(self, tmp_path: Path):
        path = write_dataset_yaml(tmp_path, has_val=False)
        text = path.read_text(encoding="utf-8")
        assert "0: person" in text
        assert "train: images/train" in text
        assert "val:" not in text
