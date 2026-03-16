"""Prepare DigiFace-1M for training — fast path (no MTCNN needed).

DigiFace images are already 112×112 and face-centred. This script:
  1. Validates all images (drops corrupt files)
  2. Filters identities with fewer than --min-images valid images
  3. Copies/symlinks to data/aligned/ with integer identity folder names
     so FaceDataset can read them directly

Usage:
    python model/dataset/prepare_synthetic.py \
        --src  data/raw \
        --dst  data/aligned \
        --min-images 10

Runtime: ~2 min for 1.2M images on SSD.
"""

import argparse
import shutil
from pathlib import Path

from PIL import Image
from tqdm import tqdm


def validate_image(path: Path) -> bool:
    try:
        with Image.open(path) as img:
            img.verify()
        return True
    except Exception:
        return False


def prepare(src: Path, dst: Path, min_images: int, copy: bool) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    identities = sorted(p for p in src.iterdir() if p.is_dir())
    kept = skipped = bad = 0

    for identity in tqdm(identities, desc="Identities"):
        images = list(identity.glob("*.png")) + list(identity.glob("*.jpg"))
        valid = [p for p in images if validate_image(p)]
        bad += len(images) - len(valid)

        if len(valid) < min_images:
            skipped += 1
            continue

        out_dir = dst / identity.name
        out_dir.mkdir(exist_ok=True)

        for img_path in valid:
            dest = out_dir / img_path.name
            if dest.exists():
                continue
            if copy:
                shutil.copy2(img_path, dest)
            else:
                dest.symlink_to(img_path.resolve())

        kept += 1

    print(f"\nDone.")
    print(f"  Identities kept    : {kept}")
    print(f"  Identities dropped : {skipped}  (<{min_images} valid images)")
    print(f"  Corrupt images     : {bad}")
    total = sum(len(list(d.iterdir())) for d in dst.iterdir() if d.is_dir())
    print(f"  Total images ready : {total:,}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src",        type=Path, default=Path("data/raw"))
    parser.add_argument("--dst",        type=Path, default=Path("data/aligned"))
    parser.add_argument("--min-images", type=int,  default=10)
    parser.add_argument("--copy",       action="store_true",
                        help="Copy files instead of symlinking (slower, portable)")
    args = parser.parse_args()
    prepare(args.src, args.dst, args.min_images, args.copy)


if __name__ == "__main__":
    main()
