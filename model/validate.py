"""Validate trained model on LFW pairs protocol.

Usage:
    python model/validate.py \
        --checkpoint checkpoints/epoch_040.pt \
        --lfw        data/lfw_aligned \
        --pairs      data/lfw_pairs.txt

LFW pairs: http://vis-www.cs.umass.edu/lfw/pairs.txt
LFW aligned: http://vis-www.cs.umass.edu/lfw/lfw-funneled.tgz
"""

import argparse
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sklearn.metrics import roc_auc_score
import torchvision.transforms as T

from architecture.mobilefacenet import MobileFaceNet

TRANSFORM = T.Compose([
    T.ToTensor(),
    T.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
])


def embed(model, path: Path, device) -> np.ndarray:
    img = Image.open(path).convert("RGB").resize((112, 112), Image.BICUBIC)
    t = TRANSFORM(img).unsqueeze(0).to(device)
    with torch.no_grad():
        return model(t).squeeze(0).cpu().numpy()


def parse_pairs(pairs_file: Path, lfw_root: Path):
    pairs = []
    lines = pairs_file.read_text().strip().splitlines()
    header = lines[0].split()
    # header is either "N\tpairs" or "N" depending on LFW version
    for line in lines[1:]:
        parts = line.split()
        if len(parts) == 3:
            name, a, b = parts[0], int(parts[1]), int(parts[2])
            pa = lfw_root / name / f"{name}_{a:04d}.jpg"
            pb = lfw_root / name / f"{name}_{b:04d}.jpg"
            pairs.append((pa, pb, 1))
        elif len(parts) == 4:
            na, a, nb, b = parts[0], int(parts[1]), parts[2], int(parts[3])
            pa = lfw_root / na / f"{na}_{a:04d}.jpg"
            pb = lfw_root / nb / f"{nb}_{b:04d}.jpg"
            pairs.append((pa, pb, 0))
    return pairs


def validate(args: argparse.Namespace) -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = MobileFaceNet(embedding_dim=128).to(device)
    ckpt = torch.load(args.checkpoint, map_location=device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    pairs = parse_pairs(Path(args.pairs), Path(args.lfw))
    scores, labels = [], []
    missing = 0

    for pa, pb, label in pairs:
        if not pa.exists() or not pb.exists():
            missing += 1
            continue
        ea = embed(model, pa, device)
        eb = embed(model, pb, device)
        scores.append(float(np.dot(ea, eb)))
        labels.append(label)

    scores = np.array(scores)
    labels = np.array(labels)

    best_acc, best_thresh = 0.0, 0.0
    for t in np.arange(0.0, 1.0, 0.01):
        acc = ((scores > t).astype(int) == labels).mean()
        if acc > best_acc:
            best_acc, best_thresh = acc, t

    auc = roc_auc_score(labels, scores)
    match_s    = scores[labels == 1]
    nonmatch_s = scores[labels == 0]

    print(f"Pairs evaluated : {len(scores)}  (missing: {missing})")
    print(f"Best accuracy   : {best_acc:.4f}  @ threshold {best_thresh:.2f}")
    print(f"ROC AUC         : {auc:.4f}")
    print(f"Match sim       : mean={match_s.mean():.4f}  std={match_s.std():.4f}")
    print(f"Non-match sim   : mean={nonmatch_s.mean():.4f}  std={nonmatch_s.std():.4f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--lfw",        required=True)
    parser.add_argument("--pairs",      default="data/lfw_pairs.txt")
    validate(parser.parse_args())


if __name__ == "__main__":
    main()
