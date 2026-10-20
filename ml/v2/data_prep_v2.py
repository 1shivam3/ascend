#!/usr/bin/env python3
"""
data_prep_v2.py — ASCEND-ML v2 data preparation (MAXIMUM COVERAGE).

Downloads every verified source, merges them per taxonomy_v2.json into ONE
canonical label set (544 classes: 85 Indian + 459 world), dedupes, caps each
class at 400 images, and writes a stratified 80/10/10 split:

    <out>/train/<class_slug>/...  <out>/val/...  <out>/test/...
    <out>/labels.txt        canonical dish names, one per line (SORTED)
    <out>/region_map.json   {canonical name: "indian" | "world"} for per-region eval
    <out>/prep_report.json  per-source + per-class counts, drops, totals

Sources and download mechanisms (all verified 2026-10-20 — see DATASETS_V2.md):
  khana   HF mirror zip  shuraimi/khana_full_data / khana_100%train_test_split.zip
          (6.92 GB; layout <split>/<Dish Name>/<hash>.jpg), fallback: the
          official Google Drive folder via gdown.
  food101 HF parquet shards of ethz/food101 (image bytes read via pyarrow —
          no decode needed), fallback: load_dataset PIL path.
          NOTE: the old ETH tar.gz URL is dead (404 verified) — do not use it.
  foodx   https://food-x.s3.amazonaws.com/{annot,train,val}.tar
          (annot.tar md5 0c632c543ceed0e70f0eb2db58eda3ab; CSVs are headerless
          filename,label_id; test.tar skipped — its labels were never published)
  uec     official http://foodcam.mobi/dataset256.zip (4.23 GB; folders are
          numeric ids, category.txt maps id -> name), fallback: HF mirror
          kng-research/uecfood256 / dataset256.zip.
  v1cc0   HF bharat-raghunathan/indian-foods-dataset (CC0) — as v1.
  v1mit   HF aaryan317/indian_food_images (MIT-tagged) — in v1 this was behind
          --include-conditional; in v2 it is ALWAYS included (maximum-coverage
          decision, see DATASETS_V2.md) and contributes burger/pizza too.

Dedupe: exact byte-md5 for file-based sources (global, across sources/splits);
v1's 16x16 pixel-hash for PIL-decoded sources (HF datasets). A class is dropped
if fewer than 80 usable images remain after dedupe (taxonomy rule R1, applied
on real pooled counts here). INT8 calibration must use the VAL split only —
the notebook handles that; the test split is never touched by prep decisions
beyond the stratified assignment (same seed-fixed procedure as v1).

DISK DISCIPLINE (fixed 2026-10-21 after a Kaggle disk-full failure): sources
are processed ONE AT A TIME. Each source is downloaded + staged, then MERGED
into a persistent per-class pool store (cap applied incrementally — shuffling
the combined list and keeping the first N is a uniform random subset of the
union, statistically identical to capping the full pool at the end), and its
staging tree + archives are DELETED before the next source starts. Peak disk
is roughly: pool-so-far + one staged source + one archive (~35 GB worst case,
during Khana) instead of the whole ~50 GB+ at once. Survivors are MOVED
(renames), never copied, so merging costs no extra space. If a run dies
mid-way, re-running reuses any staged source trees it finds (collectors skip
re-download when their extraction marker exists) and frees space as it merges.

Usage (Kaggle, see RUNBOOK_V2.md):
    python data_prep_v2.py --out /kaggle/working/outputs/prepared_v2 \
                           --work /kaggle/working/_dl_v2
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import random
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
TAXONOMY_PATH = HERE / "taxonomy_v2.json"

MAX_PER_CLASS = 400
MIN_PER_CLASS = 80
SEED = 42
SPLIT = (0.8, 0.1, 0.1)  # train / val / test

KHANA_HF_REPO = "shuraimi/khana_full_data"
KHANA_HF_FILE = "khana_100%train_test_split.zip"
KHANA_DRIVE_FOLDER = "https://drive.google.com/drive/folders/1PWyJdkizw5ABBd8BIAnr_FZq91YZ2Uo0"
FOODX_BASE = "https://food-x.s3.amazonaws.com"
FOODX_ANNOT_MD5 = "0c632c543ceed0e70f0eb2db58eda3ab"
UEC_ZIP_URL = "http://foodcam.mobi/dataset256.zip"
UEC_HF_REPO = "kng-research/uecfood256"
UEC_HF_FILE = "dataset256.zip"
FOOD101_REPO = "ethz/food101"
V1_CC0 = "bharat-raghunathan/indian-foods-dataset"
V1_MIT = "aaryan317/indian_food_images"


# ----------------------------------------------------------------- taxonomy --
def load_taxonomy() -> tuple[dict[str, dict[str, str]], dict[str, str]]:
    """Return (per-source {raw_label: canonical}, {canonical: region})."""
    tax = json.loads(TAXONOMY_PATH.read_text())
    per_source: dict[str, dict[str, str]] = defaultdict(dict)
    regions: dict[str, str] = {}
    for cls in tax["classes"]:
        regions[cls["name"]] = cls["region"]
        for source, raws in cls["sources"].items():
            for raw in raws:
                per_source[source][raw] = cls["name"]
    return per_source, regions


# ------------------------------------------------------------------ helpers --
def log(msg: str) -> None:
    print(f"[prep-v2] {msg}", flush=True)


def free_gb(path: Path) -> float:
    try:
        return shutil.disk_usage(path).free / 1e9
    except Exception:
        return -1.0


def download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        log(f"  cached: {dest.name}")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "ascend-ml-prep/2.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f, length=1024 * 1024)
    log(f"  downloaded {dest.name} ({dest.stat().st_size / 1e9:.2f} GB)")
    return dest


def hf_download(repo: str, filename: str, dest_dir: Path) -> Path:
    from huggingface_hub import hf_hub_download
    p = hf_hub_download(repo_id=repo, filename=filename, repo_type="dataset",
                        local_dir=str(dest_dir))
    return Path(p)


def extract_zip(zip_path: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    if shutil.which("unzip"):
        subprocess.run(["unzip", "-q", "-o", str(zip_path), "-d", str(dest)],
                       check=True, stdin=subprocess.DEVNULL)
    else:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(dest)


def extract_tar(tar_path: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path) as tf:
        tf.extractall(dest, filter="data")


def md5_of(path: Path, buf: int = 1024 * 1024) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        while chunk := f.read(buf):
            h.update(chunk)
    return h.hexdigest()


def valid_image(path: Path) -> bool:
    try:
        from PIL import Image
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        return False


class Pools:
    """Staged files for the CURRENT source + the persistent merged pool.

    files: canonical -> [staged paths from the source being collected]
    kept:  canonical -> [paths inside the pool store, cap applied]
    seen:  global dedupe keys across ALL sources (whole run)
    """

    def __init__(self) -> None:
        self.files: dict[str, list[Path]] = defaultdict(list)
        self.kept: dict[str, list[Path]] = defaultdict(list)
        self.seen: set[str] = set()
        self.stats: dict[str, dict[str, int]] = defaultdict(
            lambda: {"ingested": 0, "dupes": 0, "corrupt": 0, "unmapped": 0})

    def add_file(self, source: str, canonical: str, path: Path) -> None:
        st = self.stats[source]
        st["ingested"] += 1
        key = "md5:" + md5_of(path)
        if key in self.seen:
            st["dupes"] += 1
            return
        if not valid_image(path):
            st["corrupt"] += 1
            return
        self.seen.add(key)
        self.files[canonical].append(path)

    def add_pil(self, source: str, canonical: str, image, stage_dir: Path) -> None:
        """HF-dataset path: dedupe on the 16x16 pixel hash (v1 method), then
        stage to disk as JPEG so the merge phase is uniform."""
        from PIL import Image  # noqa: F401
        st = self.stats[source]
        st["ingested"] += 1
        thumb = image.convert("RGB").resize((16, 16))
        key = "px:" + hashlib.md5(thumb.tobytes()).hexdigest()
        if key in self.seen:
            st["dupes"] += 1
            return
        self.seen.add(key)
        stage_dir.mkdir(parents=True, exist_ok=True)
        out = stage_dir / f"{source}_{st['ingested']:07d}.jpg"
        image.convert("RGB").save(out, "JPEG", quality=92)
        self.files[canonical].append(out)


def merge_staged(pools: Pools, pool_root: Path, rng: random.Random,
                 max_per_class: int) -> None:
    """Fold the current source's staged files into the persistent pool.

    For every touched class: combined = pool-so-far + staged, shuffled,
    capped; survivors are MOVED into the pool store (renames — no extra
    disk), non-survivors are deleted. Shuffling the union and keeping the
    first N is a uniform random N-subset, so incremental capping is
    statistically identical to capping the full pool once at the end.
    """
    for canon, staged in list(pools.files.items()):
        combined = list(pools.kept.get(canon, [])) + list(staged)
        rng.shuffle(combined)
        survivors, excess = combined[:max_per_class], combined[max_per_class:]
        dest_dir = pool_root / canon
        dest_dir.mkdir(parents=True, exist_ok=True)
        new_paths: list[Path] = []
        for p in survivors:
            if p.parent == dest_dir:
                new_paths.append(p)
                continue
            dest = dest_dir / p.name
            i = 0
            while dest.exists():
                i += 1
                dest = dest_dir / f"{p.stem}_{i}{p.suffix}"
            shutil.move(str(p), str(dest))
            new_paths.append(dest)
        for p in excess:
            p.unlink(missing_ok=True)
        pools.kept[canon] = new_paths
    pools.files.clear()


# ------------------------------------------------------------- source: khana --
def collect_khana(work: Path, raw2canon: dict[str, str], pools: Pools) -> list[Path]:
    src_dir = work / "khana"
    if not (src_dir / "_extracted").exists():
        try:
            zp = hf_download(KHANA_HF_REPO, KHANA_HF_FILE, work / "khana_dl")
            extract_zip(zp, src_dir)
            zp.unlink(missing_ok=True)
        except Exception as e:
            log(f"  khana HF mirror failed ({e}); trying Google Drive folder via gdown")
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "gdown"],
                           check=False)
            subprocess.run(["gdown", "--folder", KHANA_DRIVE_FOLDER, "-O", str(src_dir)],
                           check=False)
        (src_dir / "_extracted").touch()
    n = 0
    for img in sorted(src_dir.rglob("*")):
        if not img.is_file() or img.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        canon = raw2canon.get(img.parent.name)
        if canon is None:
            pools.stats["khana"]["unmapped"] += 1
            continue
        pools.add_file("khana", canon, img)
        n += 1
    log(f"  khana: {n} images staged")
    return [src_dir, work / "khana_dl"]


# ------------------------------------------------------------- source: foodx --
def collect_foodx(work: Path, raw2canon: dict[str, str], pools: Pools) -> list[Path]:
    src_dir = work / "foodx"
    if not (src_dir / "_extracted").exists():
        annot = download(f"{FOODX_BASE}/annot.tar", work / "foodx_dl" / "annot.tar")
        got = md5_of(annot)
        assert got == FOODX_ANNOT_MD5, f"annot.tar md5 mismatch: {got} != {FOODX_ANNOT_MD5}"
        extract_tar(annot, src_dir)
        annot.unlink(missing_ok=True)
        for split in ("train", "val"):  # test.tar skipped: labels never published
            tar_p = download(f"{FOODX_BASE}/{split}.tar", work / "foodx_dl" / f"{split}.tar")
            extract_tar(tar_p, src_dir)
            tar_p.unlink(missing_ok=True)
        (src_dir / "_extracted").touch()
    id2name: dict[str, str] = {}
    for ln in (src_dir / "class_list.txt").read_text().splitlines():
        parts = ln.strip().split(None, 1)
        if len(parts) == 2:
            id2name[parts[0]] = parts[1]
    by_name: dict[str, Path] = {}
    for img in src_dir.rglob("*.jpg"):
        by_name[img.name] = img
    n = 0
    for split in ("train", "val"):
        with open(src_dir / f"{split}_info.csv", newline="") as f:
            for fname, lid in csv.reader(f):
                canon = raw2canon.get(id2name.get(lid.strip(), ""))
                path = by_name.get(fname.strip())
                if canon is None or path is None:
                    pools.stats["foodx"]["unmapped"] += 1
                    continue
                pools.add_file("foodx", canon, path)
                n += 1
    log(f"  foodx: {n} images staged")
    return [src_dir, work / "foodx_dl"]


# --------------------------------------------------------------- source: uec --
def collect_uec(work: Path, raw2canon: dict[str, str], pools: Pools) -> list[Path]:
    src_dir = work / "uec"
    if not (src_dir / "_extracted").exists():
        try:
            zp = download(UEC_ZIP_URL, work / "uec_dl" / "dataset256.zip")
            extract_zip(zp, src_dir)
            zp.unlink(missing_ok=True)
        except Exception as e:
            log(f"  uec official zip failed ({e}); trying HF mirror")
            zp = hf_download(UEC_HF_REPO, UEC_HF_FILE, work / "uec_dl")
            extract_zip(zp, src_dir)
            zp.unlink(missing_ok=True)
        (src_dir / "_extracted").touch()
    cat_files = list(src_dir.rglob("category.txt"))
    assert cat_files, "UECFood256 category.txt not found after extraction"
    root = cat_files[0].parent
    id2name: dict[str, str] = {}
    for ln in cat_files[0].read_text(errors="replace").splitlines()[1:]:
        if "\t" in ln:
            cid, name = ln.split("\t", 1)
            id2name[cid.strip()] = name.strip()
    n = 0
    for folder in sorted(root.iterdir()):
        if not folder.is_dir():
            continue
        canon = raw2canon.get(id2name.get(folder.name, ""))
        if canon is None:
            pools.stats["uec"]["unmapped"] += 1
            continue
        for img in sorted(folder.iterdir()):
            if img.suffix.lower() in (".jpg", ".jpeg", ".png"):
                pools.add_file("uec", canon, img)
                n += 1
    log(f"  uec: {n} images staged")
    return [src_dir, work / "uec_dl"]


# ----------------------------------------------------------- source: food101 --
def collect_food101(work: Path, raw2canon: dict[str, str], pools: Pools) -> list[Path]:
    names_sorted = sorted(raw2canon)  # ClassLabel order for ethz/food101 is alphabetical
    stage = work / "food101_stage"
    try:
        import pyarrow.parquet as pq
        from huggingface_hub import list_repo_files
        files = [f for f in list_repo_files(FOOD101_REPO, repo_type="dataset")
                 if f.startswith("data/") and f.endswith(".parquet")]
        assert files, "no parquet shards listed"
        n = 0
        for fname in sorted(files):
            shard = hf_download(FOOD101_REPO, fname, work / "food101_dl")
            table = pq.read_table(shard, columns=["image", "label"])
            images = table.column("image").to_pylist()
            labels = table.column("label").to_pylist()
            for struct, lid in zip(images, labels):
                canon = raw2canon.get(names_sorted[int(lid)])
                if canon is None:
                    pools.stats["food101"]["unmapped"] += 1
                    continue
                stage.mkdir(parents=True, exist_ok=True)
                tmp = stage / f"f101_{n:07d}.jpg"
                tmp.write_bytes(struct["bytes"])
                pools.add_file("food101", canon, tmp)
                n += 1
            shard.unlink(missing_ok=True)
        log(f"  food101: {n} images staged (parquet bytes path)")
        return [stage, work / "food101_dl"]
    except Exception as e:
        log(f"  food101 parquet path failed ({e}); falling back to load_dataset PIL path")
    from datasets import load_dataset
    n = 0
    for split in ("train", "validation"):
        ds = load_dataset(FOOD101_REPO, split=split)
        label_names = ds.features["label"].names
        for item in ds:
            canon = raw2canon.get(label_names[item["label"]])
            if canon is None:
                pools.stats["food101"]["unmapped"] += 1
                continue
            pools.add_pil("food101", canon, item["image"], stage)
            n += 1
    log(f"  food101: {n} images staged (PIL fallback path)")
    return [stage, work / "food101_dl"]


# -------------------------------------------------------------- source: v1 HF --
def collect_v1(source: str, repo: str, work: Path,
               raw2canon: dict[str, str], pools: Pools) -> list[Path]:
    from datasets import load_dataset
    stage = work / f"{source}_stage"
    n = 0
    try:
        ds = load_dataset(repo)
        splits = list(ds.values())
    except Exception:
        splits = [load_dataset(repo, split="train")]
    for split_ds in splits:
        label_names = split_ds.features["label"].names
        for item in split_ds:
            canon = raw2canon.get(label_names[item["label"]])
            if canon is None:
                pools.stats[source]["unmapped"] += 1
                continue
            pools.add_pil(source, canon, item["image"], stage)
            n += 1
    log(f"  {source}: {n} images staged")
    return [stage]


# --------------------------------------------------------------------- main --
COLLECTORS = ("khana", "food101", "foodx", "uec", "v1cc0", "v1mit")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, required=True, help="prepared dataset output dir")
    ap.add_argument("--work", type=Path, default=Path("/kaggle/working/_dl_v2"),
                    help="download/staging dir")
    ap.add_argument("--max-per-class", type=int, default=MAX_PER_CLASS)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--only", default="", help="comma-separated subset of sources (debug)")
    args = ap.parse_args()

    if (args.out / "labels.txt").exists():
        log(f"prepared dataset already exists at {args.out} — nothing to do")
        return 0

    # Contain the HF datasets cache inside the work dir so it can be cleaned
    # with everything else (datasets/hub read HF_HOME at import time; all
    # imports of them happen inside the collectors, after this line).
    args.work.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(args.work / "hf_cache"))

    per_source, regions = load_taxonomy()
    pools = Pools()
    rng = random.Random(args.seed)
    pool_root = args.work / "_pool"
    only = {s.strip() for s in args.only.split(",") if s.strip()} or set(COLLECTORS)
    failures: dict[str, str] = {}

    plan = [
        ("khana", lambda: collect_khana(args.work, per_source["khana"], pools)),
        ("food101", lambda: collect_food101(args.work, per_source["food101"], pools)),
        ("foodx", lambda: collect_foodx(args.work, per_source["foodx"], pools)),
        ("uec", lambda: collect_uec(args.work, per_source["uec"], pools)),
        ("v1cc0", lambda: collect_v1("v1cc0", V1_CC0, args.work, per_source["v1cc0"], pools)),
        ("v1mit", lambda: collect_v1("v1mit", V1_MIT, args.work, per_source["v1mit"], pools)),
    ]
    for name, fn in plan:
        if name not in only:
            continue
        log(f"source: {name} (disk free: {free_gb(args.work):.1f} GB)")
        try:
            stage_roots = fn()
        except Exception as e:  # one dead source must not kill the session
            failures[name] = f"{type(e).__name__}: {e}"
            log(f"  !! source {name} FAILED: {failures[name]}")
            pools.files.clear()  # drop any partial staging refs from this source
            continue
        # Merge this source into the pool NOW, then delete its staging tree —
        # this is what keeps peak disk at ~one source instead of all six.
        merge_staged(pools, pool_root, rng, args.max_per_class)
        for root in stage_roots:
            shutil.rmtree(root, ignore_errors=True)
        pooled = sum(len(v) for v in pools.kept.values())
        log(f"  {name} merged -> pool holds {pooled} images "
            f"(disk free: {free_gb(args.work):.1f} GB)")

    # floor + split ------------------------------------------------------------
    # Class folders are named with the label string itself (spaces included),
    # exactly as v1: the notebook's FolderDataset enumerates classes in
    # labels.txt order and opens root/<label>, so the two stay aligned by
    # construction. (A slug/underscore scheme would NOT be alignment-safe:
    # 'hot and sour soup' vs 'hot and sour, fish and vegetable ragout' order
    # differently under name-sort vs slug-sort because ',' sits between
    # ' ' and '_' in ASCII.)
    kept: dict[str, list[Path]] = {}
    dropped: list[dict] = []
    for canon, files in sorted(pools.kept.items()):
        if len(files) < MIN_PER_CLASS:
            dropped.append({"class": canon, "usable": len(files),
                            "reason": f"below {MIN_PER_CLASS}-image floor after dedupe"})
            for f in files:
                f.unlink(missing_ok=True)
            continue
        kept[canon] = list(files)
    labels = sorted(kept)
    assert all("/" not in lbl and lbl == lbl.strip() for lbl in labels), "unsafe label"

    totals = {"train": 0, "val": 0, "test": 0}
    per_class: dict[str, dict[str, int]] = {}
    for canon in labels:
        files = kept[canon]
        rng.shuffle(files)
        n = len(files)
        n_test = max(1, round(n * SPLIT[2]))
        n_val = max(1, round(n * SPLIT[1]))
        parts = {"train": files[: n - n_val - n_test],
                 "val": files[n - n_val - n_test: n - n_test],
                 "test": files[n - n_test:]}
        per_class[canon] = {k: len(v) for k, v in parts.items()}
        for split, part in parts.items():
            d = args.out / split / canon
            d.mkdir(parents=True, exist_ok=True)
            for i, src in enumerate(part):
                shutil.move(str(src), str(d / f"{i:05d}{src.suffix.lower()}"))
            totals[split] += len(part)

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "labels.txt").write_text("\n".join(labels) + "\n")
    (args.out / "region_map.json").write_text(
        json.dumps({lbl: regions[lbl] for lbl in labels}, indent=1))
    report = {
        "classes": len(labels),
        "indian_classes": sum(1 for lbl in labels if regions[lbl] == "indian"),
        "world_classes": sum(1 for lbl in labels if regions[lbl] == "world"),
        "totals": totals,
        "total_images": sum(totals.values()),
        "max_per_class": args.max_per_class,
        "min_per_class": MIN_PER_CLASS,
        "seed": args.seed,
        "sources": {k: dict(v) for k, v in sorted(pools.stats.items())},
        "source_failures": failures,
        "dropped_classes": dropped,
        "per_class": per_class,
    }
    (args.out / "prep_report.json").write_text(json.dumps(report, indent=1))
    shutil.rmtree(pool_root, ignore_errors=True)
    shutil.rmtree(args.work / "hf_cache", ignore_errors=True)
    log(f"DONE: {report['classes']} classes, {report['total_images']} images "
        f"(train {totals['train']} / val {totals['val']} / test {totals['test']})")
    if failures:
        log(f"WARNING: failed sources: {failures}")
    if dropped:
        log(f"dropped {len(dropped)} classes below the floor: "
            f"{[d['class'] for d in dropped]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
