# Model weights (not in git)

Large model files are **not** committed to this repository.

## Recommended local model

**Qwen2.5-Coder-1.5B-Instruct** (Q8_0 GGUF, ~1.57 GB) — fast CPU inference, excellent at structured JSON output.

This model is ~2× faster than the previous Qwen3.5-4B while producing better structured responses for our use case (tool calling + short explanations).

1. Download `qwen2.5-coder-1.5b-q8_0.gguf` from Hugging Face or copy from your local models folder.
2. Place it in this folder: `models/qwen2.5-coder-1.5b-q8_0.gguf`
3. From the project root:

```bash
npm run model:setup
```

This registers the `smartshit` Ollama model used by the API server.

## Requirements

- [Ollama](https://ollama.com/) installed and running
- ~4 GB free RAM for comfortable local inference (much less than the previous 4B model)

## Why this model?

- **Speed**: 1.5B params generates tokens 3–4× faster than 4B on CPU
- **Quality**: Qwen2.5-Coder-Instruct is specifically trained for structured output / JSON — perfect for tool calling
- **Size**: Q8_0 quantization preserves quality while keeping the file under 1.6GB
- **Streaming**: The server now streams tokens as they generate, so you see responses appear in real-time

## Legacy model

The previous `Qwen3.5-4B.q8q4.gguf` (2.7GB) still works if you prefer quality over speed. Update the Modelfile's `FROM` line to point at it and bump `num_ctx` to 4096.
