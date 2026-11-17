# public/models/

On-device ONNX models (onnxruntime-web, WASM backend). Each model needs two files:

- `<name>.onnx` — exported by the matching notebook in `notebooks/`
- `<name>.json` — metadata:

```json
{
  "name": "skin",
  "version": "0.1.0",
  "classes": ["healthy", "scabies"],
  "inputSize": [224, 224],
  "mean": [0.485, 0.456, 0.406],
  "std": [0.229, 0.224, 0.225],
  "min_confidence": 0.7
}
```

Expected names: `food`, `skin`. If a file is missing the app shows "model not loaded yet" and does not crash.
