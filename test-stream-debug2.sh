#!/bin/bash
# Test streaming with verbose curl to see what happens
echo '{"message":"hello","forceLlm":true}' | curl -s --max-time 60 -N -X POST http://127.0.0.1:8787/api/chat/stream -H 'Content-Type: application/json' -d @-
echo ""
echo "=== Exit code: $? ==="
