"""Merge multiple aligned face directories into one with prefixed identity names.

Avoids label collisions when combining datasets that use plain integer identity
names (DigiFace, Glint360K, etc.). Creates symlinks — no disk duplication.

Usage:
    python model/dataset/merge_datasets.py \
        --src digiface:data/aligned_digiface \
        --src glint:data/aligned_glint \
        --dst data/aligned
"""

import argparse
from pathlib import Path


def merge(sources: list[tuple[str, Path]], dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    total_ids = total_imgs = 0

    for prefix, src in sources:
        ids = sorted(p for p in src.iterdir() if p.is_dir())
        for identity in ids:
            out_dir = dst / f"{prefix}_{identity.name}"
            out_dir.mkdir(exist_ok=True)
            for img in identity.iterdir():
                link = out_dir / img.name
                if not link.exists():
                    link.symlink_to(img.resolve())
            total_imgs += len(list(out_dir.iterdir()))
        total_ids += len(ids)
        print(f"  {prefix}: {len(ids):,} identities from {src}")

    print(f"\nMerged: {total_ids:,} identities, {total_imgs:,} images → {dst}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", action="append", required=True,
                        metavar="PREFIX:DIR",
                        help="Repeat for each source, e.g. digiface:data/aligned_digiface")
    parser.add_argument("--dst", type=Path, required=True)
    args = parser.parse_args()

    sources = []
    for s in args.src:
        prefix, path = s.split(":", 1)
        sources.append((prefix, Path(path)))

    merge(sources, args.dst)


if __name__ == "__main__":
    main()
