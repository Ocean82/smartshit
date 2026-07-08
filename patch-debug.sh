#!/bin/bash
# Add a console.log right before the provider loop to see signal state
cd /home/ubuntu/smartsht/server/src
sed -i 's/const availableProviders = providerOrder().filter(providerIsConfigured)/const availableProviders = providerOrder().filter(providerIsConfigured)\n  console.log("[STREAM DEBUG] providers:", availableProviders, "signal.aborted:", signal?.aborted)/' index.ts
cd /home/ubuntu/smartsht/server
pm2 restart smartsht-api
sleep 3
echo '{"message":"hi","forceLlm":true}' | curl -s --max-time 30 -N -X POST http://127.0.0.1:8787/api/chat/stream -H 'Content-Type: application/json' -d @-
echo ""
pm2 logs smartsht-api --lines 5 --nostream
