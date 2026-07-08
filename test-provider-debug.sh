#!/bin/bash
# Add temp logging to see what's happening with providers
node -e "
const http = require('http');
const data = JSON.stringify({message:'hello',forceLlm:true});
const req = http.request({
  hostname: '127.0.0.1',
  port: 8787,
  path: '/api/chat/stream',
  method: 'POST',
  headers: {'Content-Type':'application/json','Content-Length':data.length}
}, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; process.stdout.write(chunk.toString()); });
  res.on('end', () => { console.log('\n=== RESPONSE END ==='); });
});
req.write(data);
req.end();
setTimeout(() => { console.log('\n=== TIMEOUT 30s ==='); process.exit(0); }, 30000);
"
