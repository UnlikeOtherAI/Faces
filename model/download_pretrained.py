"""Download InsightFace buffalo_sc pretrained MobileFaceNet recognition model.

Source: https://github.com/deepinsight/insightface/releases/tag/v0.7
Model:  w600k_mbf.onnx — MobileFaceNet trained on WebFace600K
        Input:  1 × 3 × 112 × 112  (face crop, normalised to [-1, 1])
        Output: 1 × 512             (L2-normalised embedding)
License: non-commercial research use

Usage:
    python model/download_pretrained.py
    python model/download_pretrained.py --output model/model.onnx
"""

import argparse
import hashlib
import io
import zipfile
from pathlib import Path

import requests
from tqdm import tqdm

BUFFALO_SC_URL = (
    "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"
)
RECOGNITION_FILE = "w600k_mbf.onnx"


def download(url: str, chunk: int = 1 << 20) -> bytes:
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    buf = io.BytesIO()
    with tqdm(total=total, unit="B", unit_scale=True, desc="buffalo_sc.zip") as bar:
        for chunk_data in resp.iter_content(chunk_size=chunk):
            buf.write(chunk_data)
            bar.update(len(chunk_data))
    return buf.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("model/model.onnx"),
                        help="Where to write the ONNX recognition model")
    args = parser.parse_args()

    if args.output.exists():
        print(f"Already present: {args.output}  ({args.output.stat().st_size / 1e6:.1f} MB)")
        print("Delete it to re-download.")
        return

    print(f"Downloading InsightFace buffalo_sc (~15 MB)...")
    data = download(BUFFALO_SC_URL)

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = zf.namelist()
        if RECOGNITION_FILE not in names:
            raise RuntimeError(f"{RECOGNITION_FILE} not found in zip. Contents: {names}")
        onnx_bytes = zf.read(RECOGNITION_FILE)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(onnx_bytes)
    print(f"Saved: {args.output}  ({len(onnx_bytes) / 1e6:.1f} MB)")
    print("\nRun:  make export")


if __name__ == "__main__":
    main()
