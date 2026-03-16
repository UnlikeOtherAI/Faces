"""Convert ONNX MobileFaceNet to CoreML mlpackage for iOS.

Usage:
    python model/export/to_coreml.py \\
        --onnx   model.onnx \\
        --output ios/Sources/FacesKit/Resources/MobileFaceNet.mlpackage

Produces a CoreML model that:
  - Takes input named "input":  MultiArray (Float32, 1 x 3 x 112 x 112)
    pre-normalised to [-1, 1] by the caller.
  - Outputs "embedding":        MultiArray (Float32, 1 x 128), L2-normalised.
"""

import argparse
from pathlib import Path

import coremltools as ct
import numpy as np


def convert(onnx_path: Path, output_path: Path) -> None:
    print(f"Loading ONNX: {onnx_path}")
    model = ct.convert(
        str(onnx_path),
        convert_to="mlprogram",
        inputs=[
            ct.TensorType(
                name="input",
                shape=(1, 3, 112, 112),
                dtype=np.float32,
            )
        ],
        outputs=[ct.TensorType(name="embedding", dtype=np.float32)],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,  # uses ANE where available
    )

    model.short_description = "MobileFaceNet face embedding — 128-dim L2-normalised"
    model.input_description["input"]     = "Face crop 112x112, RGB, normalised to [-1,1]"
    model.output_description["embedding"] = "128-dim L2-normalised face embedding"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(output_path))
    print(f"Saved CoreML model: {output_path}")

    # Verify
    import torch
    dummy = np.random.randn(1, 3, 112, 112).astype(np.float32)
    out = model.predict({"input": dummy})
    embedding = out["embedding"]
    norm = np.linalg.norm(embedding)
    print(f"Verification — output shape: {embedding.shape}  L2 norm: {norm:.6f}  (expect ~1.0)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx",   required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    convert(args.onnx, args.output)


if __name__ == "__main__":
    main()
