"""Convert MXNet RecordIO dataset (MS1MV3, etc.) to folder-per-identity layout.

Usage:
    pip install mxnet  # only needed for this conversion
    python model/dataset/convert_mxnet.py \
        --rec  data/ms1mv3/train.rec \
        --idx  data/ms1mv3/train.idx \
        --dst  data/raw

Produces:
    data/raw/<identity_id>/<image_index>.jpg
"""

import argparse
from pathlib import Path

from PIL import Image
from tqdm import tqdm


def convert(rec_path: Path, idx_path: Path, dst: Path) -> None:
    try:
        import mxnet as mx
    except ImportError:
        raise SystemExit("Install mxnet first:  pip install mxnet")

    record = mx.recordio.MXIndexedRecordIO(
        str(idx_path), str(rec_path), "r"
    )
    dst.mkdir(parents=True, exist_ok=True)

    idx = 0
    counts: dict[str, int] = {}

    while True:
        item = record.read()
        if item is None:
            break
        header, img_bytes = mx.recordio.unpack(item)
        label = str(int(header.label))

        out_dir = dst / label
        out_dir.mkdir(exist_ok=True)

        count = counts.get(label, 0)
        out_path = out_dir / f"{count:05d}.jpg"
        counts[label] = count + 1

        try:
            img = mx.image.imdecode(img_bytes).asnumpy()
            Image.fromarray(img).save(out_path, quality=95)
        except Exception as e:
            print(f"  skip record {idx}: {e}")

        idx += 1
        if idx % 100_000 == 0:
            print(f"  {idx:,} records processed, {len(counts):,} identities...")

    total = sum(counts.values())
    print(f"\nDone. {len(counts):,} identities, {total:,} images → {dst}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rec", type=Path, required=True)
    parser.add_argument("--idx", type=Path)
    parser.add_argument("--dst", type=Path, default=Path("data/raw"))
    args = parser.parse_args()
    idx = args.idx or args.rec.with_suffix(".idx")
    convert(args.rec, idx, args.dst)


if __name__ == "__main__":
    main()
