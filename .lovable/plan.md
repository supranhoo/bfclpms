## Goal
On Bulk Review, when the user picks a month (e.g. May 2026), hide KPI rows whose cycle is not anchored to that month — i.e. multi-month placeholder siblings that cannot be acted on in the selected month. Provide a toggle to unhide them.

## Why
Per `mem://architecture/pms/multimonth-percolation`, multi-month KPIs (Bi-Monthly / Quarterly / Half-Yearly / Yearly) create sibling placeholder rows in every cycle month, but only the **terminal** month is actionable. Today Bulk Review shows all sibling rows as `PENDING`, inflating the matrix and confusing reviewers. POLICY §54 UX Corollary already mandates this filtering pattern on Self-Mode pending banners; Bulk Review needs the same treatment.

Daily KPIs are already excluded by the RPC (`frequency <> 'daily'`), so this only affects Bi-Monthly / Quarterly / Half-Yearly / Yearly.

## Scope
UI + one read-only RPC field addition. No write-path, RLS, or business-logic changes.

## Risk & Impact
- Data Impact: none — read-only filter
- Workflow Impact: none — same rows still exist; just hidden by default in this view
- UI Impact: one new toggle pill in the Bulk Review header strip
- Regression Risk: low. A user could be confused if "their" row disappears — mitigated by default-on toggle with clear label and a badge showing hidden count
- Backup/Rollback: additive RPC column + UI toggle; trivially revertible

## Technical Plan

### 1. RPC — expose `frequency_cycle_start`
Add `k.frequency_cycle_start` to the `SELECT` list of `get_bulk_review_snapshot` (single-line addition in a new migration that `CREATE OR REPLACE`s the function — does not touch `bulk_scope_preview` or any write RPC). Needed because `isKpiLockedForPeriod` requires the cycle start to disambiguate (Jan-Feb vs Feb-Mar Bi-Monthly, etc.) — `mem://features/admin/multi-month-kpi-cycle-ux` forbids silent default fallback.

### 2. Type — `src/hooks/useBulkReview.ts`
Add `frequency_cycle_start: string | null` to `BulkReviewRow`.

### 3. Pure helper — `src/lib/bulkReviewDueFilter.ts` (new)
```ts
isRowDueInPeriod(row, period, year): boolean
```
Wraps `isKpiLockedForPeriod` from `@/lib/frequencyUtils`. Returns `true` when the row is the cycle anchor for `(period, year)`; `false` for non-anchor siblings. Daily / Weekly / Monthly always return `true` (single-month, always due).

### 4. `BulkReviewDashboard.tsx`
- New state `hideNonDue` (default `true`), persisted in localStorage key `bulkReview.hideNonDue`.
- Add to `loadedRows` memo: when `hideNonDue`, filter out rows where `isRowDueInPeriod(r, period, year) === false`.
- Header pill next to existing "Hide fully processed" toggle:
  - Label: "Hide non-due KPIs"
  - Subtitle/badge: `N hidden` (count of rows filtered out by this rule, regardless of other filters)
  - Tooltip: "Hides multi-month KPI rows whose cycle does not end in {Month} {Year}. They will become actionable in their cycle's final month."

### 5. Tests — `src/test/bulkReview/dueFilter.test.ts`
- Bi-Monthly Apr-May row hidden when period=April, visible when period=May
- Quarterly Jan-Mar row hidden Jan/Feb, visible Mar
- Monthly row always visible
- Daily handled (already excluded by RPC, but helper returns true defensively)
- Missing `frequency_cycle_start` for multi-month → log + treat as due (safe default; do not silently hide)

### 6. Docs
- `DOCUMENTATION.md` — Bulk Review section: add "Hide non-due KPIs" toggle entry
- `POLICY.md` §54 UX Corollary — extend to cover Bulk Review parity
- `mem/features/review/bulk-review-non-due-filter.md` (new) + index entry
- `docs/adr/ADR-079.md` — record decision

## Out of Scope
- Changing sibling-creation behaviour (still needed for monthly-score "pending" semantics per existing memory)
- Server-side filtering of non-due rows (kept client-side so admins/auditors can opt-in to see the full matrix)
- Any change to `bulk_scope_preview` cell counts (would mask the underlying placeholder count, which admins still need for diagnostics)

## Verification
1. Load May 2026 scope → Bi-Monthly Apr-May KPIs that anchor on May remain visible; ones anchored on April are hidden; counter shows "N hidden"
2. Toggle off → all rows reappear
3. Switch to April 2026 → the inverse holds
4. Vitest suite passes
