#!/usr/bin/env python3
import onnx
import sys
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

for path in [
    "claude/es_MX-claude-high.onnx",
    "daniela/es_AR-daniela-high.onnx",
    "vits-mms-spa/model.onnx"
]:
    try:
        model = onnx.load(path)
        print(f"\n=== {path} ===")
        if model.metadata_props:
            for m in model.metadata_props:
                print(f"  {m.key}: {m.value}")
        else:
            print("  (sin metadatos)")
        graph = model.graph
        print(f"  inputs: {[i.name for i in graph.input]}")
    except Exception as e:
        print(f"\n=== {path} ===\n  ERROR: {e}")
