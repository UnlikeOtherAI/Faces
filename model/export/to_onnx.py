"""Export trained MobileFaceNet checkpoint to ONNX.

Usage:
    python model/export/to_onnx.py \
        --checkpoint checkpoints/epoch_040.pt \
        --output     model.onnx
"""

import argparse
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent.parent))
from architecture.mobilefacenet import MobileFaceNet


def export(checkpoint: Path, output: Path) -> None:
    model = MobileFaceNet(embedding_dim=128)
    ckpt = torch.load(checkpoint, map_location="cpu")
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    dummy = torch.randn(1, 3, 112, 112)
    torch.onnx.export(
        model, dummy, str(output),
        input_names=["input"],
        output_names=["embedding"],
        dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"Saved: {output}")

    import onnxruntime as ort
    import numpy as np
    sess = ort.InferenceSession(str(output))
    out = sess.run(None, {"input": dummy.numpy()})
    norm = np.linalg.norm(out[0][0])
    print(f"Output shape: {out[0].shape}  L2 norm: {norm:.6f}  (expect ~1.0)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True, type=Path)
    parser.add_argument("--output",     required=True, type=Path)
    export(**vars(parser.parse_args()))


if __name__ == "__main__":
    main()
