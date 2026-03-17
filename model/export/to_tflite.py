"""Convert ONNX MobileFaceNet to TFLite flatbuffer for Android.

Usage:
    python model/export/to_tflite.py \\
        --onnx   model.onnx \\
        --output android/src/main/assets/mobilefacenet.tflite

Pipeline: ONNX → TensorFlow SavedModel (onnx-tf) → TFLite.
"""

import argparse
import tempfile
from pathlib import Path

import numpy as np
import onnx


def _sanitize_names(model_proto) -> None:
    """Replace dots in tensor names with underscores (TF rejects dots)."""
    rename = {
        t.name: t.name.replace(".", "_")
        for t in list(model_proto.graph.input)
        + list(model_proto.graph.output)
        + list(model_proto.graph.value_info)
        if "." in t.name
    }
    if not rename:
        return
    for t in list(model_proto.graph.input) + list(model_proto.graph.output) + list(model_proto.graph.value_info):
        if t.name in rename:
            t.name = rename[t.name]
    for node in model_proto.graph.node:
        node.input[:] = [rename.get(n, n) for n in node.input]
        node.output[:] = [rename.get(n, n) for n in node.output]


def convert(onnx_path: Path, output_path: Path, quantize: bool = False) -> None:
    import onnx_tf.backend as onnx_tf_backend
    import tensorflow as tf

    print(f"Converting ONNX → TFLite: {onnx_path}")

    model_proto = onnx.load(str(onnx_path))
    _sanitize_names(model_proto)

    with tempfile.TemporaryDirectory() as saved_model_dir:
        tf_rep = onnx_tf_backend.prepare(model_proto)
        tf_rep.export_graph(saved_model_dir)

        converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_dir)
        if quantize:
            print("  Applying dynamic-range quantisation...")
            converter.optimizations = [tf.lite.Optimize.DEFAULT]
        tflite_model = converter.convert()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(tflite_model)
    print(f"Saved TFLite model: {output_path}  ({len(tflite_model) / 1024:.1f} KB)")

    # Verify
    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    dummy = np.random.randn(*inp["shape"]).astype(np.float32)
    interpreter.set_tensor(inp["index"], dummy)
    interpreter.invoke()
    embedding = interpreter.get_tensor(out["index"])[0]
    norm = np.linalg.norm(embedding)
    print(f"Verification — output shape: {embedding.shape}  L2 norm: {norm:.4f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx",     required=True, type=Path)
    parser.add_argument("--output",   required=True, type=Path)
    parser.add_argument("--quantize", action="store_true")
    args = parser.parse_args()
    convert(args.onnx, args.output, args.quantize)


if __name__ == "__main__":
    main()
