# Model weights (not in git)

Large model files are **not** committed to this repository.

## Primary failover (chat / Ollama)

**Spreadsheet-RL-4B** via Ollama (`smartshit`) is the production primary model.

- **Production:** GGUF is **already on the production server**. Do **not** re-upload.
  Verify the Ollama Modelfile only: `server/Modelfile.spreadsheet-rl`
  (`ollama create smartshit -f server/Modelfile.spreadsheet-rl` if re-registering).
- **Local (optional):** place the GGUF under `models/` and run `npm run model:setup`,
  or `npm run model:copy-deploy -- --with-spreadsheet-rl` if you have a local source.

Dev may use a smaller coder GGUF for speed; AI quality will differ from prod.

## MiniLM for ONNX Path B (server)

Server-side ONNX inference (`/api/onnx`) expects:

```
server/models/minilm/model.onnx
```

From the repo root:

```bash
npm run model:copy-deploy
```

The script resolves local candidates (`temp/…`, `SMARTSHT_MINILM_SRC`, optional
`D:\spreadsht_workbook`) and **falls back to a Hugging Face download**
(`Xenova/all-MiniLM-L6-v2`) when nothing local is found (requires network).

Optional: `npm run model:copy-deploy -- --public` also fills `public/models/minilm/`
for client Path A. User-upload Path A/B on the client is unchanged.

**Never** point runtime config at `temp/` or `D:\spreadsht_workbook` — those are
copy sources only. See `server/models/README.md`.

## Legacy / optional local coder model

**Qwen2.5-Coder-1.5B-Instruct** (Q8_0 GGUF) — fast CPU inference for local dev:

1. Place `qwen2.5-coder-1.5b-q8_0.gguf` in this folder
2. Adjust `server/Modelfile` / env as needed
3. `npm run model:setup`

## Requirements

- [Ollama](https://ollama.com/) installed and running for chat failover
- Network only when using the MiniLM download fallback
