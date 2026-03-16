# Model Training

The model is not included in this repo. You train your own from a dataset of your choice and export it to CoreML (iOS) and TFLite (Android). See the [README](../README.md#training) for full dataset options and step-by-step instructions.

---

## Architecture

**MobileFaceNet** — depthwise separable CNN, ~1M parameters.

| Property | Value |
|----------|-------|
| Input | 112 × 112 × 3 RGB, normalised to [-1, 1] |
| Output | 128-dim L2-normalised embedding |
| Loss | ArcFace (m=0.5, s=64) |
| Optimiser | SGD, momentum 0.9, weight decay 5e-4 |
| LR schedule | MultiStep — decay at epochs 20, 30, 36 |

---

## Dataset options (summary)

| Dataset | Type | Identities | Notes |
|---------|------|-----------|-------|
| DigiFace-1M | Synthetic | 10,006 | No privacy concerns, scriptable download |
| Glint360K | Real | 360,000 | Best accuracy, web-scraped |
| MS1MV3 | Real | 93,000 | Cleaned MS-Celeb, web-scraped |
| VGGFace2 | Real | 9,131 | Registration required |
| CASIA-WebFace | Real | 10,575 | Smallest, good for testing pipeline |

Full download + preparation instructions for each: [README — Training](../README.md#training).

---

## Pipeline overview

```
dataset download
      ↓ prepare_synthetic.py  (DigiFace-1M — no alignment needed)
      ↓ prepare_real.py        (all others — MTCNN alignment)
data/aligned/
      ↓ train.py
checkpoints/epoch_NNN.pt
      ↓ export/to_onnx.py
model.onnx
      ↓ export/to_coreml.py          ↓ export/to_tflite.py
ios/.../MobileFaceNet.mlpackage      android/.../mobilefacenet.tflite
```

---

## Training time estimates

| Hardware | DigiFace-1M (40 epochs) |
|----------|------------------------|
| A100 GPU | ~3 hours |
| RTX 4090 | ~5 hours |
| M2 Ultra (MPS) | ~18 hours |

---

## Performance targets

| Metric | Target |
|--------|--------|
| LFW accuracy | > 99% |
| Model size | < 5 MB |
| iOS inference (iPhone 12+) | < 120 ms |
| Android inference (GPU delegate) | < 120 ms |

---

## Gitignored paths

```
data/
checkpoints/
model.onnx
model/.venv/
```
