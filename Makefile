# ──────────────────────────────────────────────────────────────────────────────
# Faces — model training
#
# Usage:
#   make train                   # DigiFace-1M (default) — fully automatic
#   DATASET=glint make train     # Glint360K — download manually first, see README
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

DATASET ?= digiface

MODEL   := model
PYTHON  := $(MODEL)/.venv/bin/python
PIP     := $(MODEL)/.venv/bin/pip

# ── per-dataset knobs ──────────────────────────────────────────────────────────
ifeq ($(DATASET),glint)
  EPOCHS      := 30
  BATCH       := 256
  FINAL_CKPT  := $(MODEL)/checkpoints/epoch_030.pt
else
  EPOCHS      := 40
  BATCH       := 128
  FINAL_CKPT  := $(MODEL)/checkpoints/epoch_040.pt
endif

.DEFAULT_GOAL := help

# ── venv ───────────────────────────────────────────────────────────────────────
$(MODEL)/.venv: $(MODEL)/requirements.txt
	python3 -m venv $(MODEL)/.venv
	$(PIP) install --upgrade pip -q
	$(PIP) install -r $(MODEL)/requirements.txt -q
ifeq ($(DATASET),glint)
	$(PIP) install facenet-pytorch -q
endif

setup: $(MODEL)/.venv ## Create venv and install deps

# ── download (DigiFace-1M only) ────────────────────────────────────────────────
download: $(MODEL)/.venv ## Download dataset (DigiFace only)
ifeq ($(DATASET),glint)
	@echo ""
	@echo "  Glint360K must be downloaded manually."
	@echo "  See README — Training — Glint360K for the InsightFace link."
	@echo "  Extract to model/data/raw/ then run:  make prepare DATASET=glint"
	@echo ""
else
	$(PYTHON) $(MODEL)/dataset/download_synthetic.py --dst $(MODEL)/data/raw
endif

# ── prepare ────────────────────────────────────────────────────────────────────
prepare: $(MODEL)/.venv ## Align and validate images
ifeq ($(DATASET),glint)
	$(PYTHON) $(MODEL)/dataset/prepare_real.py \
	  --src $(MODEL)/data/raw --dst $(MODEL)/data/aligned
else
	$(PYTHON) $(MODEL)/dataset/prepare_synthetic.py \
	  --src $(MODEL)/data/raw --dst $(MODEL)/data/aligned
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
	@test -d $(MODEL)/data/raw || \
	  (printf "\nERROR: model/data/raw not found.\nDownload Glint360K and extract to model/data/raw/ first.\nSee README — Training — Glint360K.\n\n" && exit 1)
	$(MAKE) prepare DATASET=glint
else
	$(MAKE) download
	$(MAKE) prepare
endif
	$(MAKE) fit     DATASET=$(DATASET)
	$(MAKE) export  DATASET=$(DATASET)
	@echo ""
	@echo "  Done. Models written to:"
	@echo "    ios/Sources/FacesKit/Resources/MobileFaceNet.mlpackage"
	@echo "    android/faceskit/src/main/assets/mobilefacenet.tflite"
	@echo ""

# ── clean ──────────────────────────────────────────────────────────────────────
clean: ## Wipe data, checkpoints, and model.onnx
	rm -rf $(MODEL)/data $(MODEL)/checkpoints $(MODEL)/model.onnx

.PHONY: help setup download prepare fit export validate train clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
