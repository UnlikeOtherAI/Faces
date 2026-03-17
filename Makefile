# ──────────────────────────────────────────────────────────────────────────────
# Faces — model training
#
# Usage:
#   make pretrained                  # skip training — use InsightFace pretrained weights
#   make train                       # auto: downloads both, trains on all present
#   DATASET=digiface make train      # DigiFace-1M only
#   DATASET=glint make train         # Glint360K only (must have .rec already)
#
# Individual steps:
#   make setup                   # create venv + install deps
#   make download                # download dataset (DigiFace only)
#   make prepare                 # align / validate images
#   make fit                     # run training
#   make export                  # ONNX → CoreML + TFLite
#   make validate                # LFW accuracy (needs model/data/lfw_aligned)
#   make clean                   # wipe model/data/, model/checkpoints/, model/model.onnx
# ──────────────────────────────────────────────────────────────────────────────

DATASET   ?= auto
GLINT_REC ?= $(MODEL)/data/raw_glint/train.rec

MODEL   := model
PYTHON  := $(MODEL)/.venv/bin/python
PIP     := $(MODEL)/.venv/bin/pip

# ── per-dataset knobs ──────────────────────────────────────────────────────────
ifeq ($(DATASET),digiface)
  EPOCHS      := 40
  BATCH       := 128
  FINAL_CKPT  := $(MODEL)/checkpoints/epoch_040.pt
else
  # glint / combined / auto — assume large-scale data
  EPOCHS      := 30
  BATCH       := 256
  FINAL_CKPT  := $(MODEL)/checkpoints/epoch_030.pt
endif

.DEFAULT_GOAL := help

# ── venv ───────────────────────────────────────────────────────────────────────
$(MODEL)/.venv: $(MODEL)/requirements.txt
	python3.11 -m venv $(MODEL)/.venv
	$(PIP) install --upgrade pip -q
	$(PIP) install -r $(MODEL)/requirements.txt -q
ifneq ($(DATASET),digiface)
	$(PIP) install libtorrent -q || true
endif

setup: $(MODEL)/.venv ## Create venv and install deps

# ── download ───────────────────────────────────────────────────────────────────
download: $(MODEL)/.venv ## Download datasets (skips what is already present)
ifeq ($(DATASET),digiface)
	$(PYTHON) $(MODEL)/dataset/download_synthetic.py --dst $(MODEL)/data/raw
else ifeq ($(DATASET),glint)
	$(PYTHON) $(MODEL)/dataset/download_glint.py --dst $(MODEL)/data/raw_glint
else
	# auto / combined — download both; each script skips if already present
	$(PYTHON) $(MODEL)/dataset/download_synthetic.py --dst $(MODEL)/data/raw
	$(PYTHON) $(MODEL)/dataset/download_glint.py --dst $(MODEL)/data/raw_glint
endif

# ── prepare ────────────────────────────────────────────────────────────────────
prepare: $(MODEL)/.venv ## Validate images and merge datasets (auto-detects what is present)
ifeq ($(DATASET),digiface)
	$(PYTHON) $(MODEL)/dataset/prepare_synthetic.py \
	  --src $(MODEL)/data/raw --dst $(MODEL)/data/aligned
else ifeq ($(DATASET),glint)
	$(PYTHON) $(MODEL)/dataset/convert_mxnet.py \
	  --rec $(GLINT_REC) --dst $(MODEL)/data/raw_glint_converted
	$(PYTHON) $(MODEL)/dataset/prepare_synthetic.py \
	  --src $(MODEL)/data/raw_glint_converted --dst $(MODEL)/data/aligned
else
	# auto / combined — detect what is present and prepare accordingly
	$(PYTHON) $(MODEL)/dataset/prepare_auto.py --base $(MODEL)/data
endif

# ── train ──────────────────────────────────────────────────────────────────────
fit: $(MODEL)/.venv ## Run model training
	$(PYTHON) $(MODEL)/train.py \
	  --data    $(MODEL)/data/aligned \
	  --epochs  $(EPOCHS) \
	  --batch   $(BATCH) \
	  --output  $(MODEL)/checkpoints/

# ── export ─────────────────────────────────────────────────────────────────────
export: $(MODEL)/.venv $(FINAL_CKPT) ## Export ONNX → CoreML + TFLite
	$(PYTHON) $(MODEL)/export/to_onnx.py \
	  --checkpoint $(FINAL_CKPT) \
	  --output     $(MODEL)/model.onnx
	$(PYTHON) $(MODEL)/export/to_coreml.py \
	  --onnx   $(MODEL)/model.onnx \
	  --output ios/Sources/FacesKit/Resources/MobileFaceNet.mlpackage
	$(PYTHON) $(MODEL)/export/to_tflite.py \
	  --onnx   $(MODEL)/model.onnx \
	  --output android/faceskit/src/main/assets/mobilefacenet.tflite

# ── validate (LFW) ─────────────────────────────────────────────────────────────
#   Download LFW first:
#     curl -O http://vis-www.cs.umass.edu/lfw/lfw-funneled.tgz
#     tar xzf lfw-funneled.tgz -C model/data/lfw_aligned/
#     curl -O http://vis-www.cs.umass.edu/lfw/pairs.txt -o model/data/lfw_pairs.txt
validate: $(MODEL)/.venv $(FINAL_CKPT) ## LFW accuracy check
	$(PYTHON) $(MODEL)/validate.py \
	  --checkpoint $(FINAL_CKPT) \
	  --lfw        $(MODEL)/data/lfw_aligned

# ── full pipeline ──────────────────────────────────────────────────────────────
train: $(MODEL)/.venv ## Full pipeline: download → prepare → fit → export
ifeq ($(DATASET),glint)
	@test -f $(GLINT_REC) || \
	  (printf "\nERROR: $(GLINT_REC) not found. Download Glint360K from InsightFace.\n\n" && exit 1)
	$(MAKE) prepare DATASET=glint
else
	$(MAKE) download DATASET=$(DATASET)
	$(MAKE) prepare  DATASET=$(DATASET)
endif
	$(MAKE) fit     DATASET=$(DATASET)
	$(MAKE) export  DATASET=$(DATASET)
	@echo ""
	@echo "  Done. Models written to:"
	@echo "    ios/Sources/FacesKit/Resources/MobileFaceNet.mlpackage"
	@echo "    android/faceskit/src/main/assets/mobilefacenet.tflite"
	@echo ""

# ── pretrained shortcut ────────────────────────────────────────────────────────
pretrained: $(MODEL)/.venv ## Download InsightFace pretrained weights and export (skips training)
	$(PYTHON) $(MODEL)/download_pretrained.py --output $(MODEL)/model.onnx
	$(PYTHON) $(MODEL)/export/to_coreml.py \
	  --onnx   $(MODEL)/model.onnx \
	  --output ios/Sources/FacesKit/Resources/MobileFaceNet.mlpackage
	$(PYTHON) $(MODEL)/export/to_tflite.py \
	  --onnx   $(MODEL)/model.onnx \
	  --output android/faceskit/src/main/assets/mobilefacenet.tflite

# ── clean ──────────────────────────────────────────────────────────────────────
clean: ## Wipe data, checkpoints, and model.onnx
	rm -rf $(MODEL)/data $(MODEL)/checkpoints $(MODEL)/model.onnx

.PHONY: help setup download prepare fit export validate train pretrained clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
