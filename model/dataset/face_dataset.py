"""PyTorch Dataset for aligned face images.

Expects:
    root/<identity_id>/<image>.jpg

Returns normalised tensors in [-1, 1] with integer class labels.
"""

from pathlib import Path
from typing import Callable, Optional, Tuple

from PIL import Image
from torch.utils.data import Dataset
import torchvision.transforms as T


def default_transform(image_size: int = 112) -> Callable:
    return T.Compose([
        T.RandomHorizontalFlip(),
        T.ColorJitter(brightness=0.2, contrast=0.2),
        T.ToTensor(),
        T.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),  # → [-1, 1]
    ])


def val_transform(image_size: int = 112) -> Callable:
    return T.Compose([
        T.ToTensor(),
        T.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
    ])


class FaceDataset(Dataset):
    def __init__(self, root: Path, transform: Optional[Callable] = None):
        self.root = root
        self.transform = transform or default_transform()

        identities = sorted(p.name for p in root.iterdir() if p.is_dir())
        self.class_to_idx = {name: i for i, name in enumerate(identities)}
        self.num_classes = len(identities)

        self.samples: list[Tuple[Path, int]] = []
        for identity, idx in self.class_to_idx.items():
            for img_path in (root / identity).glob("*.jpg"):
                self.samples.append((img_path, idx))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> Tuple:
        path, label = self.samples[index]
        image = Image.open(path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, label
