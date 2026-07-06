# Model weights (not in git)

Large model files are **not** committed to this repository.

## Recommended local model

**Qwen3.5-4B** (quantized GGUF, ~2.7 GB) — runs on CPU with 8–16 GB RAM.

1. Download a GGUF build (e.g. `Qwen3.5-4B.q8q4.gguf`) from Hugging Face.
2. Place it in this folder: `models/Qwen3.5-4B.q8q4.gguf`
3. From the project root:

```bash
npm run model:setup
```

This registers the `smartshit` Ollama model used by the API server.

## Requirements

- [Ollama](https://ollama.com/) installed and running
- ~8 GB free RAM for comfortable local inference
