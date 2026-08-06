# Server Restructure Plan

**Server**: ubuntu@52.0.207.242 (AWS t3.large)  
**Date**: August 6, 2026

---

## Current State (The Problem)

The server currently hosts **two separate products** plus orphaned artifacts, all in `/home/ubuntu/`:

```
/home/ubuntu/
├── burntbeats-aws/              ← Full BurntBeats app (music production platform)
│   ├── backend/                 ← Node.js API (port 3001, burntbeats.com)
│   ├── frontend/dist/           ← Built React app served by nginx
│   ├── stem_service/            ← Python stem splitting service
│   ├── midi_service/            ← Python MIDI generation service
│   ├── speech_service/          ← Python speech service
│   ├── server_models/           ← Audio ML models (Demucs, MDX-Net, SCNet)
│   └── speech_models/           ← Speech enhancement models
├── smartsht/
│   └── app/                     ← SmartSht (spreadsheet app)
│       ├── server/              ← Express API (port 8787, smartsht.com)
│       ├── dist/                ← Built Vite frontend served by nginx
│       └── models/              ← GGUF models (unused — Ollama manages its own)
├── pricing-site/                ← Static pricing page
├── logs/                        ← PM2 log output links
├── backups/                     ← Old backup scripts and state
├── Spreadsheet-RL-4B.Q4_K_M.gguf  ← Model file (should be in a managed location)
├── Modelfile                    ← Ollama Modelfile (should be with the model)
└── snap/certbot/                ← SSL certificate management
```

### What's Wrong

1. **Two products share one server with no isolation** — a BurntBeats deploy could break SmartSht
2. **Model files dumped in home directory** — not in a standardized location
3. **Logs scattered** — PM2 writes to `~/.pm2/logs/` AND `~/logs/`
4. **No clear deployment artifact** — the Git repo IS the running code (`.git`, `.env`, `node_modules` all in the same place)
5. **No service user** — everything runs as `ubuntu`
6. **Backup scripts are dead** — in `~/backups/old-scripts/`, clearly outdated
7. **PM2 config is implicit** — no `ecosystem.config.js` file, processes started manually

---

## Proposed Structure

```
/opt/
├── smartsht/                      ← SmartSht app root
│   ├── current/                   ← Deployed artifact (built code only)
│   │   ├── dist/                  ← Vite frontend build output
│   │   ├── server/dist/           ← Compiled server code
│   │   ├── server/node_modules/   ← Production dependencies only
│   │   ├── shared/                ← Shared types
│   │   └── package.json
│   ├── models/                    ← GGUF files + Modelfiles
│   │   ├── Spreadsheet-RL-4B.Q4_K_M.gguf
│   │   └── Modelfile
│   ├── .env                       ← Single environment file
│   ├── ecosystem.config.cjs       ← PM2 process definition
│   └── logs/                      ← App-specific logs
│
├── burntbeats/                    ← BurntBeats app root
│   ├── current/                   ← Deployed artifact
│   ├── .env                       ← BurntBeats environment
│   ├── ecosystem.config.cjs       ← PM2 process definition
│   ├── models/                    ← Audio models (Demucs, MDX, etc.)
│   └── logs/
│
└── shared/                        ← Shared server infra
    ├── nginx/                     ← Nginx config templates
    ├── scripts/                   ← Deploy scripts, health checks
    └── ssl/                       ← Certbot references
```

---

## Migration Steps (Ordered)

### Phase 1: Preparation (no downtime)

1. **Create target directories**:
   ```bash
   sudo mkdir -p /opt/smartsht/{current,models,logs}
   sudo mkdir -p /opt/burntbeats/{current,models,logs}
   sudo mkdir -p /opt/shared/{nginx,scripts}
   sudo chown -R ubuntu:ubuntu /opt/smartsht /opt/burntbeats /opt/shared
   ```

2. **Move model files to proper location**:
   ```bash
   mv /home/ubuntu/Spreadsheet-RL-4B.Q4_K_M.gguf /opt/smartsht/models/
   mv /home/ubuntu/Modelfile /opt/smartsht/models/
   ```

3. **Create PM2 ecosystem config** (`/opt/smartsht/ecosystem.config.cjs`):
   ```js
   module.exports = {
     apps: [{
       name: 'smartsht-api',
       script: 'dist/server/src/index.js',
       cwd: '/opt/smartsht/current',
       env: { NODE_ENV: 'production' },
       instances: 1,
       max_memory_restart: '512M',
       restart_delay: 3000,
       max_restarts: 10,
       log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
       error_file: '/opt/smartsht/logs/error.log',
       out_file: '/opt/smartsht/logs/out.log',
     }]
   };
   ```

4. **Create a .env at the new location** (copy from `/home/ubuntu/smartsht/app/server/.env`):
   ```bash
   cp /home/ubuntu/smartsht/app/server/.env /opt/smartsht/.env
   ```

### Phase 2: Deploy to new structure (brief downtime)

5. **Build and copy** (from your local machine or CI):
   ```bash
   # Build locally
   npm run build
   npm run build:server
   
   # SCP the dist artifacts
   scp -r dist/ ubuntu@server:/opt/smartsht/current/dist/
   scp -r server/dist/ ubuntu@server:/opt/smartsht/current/server/dist/
   scp server/package.json ubuntu@server:/opt/smartsht/current/server/
   scp -r shared/ ubuntu@server:/opt/smartsht/current/shared/
   
   # Install production deps on server
   ssh server "cd /opt/smartsht/current/server && npm ci --production"
   ```

6. **Update PM2** to use new location:
   ```bash
   pm2 stop smartsht-api
   pm2 delete smartsht-api
   pm2 start /opt/smartsht/ecosystem.config.cjs
   pm2 save
   ```

7. **Update Nginx** to serve from `/opt/smartsht/current/dist/`:
   ```nginx
   # smartsht.com server block
   root /opt/smartsht/current/dist;
   ```

8. **Reload nginx**: `sudo nginx -t && sudo systemctl reload nginx`

### Phase 3: Cleanup (no downtime)

9. **Verify everything works** — test the app at smartsht.com
10. **Remove old locations**:
    ```bash
    # Only after confirming the new setup works!
    rm -rf /home/ubuntu/smartsht  # old app location
    rm -f /home/ubuntu/Spreadsheet-RL-4B.Q4_K_M.gguf  # already moved
    rm -f /home/ubuntu/Modelfile  # already moved
    rm -rf /home/ubuntu/backups/old-scripts  # dead scripts
    ```

11. **Clean up old Ollama models** (the broken ones):
    ```bash
    ollama rm smartsht-assist
    ollama rm qwen2.5-coder:1.5b
    ```

---

## What NOT to Touch (Yet)

- **BurntBeats** — leave it at `/home/ubuntu/burntbeats-aws/` for now. Move it when you're ready to restructure that project.
- **Ollama's internal storage** (`/usr/share/ollama/.ollama/`) — that's managed by Ollama, don't mess with it.
- **Certbot/SSL** — leave at `/snap/certbot/`, that's standard Ubuntu placement.
- **PM2's process manager socket** (`~/.pm2/`) — stays in home directory, that's PM2's expectation.

---

## Deployment Script (Future)

Once restructured, create a simple deploy script (`/opt/shared/scripts/deploy-smartsht.sh`):

```bash
#!/bin/bash
set -e

APP_DIR="/opt/smartsht/current"
REPO_DIR="/tmp/smartsht-deploy-$$"

echo "=== SmartSht Deploy ==="

# Pull latest from git
git clone --depth 1 git@github.com:Ocean82/smartshit.git "$REPO_DIR"

# Build
cd "$REPO_DIR"
npm ci
npm run build
cd server && npm ci && npm run build && cd ..

# Deploy
rsync -a --delete dist/ "$APP_DIR/dist/"
rsync -a --delete server/dist/ "$APP_DIR/server/dist/"
rsync -a --delete shared/ "$APP_DIR/shared/"
cp server/package.json "$APP_DIR/server/"
cd "$APP_DIR/server" && npm ci --production

# Restart
pm2 restart smartsht-api

# Cleanup
rm -rf "$REPO_DIR"

echo "=== Deploy complete ==="
```

---

## Risk Assessment

| Step | Risk | Mitigation |
|------|------|-----------|
| Moving files | Paths in .env or code reference old locations | The server code uses relative paths from CWD, not absolute. PM2's `cwd` is what matters. |
| PM2 restart | Brief downtime (seconds) | Schedule during low-traffic window |
| Nginx reload | Zero downtime | `nginx -t` validates before reload |
| Ollama model path | Model was imported by hash, not file path | Ollama copies to its own blob storage on `create`. The source file can be moved safely. |
| Server .env | References to file paths | Only `modelPath` in config.ts references a file path — and it's unused since Ollama manages models |

---

## Notes

- This server is a **t3.large (8 GB RAM)** running BurntBeats + SmartSht simultaneously. That's tight. If BurntBeats's stem services are active, SmartSht's Ollama model may not have enough RAM. Consider separating to two instances if both products get real traffic.
- The BurntBeats app has its own models directory (`server_models/`) with audio ML models that are potentially GB-sized. Monitor disk usage.
- PM2 log rotation should be configured — currently logs accumulate without limits.
