# Production TODO

Running list of actions that must be performed on the production server (`ubuntu@52.0.207.242` / `/opt/smartsht/`).

Items are added as local development work creates production requirements. Check off and date when completed.

---

## Pending

- [ ] **Update `GROQ_MODEL` on production server** (URGENT - model deprecated)
  - File: `/opt/smartsht/.env`
  - Change: `GROQ_MODEL=llama-3.3-70b-versatile` → `GROQ_MODEL=openai/gpt-oss-120b`
  - Reason: Groq deprecated `llama-3.3-70b-versatile` on June 17, 2026. Requests to this model are failing, causing "AI is currently unavailable" for all users.
  - After: `pm2 restart smartsht-api` and verify via `curl https://smartsht.com/health`
  - Added: 2026-08-22

- [ ] **Verify Ollama is running on production server**
  - Check: `systemctl status ollama` or `curl http://127.0.0.1:11434/api/tags`
  - If not running: `sudo systemctl start ollama && sudo systemctl enable ollama`
  - Verify model loaded: `ollama list` should show `smartshit` (Spreadsheet-RL-4B)
  - If model missing: `ollama create smartshit -f /opt/smartsht/current/server/Modelfile.spreadsheet-rl`
  - Reason: Ollama is the last-resort fallback. If it's not running, and Groq is dead, there's zero AI available.
  - Added: 2026-08-22

- [ ] **Add OpenRouter API key to production for real failover**
  - File: `/opt/smartsht/.env`
  - Add: `OPENROUTER_API_KEY=<your-key>` (get from https://openrouter.ai/keys)
  - Add: `OPENROUTER_MODEL=qwen/qwen3-32b`
  - Add: `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
  - Reason: Currently only groq + ollama are in the chain. If either goes down, there's no cloud fallback. OpenRouter gives access to 100+ models behind a single key.
  - Added: 2026-08-22

- [ ] **Update `LLM_PROVIDER_ORDER` on production to include OpenRouter**
  - File: `/opt/smartsht/.env`
  - Change: `LLM_PROVIDER_ORDER=groq,ollama` → `LLM_PROVIDER_ORDER=groq,openrouter,ollama`
  - Reason: Even with the key added, OpenRouter won't be tried unless it's in the failover order.
  - After: `pm2 restart smartsht-api`
  - Added: 2026-08-22

---

## Completed

_(move items here when done, add completion date)_
