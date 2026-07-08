#!/bin/bash
echo "=== Test: clear and start over (stream) ==="
echo '{"message":"clear the budget and start over"}' | curl -s --max-time 60 -N -X POST http://127.0.0.1:8787/api/chat/stream -H 'Content-Type: application/json' -d @-
echo ""
echo ""
echo "=== Test: build a monthly budget (stream) ==="
echo '{"message":"build a monthly budget"}' | curl -s --max-time 60 -N -X POST http://127.0.0.1:8787/api/chat/stream -H 'Content-Type: application/json' -d @-
echo ""
