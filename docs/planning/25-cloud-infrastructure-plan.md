# Cloud Infrastructure Plan: RDS + S3 Integration

> **Status**: Planning — ready for implementation
> **Priority**: High — resolves the #1 user trust issue ("where does my data go?")
> **AWS Resources**: RDS PostgreSQL (`burntbeats-db.cgnemc2qmel7.us-east-1.rds.amazonaws.com`), S3 (`burntbeatz2-storage`, us-east-1)

---

## Overview

Add cloud persistence to smartsh!t so users can save workbooks, access them across devices, restore previous versions, and share with others. The architecture is **offline-first**: localStorage remains the primary store for instant performance, with async background sync to the cloud.

---

## Four Capabilities

| # | Capability | User Value |
|---|---|---|
| 1 | Cloud Save + Multi-Device | Never lose work. Open on any device. |
| 2 | Version History | Restore any previous save point. |
| 3 | Shared Workbooks | Send a link to share with others. |
| 4 | Community Template Marketplace | Browse, rate, and install templates from other users. |

---

## Phase 1: Foundation (Server + Database)

### 1.1 New Dependencies

```bash
# Server
cd server
npm install pg @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 1.2 Database Schema (PostgreSQL)

```sql
-- Run against the burntbeats database
-- Schema: smartsht (keeps our tables separate from any existing burntbeats tables)

CREATE SCHEMA IF NOT EXISTS smartsht;

-- Users (synced from Clerk on first login)
CREATE TABLE smartsht.users (
  id TEXT PRIMARY KEY,                    -- Clerk user ID
  email TEXT,
  display_name TEXT,
  plan TEXT DEFAULT 'free',               -- 'free' | 'pro'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workbooks (metadata only — actual data lives in S3)
CREATE TABLE smartsht.workbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES smartsht.users(id),
  name TEXT NOT NULL,
  s3_key TEXT NOT NULL,                    -- S3 object key for latest version
  size_bytes INTEGER DEFAULT 0,
  sheet_count INTEGER DEFAULT 1,
  last_saved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE         -- Soft delete
);

CREATE INDEX idx_workbooks_owner ON smartsht.workbooks(owner_id) WHERE NOT is_deleted;

-- Version History
CREATE TABLE smartsht.workbook_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id UUID NOT NULL REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  s3_key TEXT NOT NULL,                    -- S3 key for this version's snapshot
  size_bytes INTEGER DEFAULT 0,
  description TEXT,                        -- "Auto-save" or "Before import" etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_versions_workbook ON smartsht.workbook_versions(workbook_id, version_number DESC);

-- Shared Workbooks
CREATE TABLE smartsht.shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id UUID NOT NULL REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL REFERENCES smartsht.users(id),
  share_token TEXT UNIQUE NOT NULL,        -- Random token for the share URL
  permission TEXT DEFAULT 'view',          -- 'view' | 'edit'
  expires_at TIMESTAMPTZ,                  -- NULL = never expires
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shares_token ON smartsht.shares(share_token);

-- Community Templates
CREATE TABLE smartsht.community_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id TEXT NOT NULL REFERENCES smartsht.users(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  icon TEXT DEFAULT '📄',
  prompt TEXT NOT NULL,
  s3_key TEXT,                             -- Optional: full template package in S3
  downloads INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_category ON smartsht.community_templates(category) WHERE is_published;
CREATE INDEX idx_templates_popular ON smartsht.community_templates(downloads DESC) WHERE is_published;
```

### 1.3 S3 Key Structure

```
burntbeatz2-storage/
├── smartsht/
│   ├── workbooks/
│   │   ├── {user_id}/{workbook_id}/latest.json      -- Current version
│   │   ├── {user_id}/{workbook_id}/v001.json        -- Version 1
│   │   ├── {user_id}/{workbook_id}/v002.json        -- Version 2
│   │   └── ...
│   └── templates/
│       └── {template_id}.json                        -- Community template packages
```

### 1.4 Server Config Extension

Add to `server/src/config.ts`:
```typescript
// Cloud Storage
databaseUrl: process.env.DATABASE_URL ?? '',
s3Bucket: process.env.S3_BUCKET ?? 'burntbeatz2-storage',
s3Region: process.env.S3_REGION ?? 'us-east-1',
s3Prefix: process.env.S3_SMARTSHT_PREFIX ?? 'smartsht',
awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
```

---

## Phase 2: Cloud Save + Multi-Device Sync

### 2.1 New Server Files

```
server/src/
├── db.ts              -- PostgreSQL connection pool
├── s3.ts              -- S3 client + upload/download helpers
├── routes/
│   ├── workbooks.ts   -- CRUD for workbooks
│   ├── versions.ts    -- Version history endpoints
│   ├── shares.ts      -- Share link management
│   └── templates.ts   -- Community template marketplace
```

### 2.2 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workbooks` | List user's workbooks |
| POST | `/api/workbooks` | Create/save a workbook |
| GET | `/api/workbooks/:id` | Download a workbook |
| PUT | `/api/workbooks/:id` | Update (save) a workbook |
| DELETE | `/api/workbooks/:id` | Soft-delete a workbook |
| GET | `/api/workbooks/:id/versions` | List version history |
| GET | `/api/workbooks/:id/versions/:versionId` | Download a specific version |
| POST | `/api/workbooks/:id/versions` | Create a named snapshot |
| POST | `/api/workbooks/:id/share` | Create a share link |
| DELETE | `/api/shares/:token` | Revoke a share link |
| GET | `/api/shared/:token` | Access a shared workbook (public) |
| GET | `/api/community-templates` | Browse community templates |
| POST | `/api/community-templates` | Publish a template |
| POST | `/api/community-templates/:id/install` | Install (download) a template |

### 2.3 Sync Strategy (Client)

```
┌────────────────────────────────────────────────────────┐
│ User edits spreadsheet                                  │
│   ↓                                                     │
│ Zustand store updates → localStorage (immediate)        │
│   ↓ (debounced 5 seconds after last edit)               │
│ Background sync: PUT /api/workbooks/:id                 │
│   → Server saves to S3                                  │
│   → Server creates version entry in RDS                 │
│   → Returns { saved: true, version: 3 }                │
│   ↓                                                     │
│ StatusBar shows "☁️ Saved" (replaces "Autosaved")       │
└────────────────────────────────────────────────────────┘
```

### 2.4 Frontend Changes

New file: `src/lib/cloudSync.ts`
- `saveToCloud(workbook)` — debounced PUT to server
- `loadFromCloud(workbookId)` — GET from server
- `listCloudWorkbooks()` — GET list
- `syncStatus` state: 'saved' | 'syncing' | 'offline' | 'error'

Update `src/App.tsx` TitleBar:
- Replace "Autosaved" badge with cloud sync status indicator
- Show "☁️ Saved" / "⏳ Syncing..." / "📱 Local only"

New component: `src/components/WorkbookPicker.tsx`
- Modal showing cloud workbooks (name, last saved, size)
- "Open" loads from cloud → localStorage → Zustand
- Replaces the FileExplorer for cloud users

---

## Phase 3: Version History

### 3.1 How It Works

- Every save to cloud auto-creates a version (up to 50 per workbook for free, unlimited for pro)
- Versions are stored as separate S3 objects (cheap — JSON compresses well)
- Users can browse versions, preview, and restore

### 3.2 Frontend

New component: `src/components/VersionHistoryPanel.tsx`
- Slide-out panel (right side, like Format Panel)
- Shows version list: timestamp, description, size
- "Preview" opens a read-only view
- "Restore" replaces current workbook (with confirmation)
- Accessible from File menu → "Version History"

---

## Phase 4: Shared Workbooks

### 4.1 How It Works

- User clicks "Share" → server generates a unique token
- Share URL: `https://smartsht.com/shared/{token}`
- Viewer loads the workbook in read-only mode (no auth required)
- Optional: edit permission (requires Clerk auth)

### 4.2 Frontend

- "Share" button in the TitleBar or File menu
- Dialog showing the share link + copy button
- Permission toggle (View only / Can edit)
- Expiration option (24h, 7d, 30d, never)
- Revoke button for existing shares

### 4.3 Shared View Route

New page: `/shared/:token` — loads the shared workbook
- Read-only SpreadsheetGrid (no editing, no chat)
- Banner: "Shared by {name} · View only"
- "Make a copy" button to import into user's own account

---

## Phase 5: Community Template Marketplace

### 5.1 How It Works

- Users publish templates from the Template Gallery ("Share as community template")
- Published templates stored in RDS (metadata) + S3 (full package)
- Other users browse, sort by popularity/rating, and install

### 5.2 Frontend

Extend `TemplateGallery.tsx`:
- New tab: "Community" (fetches from `/api/community-templates`)
- Each template card shows: name, author, downloads, rating
- "Install" button downloads and adds to local library
- "Publish" button in the user's own templates

---

## Implementation Order

```
Session 1: Foundation
  ├── Install pg + aws-sdk
  ├── Create db.ts (connection pool)
  ├── Create s3.ts (upload/download helpers)
  ├── Add cloud config to config.ts
  ├── Create SQL migration file
  └── Run migration on RDS

Session 2: Cloud Save
  ├── Build workbooks CRUD endpoints
  ├── Create cloudSync.ts (frontend)
  ├── Wire debounced auto-save
  ├── Update TitleBar sync indicator
  └── Build WorkbookPicker

Session 3: Version History
  ├── Build versions endpoints
  ├── Auto-version on save
  ├── Build VersionHistoryPanel
  └── Wire restore functionality

Session 4: Sharing
  ├── Build shares endpoints
  ├── Create share dialog
  ├── Build /shared/:token route
  └── Add "Make a copy" for viewers

Session 5: Community Marketplace
  ├── Build community templates endpoints
  ├── Extend TemplateGallery with community tab
  ├── Publish flow
  └── Rating/download tracking
```

---

## Security Considerations

- All API endpoints require Clerk JWT validation (except `/api/shared/:token` for public view)
- S3 keys are scoped per-user (`smartsht/workbooks/{user_id}/...`) — no user can access another's files
- Share tokens are cryptographically random (UUIDv4) — not guessable
- Workbook data in S3 is encrypted at rest (S3 default encryption)
- Database connection uses SSL (`sslmode=require`)
- Rate limiting on save endpoints (max 1 save per 5 seconds per user)

---

## Environment Variables Needed on Server

```bash
# Add to server .env on EC2:
DATABASE_URL=postgresql://burntbeatsadmin:<PASSWORD>@burntbeats-db.cgnemc2qmel7.us-east-1.rds.amazonaws.com:5432/burntbeats?sslmode=require
S3_BUCKET=burntbeatz2-storage
S3_REGION=us-east-1
S3_SMARTSHT_PREFIX=smartsht
AWS_ACCESS_KEY_ID=<your-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-secret-access-key>
```

---

## Success Metrics

- Users can create a workbook on desktop and open it on mobile within 10 seconds
- Version restore works in <3 seconds for a typical workbook
- Shared links load within 2 seconds for viewers
- Cloud save adds <100ms latency to the user experience (background sync)
- Zero data loss: localStorage + S3 = belt and suspenders
