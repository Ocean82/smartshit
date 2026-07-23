# Review Corrections Plan

Corrections to apply to `docs/smartsht-review.md` based on verified codebase investigation.

---

## Checklist

- [x] **1. Auditor rule count** — Change "11 client-side rules" → "10 client-side rules"
- [x] **2. Store metrics** — Change "1,472 lines / ~80+ actions" → "1,613 lines / ~178 actions"
- [x] **3. Server total lines** — Change "3,813 lines" → "~4,291 lines"
- [x] **4. Test file count** — Change "22 test files" → "29 test files"
- [x] **5. SpreadsheetGrid line count** — Change "946 Lines" → "~1,008 Lines"
- [x] **6. Virtualization claim** — Rewrite to acknowledge existing viewport-based row virtualization; reframe concern to column virtualization and fixed buffer
- [x] **7. conditionalFormat.ts line count** — Change "477 lines" → "~537 lines"
- [x] **8. Template spec location** — Clarify that TemplateSpec objects live in `src/templates/` category files, not `shared/toolRegistry.ts`
- [x] **9. Improvement table line counts** — Update store (1,472 → 1,613) and grid (946 → ~1,008) in the table
- [x] **10. Summary section** — Update "946-line grid component" → "~1,008-line grid component"

---

## Details

### 1. Auditor rule count

**Section:** "What's Unique", paragraph 2  
**Current:** `11 client-side rules`  
**Correct:** `10 client-side rules`  
**Evidence:** `src/auditor/rules/index.ts` exports exactly 10 rules in `ALL_RULES`.

### 2. Store metrics

**Section:** "What's Lacking" → #1 heading + body  
**Current:** `1,472 lines` / `~80+ actions`  
**Correct:** `1,613 lines` / `~178 actions`  
**Evidence:** Actual line count + grep for action definitions in `src/store/useStore.ts`.

### 3. Server total lines

**Section:** "What's Lacking" → #2 heading  
**Current:** `only **3,813 lines**`  
**Correct:** `~4,291 lines`  
**Evidence:** Sum of `.ts` files in `server/src/` excluding tests.

### 4. Test file count

**Section:** "What's Lacking" → #3  
**Current:** `22 test files`  
**Correct:** `29 test files`  
**Evidence:** File search for `*.test.ts` across project source directories.

### 5. SpreadsheetGrid line count

**Section:** "What's Lacking" → #4 heading  
**Current:** `946 Lines`  
**Correct:** `~1,008 Lines`  
**Evidence:** Actual line count of `src/components/SpreadsheetGrid.tsx`.

### 6. Virtualization claim

**Section:** "What's Lacking" → Performance Concerns, bullet 3  
**Current:** `The grid renders all visible rows without virtualization beyond the buffer. For 10,000 row sheets this could be sluggish.`  
**Correct:** The grid implements viewport-based row virtualization (startRow/endRow from scroll position, renders only visible rows + buffer). Reframe: lacks column virtualization for wide sheets, and the row buffer is a fixed constant rather than adaptive.  
**Evidence:** `visibleRange` useMemo in SpreadsheetGrid.tsx calculates viewport-based rendering bounds.

### 7. conditionalFormat.ts line count

**Section:** "What's Lacking" → Performance Concerns, bullet 2  
**Current:** `conditionalFormat.ts (477 lines)`  
**Correct:** `conditionalFormat.ts (~537 lines)`  
**Evidence:** Actual line count of the file.

### 8. Template spec location

**Section:** "What's Unique", paragraph 3  
**Current:** `specs in shared/toolRegistry.ts, declarative TemplateSpec objects`  
**Correct:** `tool definitions in shared/toolRegistry.ts, declarative TemplateSpec objects in src/templates/ category files (core.ts, personal-finance.ts, freelancer.ts, real-estate.ts, small-business.ts, education.ts, health.ts, saas-demo.ts), aggregated by src/templates/registry.ts`  
**Evidence:** `TemplateSpec` interface in `src/templates/types.ts`; registry in `src/templates/registry.ts`.

### 9. Improvement table line counts

**Section:** "What Can Be Improved" table  
**Changes:**
- State management row: `1,472-line god store` → `1,613-line god store`
- Grid component row: `946 lines, does everything` → `~1,008 lines, does everything`

### 10. Summary section

**Section:** "Summary", paragraph 2  
**Current:** `the 946-line grid component`  
**Correct:** `the ~1,008-line grid component`
