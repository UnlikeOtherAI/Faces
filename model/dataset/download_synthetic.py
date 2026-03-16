"""Download DigiFace-1M synthetic face dataset.

DigiFace-1M — Microsoft Research, 2023.
1,219,995 images across 10,006 identities (122 images/identity).
Pre-rendered at 112×112. Zero privacy concerns — fully synthetic.

Paper: https://arxiv.org/abs/2210.02579
Repo:  https://github.com/microsoft/DigiFace1M

Usage:
    python model/dataset/download_synthetic.py --dst data/raw

The download is ~14 GB. Images arrive pre-aligned at 112×112, so
prepare.py runs in fast-mode (no MTCNN needed).
"""

import argparse
import hashlib
import os
import zipfile
from pathlib import Path

import requests
from tqdm import tqdm

# DigiFace-1M is hosted on GitHub Releases under microsoft/DigiFace1M.
# Each zip covers a range of identities (100 identities per file).
BASE_URL = "https://github.com/microsoft/DigiFace1M/releases/download/v1.0"

# 103 zip files covering identities 0000–10005.
# Naming: digiface_{start:04d}_{end:04d}.zip
# Each contains:  <identity_id>/<image_name>.png  (122 images per identity)
N_FILES = 103
IDS_PER_FILE = 100


def file_range(idx: int):
    start = idx * IDS_PER_FILE
    end = min(start + IDS_PER_FILE - 1, 10005)
    return start, end


def download_file(url: str, dest: Path, chunk: int = 1 << 20) -> None:
    """Stream-download url to dest with a progress bar."""
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    with open(dest, "wb") as f, tqdm(
        total=total, unit="B", unit_scale=True, unit_divisor=1024,
        desc=dest.name, leave=False
    ) as bar:
        for chunk_data in resp.iter_content(chunk_size=chunk):
            f.write(chunk_data)
            bar.update(len(chunk_data))


def extract(zip_path: Path, dst: Path) -> None:
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dst)


def download_all(dst: Path, tmp: Path, start_file: int = 0) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    tmp.mkdir(parents=True, exist_ok=True)

    for idx in range(start_file, N_FILES):
        s, e = file_range(idx)
        fname = f"digiface_{s:04d}_{e:04d}.zip"
        url = f"{BASE_URL}/{fname}"
        zip_path = tmp / fname

        # Skip already-extracted identities
        first_id = dst / f"{s:04d}"
        if first_id.exists() and any(first_id.iterdir()):
            print(f"  Already extracted: {fname}")
            continue

        print(f"[{idx+1}/{N_FILES}] Downloading {fname} ...")
        try:
            download_file(url, zip_path)
        except requests.HTTPError as exc:
            print(f"  WARNING: {exc} — skipping {fname}")
            continue

        print(f"  Extracting to {dst} ...")
        extract(zip_path, dst)
        zip_path.unlink()  # remove zip after extraction to save disk

    # Report
    identities = [d for d in dst.iterdir() if d.is_dir()]
    total_images = sum(len(list(d.iterdir())) for d in identities)
    print(f"\nDone. {len(identities)} identities, {total_images:,} images in {dst}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dst",        type=Path, default=Path("data/raw"),
                        help="Destination for extracted identity folders")
    parser.add_argument("--tmp",        type=Path, default=Path("data/.tmp"),
                        help="Temp dir for zip downloads")
    parser.add_argument("--start-file", type=int,  default=0,
                        help="Resume from this zip file index (0-based)")
    args = parser.parse_args()
    download_all(args.dst, args.tmp, args.start_file)


if __name__ == "__main__":
    main()
