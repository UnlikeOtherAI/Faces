# Model Training

## Overview

We train our own face embedding model (MobileFaceNet-style, 128-dim) using PyTorch + ArcFace loss, then export to CoreML for iOS and TFLite for Android.

All training code lives in `model/`.

---

## Architecture

**MobileFaceNet** — lightweight depthwise separable CNN.

| Property | Value |
|----------|-------|
| Input | 112 × 112 × 3 RGB, normalised to [-1, 1] |
| Output | 128-dim L2-normalised embedding |
| Parameters | ~1M |
| Target inference | <120ms on iPhone 12 / mid-range Android |

Loss: **ArcFace** (additive angular margin, m=0.5, s=64).

---

## Dataset

Training requires a labelled face dataset — one folder per identity, multiple images per identity.

Recommended public datasets:

| Dataset | Identities | Images | Notes |
|---------|-----------|--------|-------|
| CASIA-WebFace | 10,575 | 494k | Free, good baseline |
| MS1MV2 | 85k | 5.8M | Cleaned MS-Celeb, best quality |
| VGGFace2 | 9,131 | 3.3M | High pose/age variation |

For a product-specific model, collect proprietary data and place it in the same folder structure.

Dataset format expected by `model/dataset/prepare.py`:
```
data/raw/
  <identity_id>/
    img001.jpg
    img002.jpg
    ...
```

Running `prepare.py` produces aligned 112×112 crops in `data/aligned/`.

---

## Training pipeline

```
data/raw/          raw labelled images
    ↓ prepare.py
data/aligned/      112x112 face crops
    ↓ train.py
checkpoints/       .pt files per epoch
    ↓ export/to_onnx.py
model.onnx
    ↓ export/to_coreml.py     export/to_tflite.py
MobileFaceNet.mlpackage       mobilefacenet.tflite
    ↓ (copy to ios/ and android/ resources)
```

---

## Setup

```bash
cd model
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt`:
```
torch>=2.2
torchvision>=0.17
facenet-pytorch          # MTCNN alignment
onnx>=1.15
onnxruntime>=1.17
coremltools>=7.2
tensorflow>=2.14         # TFLite conversion
Pillow
tqdm
```

---

## Steps

### 1. Prepare dataset
```bash
python model/dataset/prepare.py --src data/raw --dst data/aligned
```

Runs MTCNN face alignment, resizes to 112×112, filters low-confidence crops.

### 2. Train
```bash
python model/train.py \
  --data data/aligned \
  --epochs 40 \
  --batch 128 \
  --lr 0.1 \
  --output checkpoints/
```

Checkpoints saved every 5 epochs. Training on a single GPU takes ~4 hours on CASIA-WebFace.

### 3. Validate
```bash
python model/validate.py \
  --checkpoint checkpoints/epoch_40.pt \
  --lfw data/lfw_aligned
```

Reports accuracy on LFW pairs. Target: >99% at threshold 0.70.

### 4. Export to ONNX
```bash
python model/export/to_onnx.py \
  --checkpoint checkpoints/epoch_40.pt \
  --output model.onnx
```

### 5. Export to CoreML
```bash
python model/export/to_coreml.py \
  --onnx model.onnx \
  --output ios/Sources/FacesKit/Resources/MobileFaceNet.mlpackage
```

### 6. Export to TFLite
```bash
python model/export/to_tflite.py \
  --onnx model.onnx \
  --output android/src/main/assets/mobilefacenet.tflite
```

---

## Output file locations

| File | Destination |
|------|-------------|
| `MobileFaceNet.mlpackage` | `ios/Sources/FacesKit/Resources/` |
| `mobilefacenet.tflite` | `android/src/main/assets/` |

Both are gitignored. Rebuild from checkpoint, or distribute via CI artifact.

---

## Gitignore additions

```
data/
checkpoints/
model.onnx
model/.venv/
```

---

## Performance targets post-training

| Metric | Target |
|--------|--------|
| LFW accuracy | > 99% |
| Embedding dim | 128 |
| Model size | < 5MB |
| iOS inference | < 120ms (iPhone 12+) |
| Android inference | < 120ms (mid-range, GPU delegate) |
| Match threshold | 0.70 (tunable) |
