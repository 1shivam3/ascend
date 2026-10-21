#!/usr/bin/env python3
"""
convert_tflite.py — ONNX (exported by training) -> TFLite FP32 / FP16 / INT8,
with an honest FP32-vs-quantized comparison on the held-out TEST split.

Model I/O contract (baked in at export time by train code):
  input : NHWC float32, raw pixels 0..255, shape [1, IMG, IMG, 3]
          (the wrapper inside the model does /255, permute, normalize)
  output: logits [1, num_classes]

Pipeline:
  1. onnx2tf converts ONNX -> TF SavedModel (+ a float32 .tflite by-product).
  2. tf.lite.TFLiteConverter from the SavedModel:
       FP16 : optimizations + float16 supported type
       INT8 : full-integer quantization; representative dataset = up to
              --calib-images images sampled from the VAL split (never TEST);
              input/output pinned to uint8 so the phone can feed camera
              bytes straight in.
  3. Evaluation of every produced .tflite on the TEST split (capped by
     --max-eval): top-1 / top-5, plus a 5-image side-by-side sanity print
     (FP32 vs INT8 top-3). Results -> tflite_eval.json in the out dir,
     and a summary table on stdout.

Usage:
  python convert_tflite.py --onnx outputs/model.onnx --data-dir data/prepared \
      --out-dir outputs/tflite
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image


# ----------------------------------------------------------------- interpreter
def make_interpreter(model_path: str):
    """Load a .tflite with whichever runtime is present."""
    try:
        import tensorflow as tf
        return tf.lite.Interpreter(model_path=model_path)
    except ImportError:
        pass
    try:
        from ai_edge_litert.interpreter import Interpreter
        return Interpreter(model_path=model_path)
    except ImportError:
        pass
    from tflite_runtime.interpreter import Interpreter  # last resort
    return Interpreter(model_path=model_path)


def run_tflite(model_path: str, batch_nhwc: np.ndarray) -> np.ndarray:
    """batch_nhwc: float32 0..255 OR uint8 — matched to the model's input type."""
    interp = make_interpreter(model_path)
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]
    out = interp.get_output_details()[0]
    x = batch_nhwc
    if inp["dtype"] == np.uint8:
        x = np.clip(np.round(x), 0, 255).astype(np.uint8)
    elif inp["dtype"] == np.int8:
        scale, zp = inp["quantization"]
        x = np.clip(np.round(x / scale) + zp, -128, 127).astype(np.int8)
    else:
        x = x.astype(np.float32)
    interp.resize_tensor_input(inp["index"], [len(x)] + list(x.shape[1:]))
    interp.allocate_tensors()
    interp.set_tensor(inp["index"], x)
    interp.invoke()
    y = interp.get_tensor(out["index"]).astype(np.float32)
    if out["dtype"] in (np.uint8, np.int8) and out["quantization"][0] > 0:
        scale, zp = out["quantization"]
        y = (y - zp) * scale
    return y


# ----------------------------------------------------------------- data helpers
def load_split_images(data_dir: Path, split: str, labels: list[str],
                      img_size: int, limit_per_class: int = 0):
    """Return (X float32 NHWC 0..255, y int) from an ImageFolder split dir."""
    xs, ys = [], []
    for ci, cls in enumerate(labels):
        files = sorted((data_dir / split / cls).glob("*.jpg"))
        if limit_per_class:
            files = files[:limit_per_class]
        for f in files:
            im = Image.open(f).convert("RGB").resize((img_size, img_size), Image.BILINEAR)
            xs.append(np.asarray(im, dtype=np.float32))
            ys.append(ci)
    return np.stack(xs), np.array(ys)


def topk_metrics(logits: np.ndarray, y: np.ndarray) -> dict:
    order = np.argsort(-logits, axis=1)
    top1 = float((order[:, 0] == y).mean())
    top5 = float(np.array([y[i] in order[i, :5] for i in range(len(y))]).mean())
    return {"top1": round(top1, 4), "top5": round(top5, 4), "n": int(len(y))}


# ----------------------------------------------------------------- conversion
def onnx_to_saved_model(onnx_path: Path, work_dir: Path) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-m", "onnx2tf", "-i", str(onnx_path), "-o", str(work_dir),
           "-tb", "tf_converter",  # classic TF path -> SavedModel (default flatbuffer_direct skips it)
           "-kt", "input",  # our ONNX input is NHWC raw pixels; without this onnx2tf
                            # assumes NCHW and the first conv gets 128 "channels"
           "-osd"]  # -osd: also emit signaturedefs (harmless, helps debugging)
    print("[convert] onnx2tf:", " ".join(cmd), flush=True)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-4000:]); print(r.stderr[-4000:], file=sys.stderr)
        raise SystemExit("onnx2tf failed — see output above")
    saved = work_dir / "saved_model"
    if not saved.exists():
        # tf_converter backend writes the SavedModel at the output root itself
        if (work_dir / "saved_model.pb").exists():
            return work_dir
        # onnx2tf names the folder after the model in some versions
        cands = [d for d in work_dir.iterdir() if d.is_dir() and (d / "saved_model.pb").exists()]
        if not cands:
            raise SystemExit(f"onnx2tf produced no SavedModel in {work_dir}")
        saved = cands[0]
    return saved


def convert_all(saved_model: Path, out_dir: Path, calib_X: np.ndarray) -> dict[str, Path]:
    import tensorflow as tf

    out_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, Path] = {}

    base = tf.lite.TFLiteConverter.from_saved_model(str(saved_model))
    fp32_path = out_dir / "indian_food_cls_fp32.tflite"
    fp32_path.write_bytes(base.convert())
    results["fp32"] = fp32_path

    c16 = tf.lite.TFLiteConverter.from_saved_model(str(saved_model))
    c16.optimizations = [tf.lite.Optimize.DEFAULT]
    c16.target_spec.supported_types = [tf.float16]
    fp16_path = out_dir / "indian_food_cls_fp16.tflite"
    fp16_path.write_bytes(c16.convert())
    results["fp16"] = fp16_path

    def rep_gen():
        for i in range(len(calib_X)):
            yield [calib_X[i : i + 1]]

    ci = tf.lite.TFLiteConverter.from_saved_model(str(saved_model))
    ci.optimizations = [tf.lite.Optimize.DEFAULT]
    ci.representative_dataset = rep_gen
    ci.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    ci.inference_input_type = tf.uint8
    ci.inference_output_type = tf.uint8
    int8_path = out_dir / "indian_food_cls_int8.tflite"
    int8_path.write_bytes(ci.convert())
    results["int8"] = int8_path
    return results


# ----------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--data-dir", default="data/prepared",
                    help="prepared dataset dir (needs labels.txt + val/ + test/)")
    ap.add_argument("--out-dir", default="outputs/tflite")
    ap.add_argument("--img-size", type=int, default=256)
    ap.add_argument("--calib-images", type=int, default=300,
                    help="VAL images used as the INT8 representative set")
    ap.add_argument("--max-eval", type=int, default=1000,
                    help="cap on TEST images evaluated per model (0 = all)")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    labels = [ln.strip() for ln in (data_dir / "labels.txt").read_text().splitlines() if ln.strip()]
    print(f"[convert] {len(labels)} classes; img_size={args.img_size}")

    # calibration set from VAL (stratified-ish: even cap per class)
    per = max(1, args.calib_images // len(labels))
    calib_X, _ = load_split_images(data_dir, "val", labels, args.img_size, limit_per_class=per)
    rng = np.random.default_rng(42)
    calib_X = calib_X[rng.permutation(len(calib_X))[: args.calib_images]]
    print(f"[convert] calibration set: {len(calib_X)} val images")

    work = Path(args.out_dir) / "_onnx2tf"
    saved = onnx_to_saved_model(Path(args.onnx), work)
    models = convert_all(saved, Path(args.out_dir), calib_X)

    # ---- evaluation on held-out TEST --------------------------------------
    test_X, test_y = load_split_images(data_dir, "test", labels, args.img_size)
    if args.max_eval and len(test_X) > args.max_eval:
        idx = rng.permutation(len(test_X))[: args.max_eval]
        test_X, test_y = test_X[idx], test_y[idx]
    print(f"[convert] evaluating on {len(test_X)} held-out test images")

    evals: dict[str, dict] = {}
    all_logits: dict[str, np.ndarray] = {}
    for name, path in models.items():
        t0 = time.time()
        logits = run_tflite(str(path), test_X)
        all_logits[name] = logits
        m = topk_metrics(logits, test_y)
        m["size_mb"] = round(path.stat().st_size / 1e6, 2)
        m["eval_seconds"] = round(time.time() - t0, 1)
        evals[name] = m
        print(f"[convert] {name:5s} top1={m['top1']:.4f} top5={m['top5']:.4f} "
              f"size={m['size_mb']} MB  ({m['eval_seconds']}s)")

    agree = float((all_logits['fp32'].argmax(1) == all_logits['int8'].argmax(1)).mean())
    evals["int8_vs_fp32_top1_agreement"] = round(agree, 4)

    # ---- 5-image side-by-side sanity print --------------------------------
    print("\n[convert] sanity check — first 5 test images (FP32 vs INT8):")
    for i in range(min(5, len(test_X))):
        row = {"true": labels[test_y[i]]}
        for name in ("fp32", "int8"):
            top = np.argsort(-all_logits[name][i])[:3]
            row[name] = [(labels[j], round(float(all_logits[name][i][j]), 2)) for j in top]
        print(f"  true={row['true']}\n    fp32={row['fp32']}\n    int8={row['int8']}")

    out_json = Path(args.out_dir) / "tflite_eval.json"
    out_json.write_text(json.dumps({"labels": labels, "img_size": args.img_size,
                                    "models": evals}, indent=2))
    print(f"\n[convert] wrote {out_json}")
    print("[convert] SUMMARY  " + "  ".join(
        f"{k}: {v['size_mb']}MB top1={v['top1']}" for k, v in evals.items()
        if isinstance(v, dict)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
