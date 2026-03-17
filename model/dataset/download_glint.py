"""Download Glint360K dataset (360K ids / ~17M images, pre-aligned 112×112).

Fully automatic — no manual steps. Downloads via torrent using either:
  - aria2c  (if installed — fastest)
  - libtorrent Python library (always available in venv)

Magnet URI source: https://github.com/deepinsight/insightface/tree/master/recognition/_datasets_

Usage:
    python model/dataset/download_glint.py --dst model/data/raw_glint

Expected output:
    model/data/raw_glint/train.rec
    model/data/raw_glint/train.idx
    model/data/raw_glint/property
"""

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

MAGNET = (
    "magnet:?xt=urn:btih:E5F46EE502B9E76DA8CC3A0E4F7C17E4000C7B1E&dn=glint360k"
    "&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce"
    "&tr=udp%3A%2F%2Fopen.tracker.cl%3A1337%2Fannounce"
    "&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80%2Fannounce"
)

EXPECTED_FILES = ["train.rec", "train.idx", "property"]


def already_downloaded(dst: Path) -> bool:
    return all((dst / f).exists() for f in EXPECTED_FILES)


def validate(dst: Path) -> None:
    missing = [f for f in EXPECTED_FILES if not (dst / f).exists()]
    if missing:
        print(f"\nERROR: Missing files after download: {missing}")
        sys.exit(1)
    print(f"\nGlint360K ready at {dst}:")
    for f in EXPECTED_FILES:
        size = (dst / f).stat().st_size
        print(f"  {f:<20} {size / 1e9:.1f} GB")


def download_aria2c(dst: Path) -> bool:
    if not shutil.which("aria2c"):
        return False
    print("Downloading Glint360K via aria2c (~100 GB)...")
    result = subprocess.run([
        "aria2c",
        "--dir", str(dst),
        "--seed-time=0",
        "--max-connection-per-server=4",
        "--split=4",
        "--console-log-level=warn",
        "--summary-interval=60",
        MAGNET,
    ])
    return result.returncode == 0


def download_libtorrent(dst: Path) -> None:
    try:
        import libtorrent as lt
    except ImportError:
        sys.exit(
            "libtorrent not installed. Run:  pip install libtorrent\n"
            "or install aria2c:  brew install aria2"
        )

    dst.mkdir(parents=True, exist_ok=True)
    print(f"Downloading Glint360K via libtorrent (~100 GB) → {dst}")
    print("This will take several hours on a typical connection.\n")

    ses = lt.session()
    ses.listen_on(6881, 6891)

    params = lt.add_torrent_params()
    params.save_path = str(dst)
    lt.parse_magnet_uri(MAGNET, params)
    handle = ses.add_torrent(params)

    print("Resolving magnet URI (DHT lookup)...")
    while not handle.has_metadata():
        time.sleep(1)
    print(f"Torrent metadata found: {handle.name()}")

    status = handle.status()
    while not status.is_seeding:
        status = handle.status()
        pct  = status.progress * 100
        dl   = status.download_rate / 1e6
        ul   = status.upload_rate / 1e6
        peers = status.num_peers
        done  = status.total_done / 1e9
        total = status.total_wanted / 1e9
        print(
            f"\r  {pct:5.1f}%  {done:.1f}/{total:.1f} GB  "
            f"↓{dl:.2f} MB/s  peers={peers}    ",
            end="", flush=True,
        )
        time.sleep(5)

    print(f"\nDownload complete.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dst", type=Path, default=Path("model/data/raw_glint"),
                        help="Directory to save .rec/.idx/property files")
    args = parser.parse_args()

    if already_downloaded(args.dst):
        print(f"Glint360K already present — skipping download.")
        validate(args.dst)
        return

    args.dst.mkdir(parents=True, exist_ok=True)

    if download_aria2c(args.dst):
        validate(args.dst)
        return

    download_libtorrent(args.dst)
    validate(args.dst)


if __name__ == "__main__":
    main()
