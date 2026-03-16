# Model Training

## Dataset — DigiFace-1M (synthetic)

We use **DigiFace-1M** by Microsoft Research — a fully synthetic dataset with zero privacy or consent issues.

| Property | Value |
|----------|-------|
| Source | Microsoft Research (https://github.com/microsoft/DigiFace1M) |
| Identities | 10,006 |
| Images | 1,219,995 (~122 per identity) |
| Resolution | 112 × 112 (pre-rendered — no alignment step needed) |
| License | Microsoft Research License |
| Privacy | Fully synthetic — no real people |

Images are pre-rendered at 112×112 with controlled pose, lighting, and accessories variation. No MTCNN alignment needed.

---

## Architecture

**MobileFaceNet** — lightweight depthwise separable CNN.

| Property | Value |
|----------|-------|
| Input | 112 × 112 × 3 RGB, normalised to [-1, 1] |
| Output | 128-dim L2-normalised embedding |
| Parameters | ~1M |
| Loss | ArcFace (m=0.5, s=64) |

---

## Setup

```bash
cd model
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

---

## Steps

### 1. Download dataset (~14 GB)

```bash
python model/dataset/download_synthetic.py --dst data/raw
```

Downloads 103 zip files from GitHub Releases, extracts, deletes zips.
Resumable via `--start-file N`.

### 2. Prepare (validate + filter)

```bash
python model/dataset/prepare_synthetic.py --src data/raw --dst data/aligned
```

Validates all images, drops corrupt files, drops identities with fewer than 10 valid images.
Fast (~2 min for 1.2M images on SSD). Symlinks by default — use `--copy` for portability.

### 3. Train

```bash
python model/train.py \
  --data   data/aligned \
  --epochs 40 \
  --batch  128 \
  --lr     0.1 \
  --output checkpoints/
```

Checkpoints saved every 5 epochs.
Approximate training times:

| Hardware | Time |
|----------|------|
| Single A100 | ~3 hours |
| Single RTX 4090 | ~5 hours |
| M2 Ultra (MPS) | ~18 hours |
| CPU only | not recommended |

### 4. Validate on LFW

Download LFW aligned: http://vis-www.cs.umass.edu/lfw/lfw-funneled.tgz
Download pairs file:  http://vis-www.cs.umass.edu/lfw/pairs.txt

```bash
python model/validate.py \
  --checkpoint checkpoints/epoch_040.pt \
  --lfw        data/lfw_aligned \
  --pairs      data/lfw_pairs.txt
```

Target: accuracy > 99%, AUC > 0.999.

### 5. Export to ONNX

```bash
python model/export/to_onnx.py \
  --checkpoint checkpoints/epoch_040.pt \
  --output     model.onnx
```

### 6. Export to CoreML (iOS)

```bash
python model/export/to_coreml.py \
  --onnx   model.onnx \
  --output ios/Sources/FacesKit/Resources/MobileFaceNet.mlpackage
```

### 7. Export to TFLite (Android)

```bash
python model/export/to_tflite.py \
  --onnx   model.onnx \
  --output android/src/main/assets/mobilefacenet.tflite
```

---

## Output files

| File | Destination |
|------|-------------|
| `MobileFaceNet.mlpackage` | `ios/Sources/FacesKit/Resources/` |
| `mobilefacenet.tflite` | `android/src/main/assets/` |

Both are gitignored. Rebuild from checkpoint or distribute via CI artefact storage.

---

## Augmentation (synthetic → real generalisation)

Training uses aggressive augmentation to bridge the synthetic-to-real gap:

| Augmentation | Purpose |
|-------------|---------|
| Horizontal flip | Pose variation |
| Colour jitter (strong) | Camera/lighting variation |
| Gaussian blur | Focus variation |
| Random grayscale (5%) | B&W camera / IR robustness |
| Random erasing (30%) | Occlusion (glasses, hats, hands) |

---

## Gitignored paths

```
data/
checkpoints/
model.onnx
model/.venv/
model/**/__pycache__/
```

---

## Performance targets

| Metric | Target |
|--------|--------|
| LFW accuracy | > 99% |
| Model size | < 5 MB |
| iOS inference (iPhone 12+) | < 120 ms |
| Android inference (mid-range, GPU delegate) | < 120 ms |
| Match threshold | 0.70 (tunable) |
