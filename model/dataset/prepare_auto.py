"""Auto-detect and prepare all available face datasets.

Checks for DigiFace-1M and Glint360K, prepares whatever is found,
and merges both into data/aligned/ when both are present.

Called automatically by `make prepare` (default DATASET=auto).

Usage:
    python model/dataset/prepare_auto.py
    python model/dataset/prepare_auto.py --base model/data
"""

import argparse
import subprocess
import sys
from pathlib import Path


def _run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def _count(path: Path) -> int:
    return sum(1 for p in path.iterdir() if p.is_dir()) if path.is_dir() else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, default=Path("model/data"))
    args = parser.parse_args()
    base = args.base

    raw_digiface       = base / "raw"
    raw_glint          = base / "raw_glint"
    raw_glint_conv     = base / "raw_glint_converted"
    aligned            = base / "aligned"
    aligned_digiface   = base / "aligned_digiface"
    aligned_glint      = base / "aligned_glint"

    # ── detect ──────────────────────────────────────────────────────────────────
    has_digiface = raw_digiface.is_dir() and _count(raw_digiface) > 0
    has_glint    = (raw_glint / "train.rec").exists()

    if not has_digiface and not has_glint:
        sys.exit("No dataset found. Run 'make download' first.")

    datasets = []
    if has_digiface:
        datasets.append("DigiFace-1M")
    if has_glint:
        datasets.append("Glint360K")
    print(f"Datasets found: {', '.join(datasets)}")

    # ── prepare each ────────────────────────────────────────────────────────────
    need_merge = has_digiface and has_glint

    if has_digiface:
        dst = str(aligned_digiface if need_merge else aligned)
        print(f"\nPreparing DigiFace-1M → {dst}")
        _run("model/dataset/prepare_synthetic.py", "--src", str(raw_digiface), "--dst", dst)

    if has_glint:
        if not (raw_glint_conv.is_dir() and _count(raw_glint_conv) > 0):
            print(f"\nConverting Glint360K .rec → {raw_glint_conv}")
            _run("model/dataset/convert_mxnet.py",
                 "--rec", str(raw_glint / "train.rec"),
                 "--dst", str(raw_glint_conv))
        else:
            print(f"\nGlint360K already converted at {raw_glint_conv}")

        dst = str(aligned_glint if need_merge else aligned)
        print(f"\nPreparing Glint360K → {dst}")
        _run("model/dataset/prepare_synthetic.py", "--src", str(raw_glint_conv), "--dst", dst)

    # ── merge if both ────────────────────────────────────────────────────────────
    if need_merge:
        print(f"\nMerging into {aligned}")
        _run("model/dataset/merge_datasets.py",
             "--src", f"digiface:{aligned_digiface}",
             "--src", f"glint:{aligned_glint}",
             "--dst", str(aligned))

    # ── summary ──────────────────────────────────────────────────────────────────
    n_ids  = _count(aligned)
    n_imgs = sum(len(list(d.iterdir())) for d in aligned.iterdir() if d.is_dir())
    print(f"\nReady: {n_ids:,} identities, {n_imgs:,} images → {aligned}")
    print("Run:  make fit")


if __name__ == "__main__":
    main()
