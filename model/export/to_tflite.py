"""Convert ONNX MobileFaceNet to TFLite flatbuffer for Android.

Usage:
    python model/export/to_tflite.py \\
        --onnx   model.onnx \\
        --output android/src/main/assets/mobilefacenet.tflite

Pipeline: ONNX → TensorFlow SavedModel → TFLite (float32, then optionally INT8).
"""

import argparse
import shutil
from pathlib import Path

import numpy as np


def convert(onnx_path: Path, output_path: Path, quantize: bool = False) -> None:
    import onnx
    from onnx_tf.backend import prepare
    import tensorflow as tf

    print(f"Loading ONNX: {onnx_path}")
    onnx_model = onnx.load(str(onnx_path))

    saved_model_dir = onnx_path.parent / "_tf_saved_model"
    if saved_model_dir.exists():
        shutil.rmtree(saved_model_dir)

    print("Converting ONNX → TF SavedModel...")
    tf_rep = prepare(onnx_model)
    tf_rep.export_graph(str(saved_model_dir))

    print("Converting SavedModel → TFLite...")
    converter = tf.lite.TFLiteConverter.from_saved_model(str(saved_model_dir))
    converter.target_spec.supported_ops = [
        tf.lite.OpsSet.TFLITE_BUILTINS,
        tf.lite.OpsSet.SELECT_TF_OPS,
    ]
    converter.optimizations = [tf.lite.Optimize.DEFAULT]

    if quantize:
        # Dynamic-range quantisation — shrinks model, small accuracy cost
        print("  Applying dynamic-range quantisation...")

    tflite_model = converter.convert()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(tflite_model)
    print(f"Saved TFLite model: {output_path}  ({len(tflite_model) / 1024:.1f} KB)")

    # Verify with TFLite interpreter
    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    dummy = np.random.randn(*inp["shape"]).astype(np.float32)
    interpreter.set_tensor(inp["index"], dummy)
    interpreter.invoke()
    embedding = interpreter.get_tensor(out["index"])[0]
    norm = np.linalg.norm(embedding)
    print(f"Verification — output shape: {embedding.shape}  L2 norm: {norm:.6f}  (expect ~1.0)")

    shutil.rmtree(saved_model_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx",     required=True, type=Path)
    parser.add_argument("--output",   required=True, type=Path)
    parser.add_argument("--quantize", action="store_true")
    args = parser.parse_args()
    convert(args.onnx, args.output, args.quantize)


if __name__ == "__main__":
    main()
