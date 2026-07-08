#!/bin/bash
cd /home/ubuntu/smartsht/server/src
# Add error logging in the catch block
sed -i 's/providerErrors.push(`${provider}: ${message}`)/providerErrors.push(`${provider}: ${message}`)\n      console.log("[STREAM ERROR]", provider, message)/' index.ts
cd /home/ubuntu/smartsht/server
pm2 restart smartsht-api
sleep 3
echo '{"message":"hi","forceLlm":true}' | curl -s --max-time 60 -N -X POST http://127.0.0.1:8787/api/chat/stream -H 'Content-Type: application/json' -d @-
echo ""
pm2 logs smartsht-api --lines 5 --nostream
