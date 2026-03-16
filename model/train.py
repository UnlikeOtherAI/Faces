"""Train MobileFaceNet with ArcFace loss.

Usage:
    python model/train.py \
        --data   data/aligned \
        --epochs 40 \
        --batch  128 \
        --lr     0.1 \
        --output checkpoints/
"""

import argparse
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

from architecture.mobilefacenet import MobileFaceNet
from architecture.arcface import ArcFaceHead
from dataset.face_dataset import FaceDataset, default_transform, val_transform


def train(args: argparse.Namespace) -> None:
    device = torch.device(
        "cuda" if torch.cuda.is_available() else
        "mps"  if torch.backends.mps.is_available() else "cpu"
    )
    print(f"Training on: {device}")

    full_ds = FaceDataset(Path(args.data), transform=default_transform())
    n_val = max(1, int(len(full_ds) * 0.02))
    train_ds, val_ds = random_split(full_ds, [len(full_ds) - n_val, n_val])
    val_ds.dataset.transform = val_transform()

    train_loader = DataLoader(train_ds, batch_size=args.batch,
                              shuffle=True,  num_workers=4, pin_memory=True)
    val_loader   = DataLoader(val_ds,   batch_size=args.batch,
                              shuffle=False, num_workers=2)

    model = MobileFaceNet(embedding_dim=128).to(device)
    head  = ArcFaceHead(embedding_dim=128, num_classes=full_ds.num_classes,
                        margin=0.5, scale=64.0).to(device)

    optimizer = torch.optim.SGD(
        list(model.parameters()) + list(head.parameters()),
        lr=args.lr, momentum=0.9, weight_decay=5e-4,
    )
    scheduler = torch.optim.lr_scheduler.MultiStepLR(
        optimizer, milestones=[20, 30, 36], gamma=0.1
    )

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, args.epochs + 1):
        model.train()
        head.train()
        total_loss = 0.0
        for images, labels in train_loader:
            images = images.to(device)
            labels = labels.to(device)
            optimizer.zero_grad()
            embeddings = model(images)
            loss = head(embeddings, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(train_loader)

        model.eval()
        correct = total = 0
        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(device)
                labels = labels.to(device)
                embeddings = model(images)
                centres = nn.functional.normalize(head.weight, dim=1)
                sims = embeddings @ centres.T
                preds = sims.argmax(dim=1)
                correct += (preds == labels).sum().item()
                total += labels.size(0)

        val_acc = correct / total if total > 0 else 0.0
        scheduler.step()

        print(f"Epoch {epoch:03d}/{args.epochs}  "
              f"loss={avg_loss:.4f}  val_acc={val_acc:.4f}  "
              f"lr={optimizer.param_groups[0]['lr']:.5f}")

        if epoch % 5 == 0 or epoch == args.epochs:
            ckpt = out_dir / f"epoch_{epoch:03d}.pt"
            torch.save({
                "epoch": epoch,
                "model_state": model.state_dict(),
                "head_state":  head.state_dict(),
                "optimizer_state": optimizer.state_dict(),
                "num_classes": full_ds.num_classes,
            }, ckpt)
            print(f"  Saved: {ckpt}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",   required=True)
    parser.add_argument("--epochs", type=int,   default=40)
    parser.add_argument("--batch",  type=int,   default=128)
    parser.add_argument("--lr",     type=float, default=0.1)
    parser.add_argument("--output", default="checkpoints/")
    train(parser.parse_args())


if __name__ == "__main__":
    main()
