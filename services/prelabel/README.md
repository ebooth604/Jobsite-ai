# services/prelabel

Local YOLO11 detection that proposes labels for a human to correct. Runs on one
machine; no image leaves the process.

```bash
cd services/prelabel && uv run prelabel-server
```

Serves `http://127.0.0.1:4181`. The trainer finds it automatically and every
assist button lights up. If it is not running, the trainer says so and everything
else works — the accelerator is optional and must stay that way.

## What this is not

**Not `services/quantity-ml`.** That service is deliberately unstarted: its rule
is that the quantity model does not begin before the technical spike reports its
accuracy honestly. Running a stock detector to speed up labelling does not start
it, and this must never grow into it by accident.

Nothing here is ground truth, nothing here is an estimate, and nothing here may
set a quantity, an abstention, or a face-blur declaration.

## The two jobs, in very different states

**People, for redaction — works today.** Stock COCO weights detect `person` well.
Intake's *Find people to redact* draws the rectangles a labeller would otherwise
draw by hand on every photo, which is the slowest part of intake.

The gate that matters: a proposed set **cannot be saved until a human confirms
it**. A detector misses someone eventually, and a photo with one missed face looks
redacted and is not. `assistedBy` and `confirmedByHuman` are stored on every
sample, so a privacy review can tell the difference between "a person checked" and
"a model's output was trusted". `guards.ts` enforces it and
`guards.test.ts` fails the build if it stops doing so.

**Construction scope, for regions — not yet.** COCO's eighty classes are cats,
cars and chairs; it has never seen a device box. Asking it about conduit returns a
stated "this model cannot answer that", not an empty list a labeller would
misread as "nothing there". This needs a model trained on the corpus — the
chicken-and-egg the trainer exists to break: label by hand, train, then come back.

## Fine-tuning the redaction detector

COCO person detection degrades on exactly the jobsite cases that matter: hi-vis
over the torso, a hard hat breaking the head silhouette, half a body behind a stud
wall, backlit against a window opening, twenty metres down a dim corridor. Two
public sources fix that:

| Source | What it is | Format |
|---|---|---|
| [SODA](https://arxiv.org/abs/2202.09554) | 19,846 real site images, 286,201 objects, 15 classes across worker/material/machine/layout (Duan et al., *Automation in Construction*, 2022) | VOC |
| Roboflow Universe PPE sets | Several thousand more hardhat/vest/worker images; smaller and noisier than SODA | YOLO |

`finetune.py` converts a VOC tree and trains:

```python
from pathlib import Path
from prelabel.finetune import convert_voc_tree, write_dataset_yaml, train

convert_voc_tree(Path("SODA/JPEGImages"), Path("SODA/Annotations"), Path("data/redaction"))
train(write_dataset_yaml(Path("data/redaction"), has_val=False))
```

Every person-like class collapses to one output class — the redaction question is
binary, and a detector that must also decide whether someone is wearing a vest has
been given a harder problem than the one being asked. Frames with no people are
kept with empty label files: a detector trained only on frames containing people
learns that every frame contains one, and returning nothing *correctly* is the
behaviour a labeller most needs to trust.

Then point the server at the result:

```bash
uv run prelabel-server runs/redaction/finetune/weights/best.pt
```

### Two things to get right before using these datasets

**They cannot train a quantity model.** They label site-level objects — a worker,
a rebar bundle, a scaffold — not installed quantities. Nothing in them answers
"how many device boxes are on that wall".

**Provenance, if you ever were tempted.** A third-party public dataset is neither
self-measured (§5.4a) nor the anchor firm's as-builts (§5.4b). Feeding one to a
quantity model would put it in the same category as simulated data: may train, may
never measure. Used for redaction they never enter the corpus at all — no
third-party image becomes a training sample, only the detector's weights change —
so the leak rule is not implicated. Keep it that way.

**Licensing.** SODA and most Universe sets are CC BY 4.0, which requires
attribution. Weights fine-tuned from them carry that obligation; record it before
anything derived from them ships.

## Why a separate process

YOLO11 is Python and the trainer is TypeScript. The alternatives — shelling out
per image, or a Node ONNX runtime — are worse than a socket.

Loopback only, and not configurable otherwise. The images crossing this socket are
unredacted jobsite photographs on their way to *becoming* redacted: the one moment
in the whole system where such bytes are in flight. They travel between two
processes on one machine, and that is the entire intended blast radius.
