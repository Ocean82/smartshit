module.exports = {
  apps: [{
    name: 'smartsht-api',
    script: 'npx',
    args: 'tsx src/index.ts',
    cwd: '/home/ubuntu/smartsht/server',
    env: {
      NODE_ENV: 'production',
      PORT: '8787',
      HOST: '127.0.0.1',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      SMARTSHIT_MODEL: 'smartshit',
      NUM_CTX: '2048',
      NUM_PREDICT: '512',
      CORS_ORIGIN: '*'
    }
  }]
};
