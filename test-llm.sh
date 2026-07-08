#!/bin/bash
echo "=== Ollama direct ==="
curl -s --max-time 30 -X POST http://127.0.0.1:11434/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"model":"smartshit","messages":[{"role":"user","content":"hello"}],"stream":false}' | head -3
echo ""
echo "=== API chat ==="
echo '{"message":"hello"}' | curl -s --max-time 10 -X POST http://127.0.0.1:8787/api/chat -H 'Content-Type: application/json' -d @-
echo ""
echo "=== API forceLlm ==="
echo '{"message":"what is a budget","forceLlm":true}' | curl -s --max-time 60 -X POST http://127.0.0.1:8787/api/chat -H 'Content-Type: application/json' -d @-
echo ""
