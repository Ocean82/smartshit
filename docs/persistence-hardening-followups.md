# Persistence hardening — deferred follow-ups

Context: the immediate silent data-loss risks in local persistence were fixed in
commit `04b3a62` (see `src/lib/persistence.ts`, `src/main.tsx`):

- `savePersistedState` now returns a `LocalSaveResult`; `main.tsx` shows a
  one-per-episode toast when localStorage is full or a save fails.
- `loadPersistedState` quarantines a corrupt payload to
  `smartsht-state-v1.corrupt` before returning `null`.

The two items below were **deliberately deferred** — they are larger than the
data-loss fix warranted, and one conflicts with the project's stability rules.
They are optional improvements, not open bugs.

---

## 1. Proactive LRU eviction + per-file storage sizes (medium effort)

**Problem it addresses:** the current fix *tells* the user when storage is full
but doesn't help them recover space in-product. A user with several imported
workbooks can hit the ~5–10MB localStorage quota and then has to guess what to
delete.

**Scope:**
- Track an approximate byte size per workbook slot when building the persistence
  snapshot (`src/lib/fileWorkbooks.ts` → `buildPersistenceSnapshot`).
- Before saving, if the serialized snapshot exceeds a self-imposed budget
  (~4MB, leaving headroom under the browser quota), evict the least-recently-used
  non-active workbook(s) from the local snapshot until it fits. Never evict the
  active workbook. Cloud-saved workbooks are safe to evict locally (they can be
  re-fetched); local-only ones must be surfaced for export first, not silently
  dropped.
- Surface per-file sizes in the file explorer (`WorkbookPicker` / file list) so
  users can see what's heavy.

**Watch out for:**
- "Least recently used" needs a real `lastOpenedAt`/`lastTouchedAt` timestamp;
  `updatedAt` on the workbook is close but not the same as "user last looked at
  it".
- Eviction must be coordinated with cloud sync so a local-only workbook is never
  lost without an export prompt (tie into the existing quota toast + a confirm).

**Test:** a snapshot over budget evicts the oldest non-active, cloud-backed slot
and keeps the active one; a local-only over-budget slot triggers the
export/confirm path instead of silent eviction.

---

## 2. Move local persistence to IndexedDB (larger effort — stability tradeoff)

**Problem it addresses:** localStorage's ~5–10MB synchronous quota is the root
constraint. IndexedDB offers far larger quotas and stores structured
data/Blobs efficiently, which would remove the quota pressure entirely and make
items #1 mostly unnecessary.

**Why deferred:** this is a storage-layer rewrite plus a new dependency
(`idb-keyval` or similar). The project is in late-stage development and the
stability guidance is to avoid major dependency swaps / architecture changes
without a specific need. Only take this on if quota pressure proves to be a real,
recurring user problem after #1.

**Scope if pursued:**
- Introduce an async storage adapter behind the current `loadPersistedState` /
  `savePersistedState` interface (both would become `Promise`-returning).
- Migrate the existing `smartsht-state-v1` localStorage payload into IndexedDB on
  first load, then remove the localStorage key.
- Update `main.tsx` (the 400ms debounced save + `beforeunload` flush) to handle
  async saves — the `beforeunload` path is the tricky part, since async work
  during unload is unreliable; keep a synchronous localStorage "last resort"
  write for the unload case, or accept a small window.

**Watch out for:**
- `beforeunload` cannot reliably await IndexedDB. A hybrid (IndexedDB for the
  main store, a tiny synchronous localStorage flush on unload) may be needed.
- Every current caller assumes synchronous load at store-init
  (`src/store/useStore.ts` calls `loadPersistedState()` synchronously). Going
  async changes store bootstrap — plan for a loading state.
