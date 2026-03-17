"""Download DigiFace-1M synthetic face dataset.

DigiFace-1M — Microsoft Research, 2023.
~1.2M images across 110K identities. Pre-rendered at 112×112.
Zero privacy concerns — fully synthetic.

Paper: https://arxiv.org/abs/2210.02579
Repo:  https://github.com/microsoft/DigiFace1M

Usage:
    python model/dataset/download_synthetic.py --dst data/raw

The 72-img set (~14 GB, 10K identities) is downloaded by default.
Pass --include-5img to also fetch the 5-img set (100K identities, ~6 GB).
Images arrive pre-aligned at 112×112, so prepare.py needs no MTCNN.
"""

import argparse
import zipfile
from pathlib import Path

import requests
from tqdm import tqdm

BASE_URL = "https://facesyntheticspubwedata.z6.web.core.windows.net/wacv-2023"

# (filename, first_subject_dir_inside_zip)
FILES_72 = [
    ("subjects_0-1999_72_imgs.zip",         "0"),
    ("subjects_2000-3999_72_imgs.zip",       "2000"),
    ("subjects_4000-5999_72_imgs.zip",       "4000"),
    ("subjects_6000-7999_72_imgs.zip",       "6000"),
    ("subjects_8000-9999_72_imgs.zip",       "8000"),
]

FILES_5 = [
    ("subjects_100000-133332_5_imgs.zip",    "100000"),
    ("subjects_133333-166665_5_imgs.zip",    "133333"),
    ("subjects_166666-199998_5_imgs.zip",    "166666"),
]


def download_file(url: str, dest: Path, chunk: int = 1 << 20) -> None:
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    with open(dest, "wb") as f, tqdm(
        total=total, unit="B", unit_scale=True, unit_divisor=1024,
        desc=dest.name, leave=False,
    ) as bar:
        for chunk_data in resp.iter_content(chunk_size=chunk):
            f.write(chunk_data)
            bar.update(len(chunk_data))


def extract(zip_path: Path, dst: Path) -> None:
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dst)


def download_all(dst: Path, tmp: Path, files: list, start_file: int = 0) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    tmp.mkdir(parents=True, exist_ok=True)

    for idx, (fname, first_dir) in enumerate(files):
        if idx < start_file:
            continue

        first_id = dst / first_dir
        if first_id.exists() and any(first_id.iterdir()):
            print(f"[{idx+1}/{len(files)}] Already extracted: {fname}")
            continue

        url = f"{BASE_URL}/{fname}"
        zip_path = tmp / fname
        print(f"[{idx+1}/{len(files)}] Downloading {fname} ...")
        try:
            download_file(url, zip_path)
        except requests.HTTPError as exc:
            print(f"  WARNING: {exc} — skipping {fname}")
            continue

        print(f"  Extracting to {dst} ...")
        extract(zip_path, dst)
        zip_path.unlink()

    identities = [d for d in dst.iterdir() if d.is_dir()]
    total_images = sum(len(list(d.iterdir())) for d in identities)
    print(f"\nDone. {len(identities)} identities, {total_images:,} images in {dst}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dst",          type=Path, default=Path("data/raw"),
                        help="Destination for extracted identity folders")
    parser.add_argument("--tmp",          type=Path, default=Path("data/.tmp"),
                        help="Temp dir for zip downloads")
    parser.add_argument("--start-file",   type=int,  default=0,
                        help="Resume from this zip file index (0-based, within selected set)")
    parser.add_argument("--include-5img", action="store_true",
                        help="Also download the 5-images/identity set (100K identities)")
    args = parser.parse_args()

    files = FILES_72 + (FILES_5 if args.include_5img else [])
    download_all(args.dst, args.tmp, files, args.start_file)


if __name__ == "__main__":
    main()
