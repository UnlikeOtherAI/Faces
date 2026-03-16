"""Prepare real-world face datasets (MTCNN alignment required).

Use this for: CASIA-WebFace, VGGFace2, Glint360K, MS1MV3.
These datasets ship as raw images that need face detection and alignment.

Usage:
    python model/dataset/prepare_real.py --src data/raw --dst data/aligned

Expects src layout:
    <src>/<identity_id>/<image>.{jpg,png}

Produces:
    <dst>/<identity_id>/<image>.jpg  (112x112 aligned crops)

Identities with fewer than --min-images valid crops are dropped.
"""

import argparse
from pathlib import Path

from PIL import Image
from facenet_pytorch import MTCNN
import torch
from tqdm import tqdm


def prepare(src: Path, dst: Path, min_images: int) -> None:
    device = "cuda" if torch.cuda.is_available() else \
             "mps"  if torch.backends.mps.is_available() else "cpu"
    mtcnn = MTCNN(
        image_size=112, margin=14, min_face_size=40,
        device=device, post_process=False,
    )

    identities = sorted(p for p in src.iterdir() if p.is_dir())
    kept = skipped = bad = 0

    for identity in tqdm(identities, desc="Identities"):
        out_dir = dst / identity.name
        exts = {".jpg", ".jpeg", ".png"}
        images = [p for p in identity.iterdir() if p.suffix.lower() in exts]

        crops = []
        for img_path in images:
            try:
                img = Image.open(img_path).convert("RGB")
                crop = mtcnn(img)
                if crop is not None:
                    crops.append((img_path.stem, crop))
                else:
                    bad += 1
            except Exception:
                bad += 1

        if len(crops) < min_images:
            skipped += 1
            continue

        out_dir.mkdir(parents=True, exist_ok=True)
        for stem, crop in crops:
            arr = crop.permute(1, 2, 0).byte().numpy()
            Image.fromarray(arr).save(out_dir / f"{stem}.jpg", quality=95)
        kept += 1

    total = sum(len(list(d.iterdir())) for d in dst.iterdir() if d.is_dir())
    print(f"\nDone. {kept} kept, {skipped} dropped, {bad} bad images. {total:,} total.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src",        type=Path, required=True)
    parser.add_argument("--dst",        type=Path, default=Path("data/aligned"))
    parser.add_argument("--min-images", type=int,  default=5)
    args = parser.parse_args()
    prepare(args.src, args.dst, args.min_images)


if __name__ == "__main__":
    main()
