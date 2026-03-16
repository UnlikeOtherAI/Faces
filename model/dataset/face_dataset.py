"""PyTorch Dataset for aligned face images.

Expects:
    root/<identity_id>/<image>.{jpg,png}

Returns normalised tensors in [-1, 1] with integer class labels.

Augmentation is tuned for synthetic→real generalisation:
  - colour jitter simulates real camera variation
  - gaussian blur simulates focus variation
  - random erasing simulates occlusion (glasses, hats, hands)
  - horizontal flip is safe for faces
"""

from pathlib import Path
from typing import Callable, Optional, Tuple

from PIL import Image
from torch.utils.data import Dataset
import torchvision.transforms as T


def train_transform() -> Callable:
    return T.Compose([
        T.RandomHorizontalFlip(p=0.5),
        T.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.3, hue=0.05),
        T.RandomGrayscale(p=0.05),          # occasional B&W robustness
        T.GaussianBlur(kernel_size=3, sigma=(0.1, 1.5)),
        T.ToTensor(),
        T.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
        T.RandomErasing(p=0.3, scale=(0.02, 0.15)),  # occlusion simulation
    ])


def val_transform() -> Callable:
    return T.Compose([
        T.ToTensor(),
        T.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
    ])


class FaceDataset(Dataset):
    EXTENSIONS = {".jpg", ".jpeg", ".png"}

    def __init__(self, root: Path, transform: Optional[Callable] = None):
        self.root = root
        self.transform = transform or train_transform()

        identities = sorted(p.name for p in root.iterdir() if p.is_dir())
        self.class_to_idx = {name: i for i, name in enumerate(identities)}
        self.num_classes = len(identities)

        self.samples: list[Tuple[Path, int]] = []
        for identity, idx in self.class_to_idx.items():
            for img_path in (root / identity).iterdir():
                if img_path.suffix.lower() in self.EXTENSIONS:
                    self.samples.append((img_path, idx))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> Tuple:
        path, label = self.samples[index]
        image = Image.open(path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, label
