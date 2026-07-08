#!/bin/bash
echo "=== Public non-stream ==="
echo '{"message":"hello"}' | curl -s --max-time 10 -X POST https://smartsht.com/api/chat -H 'Content-Type: application/json' -d @-
echo ""
echo "=== Public stream ==="
echo '{"message":"hello"}' | curl -s --max-time 10 -N -X POST https://smartsht.com/api/chat/stream -H 'Content-Type: application/json' -d @-
echo ""
echo "=== Public forceLlm stream ==="
echo '{"message":"what is a spreadsheet","forceLlm":true}' | curl -s --max-time 60 -N -X POST https://smartsht.com/api/chat/stream -H 'Content-Type: application/json' -d @-
echo ""
