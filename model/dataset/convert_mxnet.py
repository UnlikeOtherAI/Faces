"""Convert MXNet RecordIO dataset to folder-per-identity layout.

Pure Python — no mxnet dependency. Compatible with InsightFace .rec files
(Glint360K, MS1MV3, CASIA-WebFace, etc.).

Usage:
    python model/dataset/convert_mxnet.py \
        --rec  data/raw_glint/train.rec \
        --idx  data/raw_glint/train.idx \
        --dst  data/raw_glint_converted

Produces:
    data/raw_glint_converted/<identity_id>/<image_index>.jpg
"""

import argparse
import io
import struct
from pathlib import Path

from PIL import Image
from tqdm import tqdm

# InsightFace RecordIO format (MXNet binary, little-endian):
#   Per record:
#     magic   4B  uint32  0xced7230a
#     size    4B  uint32  bytes of content that follow (excl. magic, size, padding)
#     flag    4B  uint32  0 for standard InsightFace records
#     label   4B  float32 identity ID
#     id      8B  uint64  record index
#     id2     8B  uint64  unused (0)
#     image   (size - 24) bytes  JPEG data
#     padding 0-3 bytes  zero-pad to 4-byte alignment of content
#
# Index file (.idx) is a plain text file: "key\toffset\n"
#   key    integer  record number
#   offset integer  byte offset in .rec file

MAGIC = 0xCED7230A
_HDR_FMT  = "<IfQQ"                        # flag + label + id + id2
_HDR_SIZE = struct.calcsize(_HDR_FMT)       # 24 bytes


def _read_idx(idx_path: Path) -> dict[int, int]:
    idx: dict[int, int] = {}
    with open(idx_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            key, offset = line.split("\t")
            idx[int(key)] = int(offset)
    return idx


def _iter_records(rec_path: Path, idx: dict[int, int]):
    with open(rec_path, "rb") as f:
        for key in sorted(idx):
            f.seek(idx[key])
            hdr = f.read(8)
            if len(hdr) < 8:
                continue
            magic, size = struct.unpack("<II", hdr)
            if magic != MAGIC or size <= _HDR_SIZE:
                continue
            fields = struct.unpack(_HDR_FMT, f.read(_HDR_SIZE))
            _, label, _, _ = fields
            img_bytes = f.read(size - _HDR_SIZE)
            yield int(label), img_bytes


def convert(rec_path: Path, idx_path: Path, dst: Path) -> None:
    idx = _read_idx(idx_path)
    dst.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}

    for identity_id, img_bytes in tqdm(
        _iter_records(rec_path, idx),
        total=len(idx),
        desc="Converting",
    ):
        label = str(identity_id)
        out_dir = dst / label
        out_dir.mkdir(exist_ok=True)
        count = counts.get(label, 0)
        out_path = out_dir / f"{count:05d}.jpg"
        counts[label] = count + 1
        try:
            Image.open(io.BytesIO(img_bytes)).convert("RGB").save(out_path, quality=95)
        except Exception:
            pass

    print(f"\nDone. {len(counts):,} identities, {sum(counts.values()):,} images → {dst}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rec", type=Path, required=True)
    parser.add_argument("--idx", type=Path)
    parser.add_argument("--dst", type=Path, default=Path("data/raw_glint_converted"))
    args = parser.parse_args()
    convert(args.rec, args.idx or args.rec.with_suffix(".idx"), args.dst)


if __name__ == "__main__":
    main()
