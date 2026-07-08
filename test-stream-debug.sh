#!/bin/bash
echo "=== Non-stream via public HTTPS ==="
echo '{"message":"what is a budget","forceLlm":true}' | curl -s --max-time 60 -X POST https://smartsht.com/api/chat -H 'Content-Type: application/json' -d @-
echo ""
echo ""
echo "=== Stream via public HTTPS ==="
echo '{"message":"what is a budget","forceLlm":true}' | curl -sv --max-time 60 -N -X POST https://smartsht.com/api/chat/stream -H 'Content-Type: application/json' -d @- 2>&1 | grep -E "^(data:|< |> |{)"
echo ""
echo "=== Stream via localhost ==="
echo '{"message":"what is a budget","forceLlm":true}' | curl -s --max-time 60 -N -X POST http://127.0.0.1:8787/api/chat/stream -H 'Content-Type: application/json' -d @- 
echo ""
