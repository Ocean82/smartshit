# Server ONNX models (Path B)

Place ONNX weights here for authenticated server-side inference (`POST /api/onnx/infer`).

## Layout

Preferred (nested):

```
server/models/minilm/model.onnx
server/models/minilm/tokenizer.json   # optional tokenizer companions
```

Flat fallback:

```
server/models/minilm.onnx
```

## MiniLM (all-MiniLM-L6-v2)

From the repo root:

```bash
npm run model:copy-deploy
```

This copies or downloads Xenova/all-MiniLM-L6-v2 ONNX + tokenizer files into `server/models/minilm/`.
Download requires network access when no local source is found.

**Do not** point runtime paths at `temp/` or `D:\spreadsht_workbook` — those are copy sources only.

## Git

`*.onnx` and other weight files under this directory are gitignored. Only this README and `.gitkeep` are tracked.
