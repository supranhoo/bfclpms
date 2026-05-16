## Why your gut is right

Tile says **116 reviewed** but only **4 employees** appear under the *Reviewed* filter, with per-card "reviewed" badges summing to **46**. Both numbers are produced by the same component (`EmployeeSelectorGrid.tsx`) reading the same `periodKpis`, so they MUST agree. They don't — that's a real defect, not a copy issue.

### What I verified in the DB (April 2026, no roster filter)

| Bucket | KPIs |
|---|---|
| Total | 2,267 |
| `hr_pms_score` set (signature) | 125 — **all on `status=approved`** |
| Status structurally past HR PMS (`audit`/`mgmt_review`/`approved`) | 239 |
| N/A approvals at-or-past HR PMS | 37 |
| Unique employees with any past-HR-PMS KPI | 27 |

Roster shown on screen is **84 employees / 1090 KPIs** (workflow filter to templates that include `hr_pms_review`). After roster scoping, tile claims 116 reviewed but only 4 employees surface under the filter.

### Two specific suspects (need confirmation, see step 1)

1. **Tile / filter source-of-truth divergence.** Tile (`stat3`, L1063-1106) iterates `relevantKpis = periodKpis.filter(k => memberIds.has(k.employee_id))`. Filter (L799-804) also iterates `periodKpis`, then intersects with `demographicFilteredMembers` at L827. If the `useProfilesByWorkflowStage('hr_pms_review')` roster includes an employee whose **period-resolved** `workflowMap` chain *omits* `hr_pms_review` (templates rotated mid-cycle, or template change after KPI creation), then in the tile counter at L1063-1083 the early signature branch (L1069-1080) increments `reviewed` BEFORE the L1083 `if (hrIdx === -1) return;` guard. Filter at L799-804 does NOT have a parallel signature branch, so it skips that employee silently. Net: tile up, filter down, exact gap = signature-only KPIs on roster employees with no `hr_pms_review` in their resolved chain.

2. **`periodKpis` row-cap (1000 default).** If `useKpisByPeriodRanges` hits the Supabase 1000-row default for April (the period has 2,267 rows DB-wide), the client may receive a different slice for the tile-time render vs the filter-time render due to ordering, OR may consistently miss the same ~1,200 rows but the slice it does receive happens to be skewed toward unreviewed. We need to confirm the hook paginates explicitly.

## Plan

### Step 1 — Diagnostic (no behaviour change, ship + read once, then strip)

Add a single guarded `console.log` block in `EmployeeSelectorGrid.tsx` that runs only when `viewLevel === 'hr_pms'` and `statusFilter === 'reviewed'`. It must print, for the *current* render:

- `tile.reviewed` (=`stat3`) and `tile.totalKpis`.
- `displayedEmployees.length`, plus an array of `{ id, badge3, total }` so we can sum on screen.
- `roster.size` (= `demographicFilteredMembers.length`) and `periodKpis.length`.
- Three reconciliation buckets across `relevantKpis`:
  - `sigOnly` = `hr_pms_score IS NOT NULL` AND status NOT past `hr_pms_review` in resolved chain.
  - `structPast` = status past `hr_pms_review` in resolved chain.
  - `naPast` = `is_na=true` AND past.
- Count of employees in roster whose resolved `workflowMap` chain does not contain `hr_pms_review` (`missingHrInResolved`).

User refreshes once on `/dashboard?view=hr_pms&status=reviewed&period=Apr&year=2026` and pastes the log. That single payload pinpoints which suspect is true.

### Step 2 — Fix exactly one of:

**Fix A (if signature-no-chain is the cause):** Tighten the signature branch in tile counter at L1069-1080 to require resolved chain contains `hr_pms_review` (move the `hrIdx` lookup ABOVE the signature increment). Tile drops to true count; filter and tile reconcile. No data backfill.

**Fix B (if `periodKpis` is row-capped):** Switch `useKpisByPeriodRanges` to ranged paging (1000-row chunks ordered by `id`, looped until short page) per `mem://architecture/database/large-export-pagination-policy`. Both tile and filter now see the full set; numbers reconcile upward (tile may grow; filter will list more employees).

**Fix C (if roster is the divergence — `useProfilesByWorkflowStage` resolves chain differently than `useBulkEmployeeWorkflows`):** Align both to the same canonical resolver `get_bulk_employee_workflows` (`mem://architecture/database/per-employee-workflow-resolution`).

### Step 3 — Regression invariant

Add `src/test/hrPmsReviewedTileVsList.test.ts` that asserts the sum invariant: for the HR PMS branch, **`stat3 = Σ kpiStats(emp).badge3` over the displayed-when-statusFilter='reviewed' members**, given a shared `periodKpis` + `workflowMap` fixture. This is the test we have been missing — the existing `hrPmsReviewedTile.test.ts` only validates classification, not tile↔list parity.

### Step 4 — Doc + policy

- `POLICY.md` §115 — add **"Tile↔List Parity Invariant: any reviewer-stage Reviewed tile MUST equal Σ visible badge3 when the matching status filter is applied."**
- `DOCUMENTATION.md` v2.66.11.16 — RCA (April 2026 116 vs 46) + chosen fix.
- `mem/features/review/hr-pms-reviewed-tile-semantics` — append parity invariant + reference to new test.

### Out of scope

- Backfilling `hr_pms_score` rows for legacy auto-advanced KPIs.
- Other reviewer tiles (Audit Reviewed, Management Reviewed) — same parity test will be cloned in a follow-up once the HR PMS path is proven.

## Risk & impact

- **Data:** read-only; no schema/RLS/migrations.
- **Workflow:** none.
- **UI:** tile and list will agree. Number may go down (Fix A) or up (Fix B/C); whichever happens, it will match the visible cards.
- **Regression:** low. Locked by the new parity test.

## Why I want a diagnostic before patching

The fix path in step 2 is *mutually exclusive* — patching A, B, and C blindly risks double-correcting and overshooting in the opposite direction. One refresh-and-paste from you closes it definitively.
