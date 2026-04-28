#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import onnx
import os
import sys

# Forzar stdout a UTF-8
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

def clear_and_add_meta(filename, meta_data):
    print(f"Abriendo: {filename}")
    model = onnx.load(filename)
    while len(model.metadata_props) > 0:
        model.metadata_props.pop()
    for key, value in meta_data.items():
        m = model.metadata_props.add()
        m.key = key
        m.value = str(value)
        print(f"  + {key}: {value}")
    onnx.save(model, filename)
    print(f"  OK Guardado\n")

# Claude / Daniela high
clear_and_add_meta("claude/es_AR-daniela-high.onnx", {
    "model_type":  "vits",
    "sample_rate": "22050",
    "language":    "es",
    "voice":       "daniela",
    "n_speakers":  "1",
})

# Daniela carpeta propia
try:
    clear_and_add_meta("daniela/es_AR-daniela-high.onnx", {
        "model_type":  "vits",
        "sample_rate": "22050",
        "language":    "es",
        "voice":       "daniela",
        "n_speakers":  "1",
    })
except Exception as e:
    print(f"  WARN: {e}\n")

# Meta MMS
clear_and_add_meta("vits-mms-spa/model.onnx", {
    "model_type":  "vits",
    "sample_rate": "16000",
    "language":    "es",
    "comment":     "mms",
    "n_speakers":  "0",
})

# Regenerar tokens.txt MMS con UTF-8 limpio (sin BOM, sin duplicados)
mms_tokens = [
    (" ", 27), ("a", 1), ("v", 2), ("c", 3), ("\u2014", 4),
    ("0", 5), ("5", 6), ("\u00f3", 7), ("8", 8), ("p", 9),
    ("y", 10), ("z", 11), ("4", 12), ("m", 13), ("\u00fc", 14),
    ("k", 15), ("s", 16), ("\u00e1", 17), ("q", 18), ("h", 19),
    ("n", 20), ("\u00e9", 21), ("_", 22), ("9", 23), ("1", 24),
    ("f", 25), ("t", 26), ("x", 28), ("d", 29), ("\u00ed", 30),
    ("b", 31), ("3", 32), ("j", 33), ("g", 34), ("l", 35),
    ("2", 36), ("i", 37), ("u", 38), ("e", 39), ("\u00fa", 40),
    ("o", 41), ("\u00f1", 42), ("r", 43), ("6", 44),
]
with open("vits-mms-spa/tokens.txt", "w", encoding="utf-8", newline="\n") as f:
    for ch, idx in mms_tokens:
        f.write(f"{ch} {idx}\n")
print("OK tokens.txt MMS regenerado con UTF-8 limpio\n")

print("Todo listo.")
