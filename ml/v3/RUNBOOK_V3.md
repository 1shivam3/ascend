# RUNBOOK — ASCEND dish classifier v3 (accuracy round)

**Status:** launched via the Kaggle API by Muse (kernel `shivam012005/ascend-v3`,
private, GPU + internet on, dataset `shivam012005/ascend-ml-package` attached).
Muse babysits it with an hourly watcher (see "Watcher contract" below) — you
don't need to touch Kaggle unless you want to look.

## What v3 is

Same product contract as v2 — 544 classes (85 Indian + 459 world),
MobileNetV4-Conv-M student, input `[1,224,224,3]` uint8, output `[1,544]`
uint8 INT8 TFLite, normalization folded — trained harder:

| Lever | v2 | v3 |
|---|---|---|
| Per-class photo cap | 400 | **1000** |
| Lookalike families (41 classes: naan/dosa/pizza variants, wings, rolls, dal + kheer/phirni, fried snacks…) | 400 | **2000** |
| Teacher | none | **MobileNetV4-Conv-Large**, 12 epochs |
| Student loss | CE only | **0.3 · CE + 0.7 · KL(teacher‖student, T=3.0) · T²** (distillation) |
| Hard-pair sampling boost | 10 pairs ×1.5 | 18 pairs ×1.5 (v2's real confusion pairs added) |
| Expected training images | ~160K actual | ~260–330K (prep prints the real number) |

Why these levers: v2's own eval (`models/v2/eval_report.json`) showed the
losses concentrated in lookalike families (paneer↔chicken pizza ×24,
butter↔garlic naan, kheer→phirni, wings), not in the obscure world tail —
so v3 spends data and teacher capacity there, and deliberately does **not**
chase 0–15% tail classes (veal cordon bleu, rugulah, mostaccioli…).

**Honest expectations:** overall top-1 ~0.58–0.65 (v2: 0.5633), Indian top-1
~0.82–0.87 (v2: 0.8092), Indian top-5 ≥0.95. A few points, not a leap. If the
delta vs v2 comes back ~0 or negative, v2 stays the shipping model.

## Session plan (Kaggle's ~12 h cap)

- **Shift 1:** data prep (40–70 min, downloads ~20 GB, disk-safe incremental
  merge — the disk-full failure mode of early v2 attempts is impossible by
  construction) → teacher, 12 epochs (~3.5–5.5 h at the larger dataset).
- **Shift 2:** distilled student, 15 epochs (~5–8 h; the frozen teacher's
  forward pass adds ~30–40% per batch) → eval (prints delta vs v2) → export
  + INT8 quantization + tflite re-scoring.

Everything checkpoints every epoch (`teacher_last.pth`, `last_model.pth`,
best weights in `teacher.pth` / `best_model.pth`), so a session that dies
mid-way loses at most one epoch.

## Resume contract (how a dead shift continues)

Push a new version of the same kernel with
`"kernelDataSources": ["shivam012005/ascend-v3"]` added to the push payload
(that attaches the kernel's own previous output as input). On Run All:

- data prep is skipped (`prepared_v3/labels.txt` found in the input),
- the teacher is skipped if `teacher_done.txt` is attached, else it resumes
  from `teacher_last.pth`,
- the student resumes from `last_model.pth`.

(Interactive equivalent: add the previous version's output as a dataset
input, then Run All. Never "Save Version → quick save" — a quick save
reports status `complete` with no outputs.)

## Watcher contract

Hourly status poll on `shivam012005/ascend-v3`:

- `running` / `queued` → stay silent.
- `complete` **with real output files** → download, verify the INT8 model
  exactly like v2 (flatbuffer loads, input/output tensors + quantization
  from the file itself, held-out photos through `labels.txt`), compare
  `eval_report.json` against v2's numbers, report, disable watcher.
  A `complete` with `files: []` is the quick-save trap, not a finished run.
- `complete` without a model but with `last_model.pth` / `teacher_last.pth`
  / `prepared_v3` → the shift hit the cap: push the resume version (above),
  tell the user once, keep watching.
- `error` with no checkpoints → report the log tail, disable watcher.

## Files

| File | Role |
|---|---|
| `train_classifier_v3.ipynb` | the notebook (teacher → distilled student → eval → export) |
| `data_prep_v3.py` | data prep: cap 1000, targeted cap 2000 (`cap_for_class`), disk-safe merge |
| `taxonomy_v2.json` | unchanged from v2 — the 544-class contract |
| `convert_tflite.py` | unchanged from v2 — ONNX → TFLite FP32/FP16/INT8 |
| repo copies | `ml/v3/` in `1shivam3/ascend` (canonical raw URLs — the pushed notebook's first cell fetches the prep script, taxonomy and converter from there and asserts v3 markers) |

## Outputs to collect at the end

`outputs/tflite/indian_food_cls_int8.tflite` (the shippable v3 model),
`outputs/labels.txt`, `outputs/eval_report.json` (has `delta_vs_v2`),
`outputs/tflite/tflite_eval.json` → saved locally under
`~/workspace/ascend-ml/models/v3/` after verification.
