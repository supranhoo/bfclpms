## Auditor Feedback — Bulk Review

Two narrow, surgical changes. No business-logic / RLS changes.

---

### Issue 1 — Category filter is non-functional with 2+ selections

**RCA**
- `BulkReviewDashboard.tsx` only forwards `category_id` to the RPC when **exactly one** category is selected (`oneOrNull` pattern, L211–218).
- When 2+ are selected the server gets `null` ("all categories") and the dashboard's client-side filter in `loadedRows` (L321–349) filters by KRA, search, due, employee axes — but **not** by `categoryIds`.
- Server RPC `bulk_review_snapshot` does not return `category_id` on rows, so a client-side filter is not currently possible.

**Fix**
1. **Migration** — extend `public.bulk_review_snapshot` to add `k.category_id` to the selected row JSON. Pure additive — no signature change, no behaviour change for existing callers.
2. **`useBulkReview.ts`** — add `category_id: string | null` to `BulkReviewRow` (the field already exists as optional, just promote/document).
3. **`BulkReviewDashboard.tsx`** — in `loadedRows` add:
   ```ts
   if (categoryIds.length > 0) {
     const catSet = new Set(categoryIds);
     rows = rows.filter(r => r.category_id && catSet.has(r.category_id));
   }
   ```
   Keep the existing single-category server push (it's still a valid scope-tightener for the cap preview).

---

### Issue 2 — No way to see "is this KPI in my (auditor) scope?"

**Context**
- Auditor scope is the union of:
  - `audit_kpi_assignments` (auditor_id = me) — employee-level
  - `audit_kpi_level_assignments` (auditor_id = me) — KPI-level
- The dashboard today returns every active KPI in the chosen org slice, so an auditor cannot tell which of the 2,209 rows actually belong to them.

**Fix — frontend-only, additive**
1. New hook `useMyAuditScope()` in `src/hooks/useBulkReview.ts`:
   - Reads `auth.uid()`, then pages both assignment tables (RLS already lets the auditor read their own rows).
   - Returns `{ employeeIds: Set<string>, kpiIds: Set<string>, total: number }`.
   - `enabled` only when the current effective role is `auditor`.
2. New toggle in `BulkReviewDashboard.tsx` toolbar (next to "Hide fully processed"):
   - Label: **"My audit scope only"**, with a count badge `(N)`.
   - Visible only when `effectiveRole === 'auditor'`.
   - **Default ON for auditors** (matches the user's mental model: "show me what I have to audit").
   - Persists in the existing URL state (`bulkUrlState.ts`) as `mine=1`.
3. Apply inside `loadedRows`:
   ```ts
   if (myScopeOnly && effectiveRole === 'auditor') {
     rows = rows.filter(r =>
       myScope.kpiIds.has(r.kpi_id) || myScope.employeeIds.has(r.employee_id)
     );
   }
   ```
4. Surface a small chip near the row counter: `145 employees · 47 in my scope` so non-toggled use still gives signal.

**Why not server-side**
- Keeps the migration to a single one-line additive change.
- Auditor scope is small (typically <500 mappings) → client filter is O(n) on already-loaded rows; no extra round-trips beyond one cached read.

---

### UI Changes (exactly where)

- `Bulk Review` page toolbar (`/review/bulk`):
  - **Category filter**: unchanged visually; now actually filters on multi-select.
  - **New toggle "My audit scope only"** placed next to *Hide fully processed*, auditor-only, default-on, with `(N)` badge.
  - Row-counter row gains a muted `· N in my scope` suffix when the toggle is off (auditor only).

No changes to grid layout, columns, drawer, sign-off flow, or any other role's view.

---

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None. Read-only. |
| RLS | None. Existing policies on `audit_kpi_assignments` / `audit_kpi_level_assignments` already restrict auditor self-reads. |
| Other roles | None — toggle hidden; category fix applies uniformly. |
| Cap / scope | Category fix may reduce visible rows, never expand them. |
| Rollback | Single migration revertable by re-running prior `CREATE OR REPLACE`. Frontend reversible. |

---

### Tests

1. `src/test/bulkReview/categoryMultiFilter.test.ts` — given rows with 3 distinct `category_id`s, selecting 2 yields only those 2.
2. `src/test/bulkReview/myAuditScopeFilter.test.ts` — toggle on filters rows to union of `kpiIds` and `employeeIds`; toggle off restores all.
3. Extend existing `dueFilter.test.ts` style — no regression.

---

### DOCUMENTATION.md / POLICY.md / Memory

- `DOCUMENTATION.md` — Bulk Review section: document multi-category client filter + new auditor scope toggle.
- `POLICY.md` — clarify: Auditor's *visible scope* in Bulk Review defaults to assigned KPIs (toggle).
- `mem/features/review/` — new entry `bulk-review-auditor-scope-filter.md` capturing the default-on rule and the union semantics.

---

### Out of Scope (explicitly)

- No server-side scope tightening for auditor.
- No changes to assignment management, RLS, or any other role.
- No grid/column changes.
