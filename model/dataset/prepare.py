"""Dataset preparation: align and crop faces to 112x112 using MTCNN.

Usage:
    python model/dataset/prepare.py --src data/raw --dst data/aligned

Expects src layout:
    <src>/<identity_id>/<image>.jpg

Produces:
    <dst>/<identity_id>/<image>.jpg   (112x112 aligned crops)

Identities with fewer than --min-images faces after alignment are dropped.
"""

import argparse
import os
from pathlib import Path

from PIL import Image
from facenet_pytorch import MTCNN
from tqdm import tqdm


def prepare(src: Path, dst: Path, min_images: int, image_size: int) -> None:
    device = "cuda" if __import__("torch").cuda.is_available() else "cpu"
    mtcnn = MTCNN(image_size=image_size, margin=14,
                  min_face_size=40, device=device,
                  post_process=False)

    identities = sorted(p for p in src.iterdir() if p.is_dir())
    kept = skipped = 0

    for identity in tqdm(identities, desc="Identities"):
        out_dir = dst / identity.name
        images = list(identity.glob("*.jpg")) + list(identity.glob("*.png"))

        crops = []
        for img_path in images:
            try:
                img = Image.open(img_path).convert("RGB")
                crop = mtcnn(img)
                if crop is not None:
                    crops.append((img_path.stem, crop))
            except Exception as e:
                print(f"  skip {img_path.name}: {e}")

        if len(crops) < min_images:
            skipped += 1
            continue

        out_dir.mkdir(parents=True, exist_ok=True)
        for stem, crop in crops:
            # crop is a (3, H, W) uint8 tensor
            arr = crop.permute(1, 2, 0).numpy()
            Image.fromarray(arr).save(out_dir / f"{stem}.jpg", quality=95)
        kept += 1

    print(f"\nDone. {kept} identities kept, {skipped} dropped (<{min_images} images).")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True, type=Path)
    parser.add_argument("--dst", required=True, type=Path)
    parser.add_argument("--min-images", type=int, default=5)
    parser.add_argument("--image-size", type=int, default=112)
    args = parser.parse_args()
    prepare(args.src, args.dst, args.min_images, args.image_size)


if __name__ == "__main__":
    main()
