## Goal

In the Review Timeline, a single admin action (e.g. one Bulk HR PMS sign-off) currently renders as 4–5 cards because DB triggers and the reconciler each write their own `kpi_audit_logs` row. We will **group** all rows that belong to the same transaction under one parent card with an expandable "System cascade" section. No DB changes — audit integrity preserved.

## Risk & Impact Report

- **Data Impact:** None. UI-only; `kpi_audit_logs` untouched.
- **Workflow Impact:** None.
- **UI/UX Impact:** Timeline becomes ~1 card per human action instead of 4–5. Cascade detail still accessible via "Show system events (N)" expander.
- **Regression Risk:** Low. The grouping is pure transform on the fetched array; if grouping mis-fires, worst case is rows render exactly as today (fallback = no grouping).
- **Scalability:** O(n) single pass; n ≤ a few hundred rows per KPI.
- **Mitigation:** Unit tests on the grouping helper covering (a) the exact 5-row Bulk HR PMS cascade from this RCA, (b) lone human actions, (c) lone system rows (no parent), (d) multiple distinct cascades in same timeline.

## Plan

### 1. New helper: `src/lib/timelineGrouping.ts` (+ test)

Pure function `groupTimelineEvents(logs: AuditLog[]): GroupedEvent[]` where:

```text
GroupedEvent = { parent: AuditLog; children: AuditLog[] }
```

Grouping rules (applied per transaction bucket — same `performed_by` + `created_at` truncated to the second):

- **System/trigger actions** (children candidates):
  - `SUBMISSION_SCORE_CHANGED` when `metadata.source = 'safety_net_trigger'`
  - `STATUS_TRANSITION` (always — it's a trigger echo of a status write)
  - `RECONCILE_STATUS` (reconciler tool — informative but a side-effect)
- **Parent priority** (first match wins within the bucket):
  1. Any `ADMIN_*` / `BULK_STAGE_SIGNOFF_*` / `BULK_*` / `MANAGEMENT_*` / `MANAGER_*` / `AUDITOR_*` / `SELF_REVIEW_*` / `HR_PMS_*` / `STATUS_CHANGED` (explicit human action)
  2. Otherwise `RECONCILE_STATUS` becomes the parent (so it's still visible when no human row exists in the bucket)
  3. Otherwise the first row in the bucket is the parent (safe fallback)
- Children are sorted in the original DB order; parent keeps its own timestamp.

### 2. `KpiTimeline.tsx` rendering

- Replace `auditLogs.map(...)` with `groupTimelineEvents(auditLogs).map(...)`.
- Parent card renders unchanged.
- If `children.length > 0`, append a small expandable footer inside the parent card:
  - Collapsed: `▸ Show system events (N)` — muted, text-xs.
  - Expanded: vertical stack of child rows (same `formatDetails` + icon/label as today, but rendered smaller and indented; no separate timeline dot).
- Expansion state is local component state (`useState<Set<string>>` keyed by parent id).

### 3. Tests

- `src/lib/timelineGrouping.test.ts`:
  - Reproduces the exact 5-row cascade from this RCA → expects 1 group with parent `BULK_STAGE_SIGNOFF_HR_PMS` and 4 children.
  - A lone `SELF_REVIEW_SUBMITTED` → 1 group, 0 children.
  - Two distinct cascades 5 seconds apart → 2 groups.
  - Orphan `RECONCILE_STATUS` (no human row in bucket) → becomes its own parent, not hidden.

### 4. SSOT updates

- `DOCUMENTATION.md`: new entry under Review Timeline — "v2.66.13.8 — Cascading audit rows grouped under parent human action (UI-only)."
- `POLICY.md`: append note "Audit log preserves every system trigger row for immutability. UI groups same-transaction rows under the originating human action; raw rows remain queryable in DB."
- `mem/architecture/database/kpi-audit-logs-canonical`: add a sentence that any new UI consumer must group via `groupTimelineEvents`.

## Files

- **Create:** `src/lib/timelineGrouping.ts`, `src/lib/timelineGrouping.test.ts`
- **Edit:** `src/components/dashboard/KpiTimeline.tsx`, `DOCUMENTATION.md`, `POLICY.md`, `mem/architecture/database/kpi-audit-logs-canonical`

## Out of scope

- DB-level dedupe of trigger rows.
- Changing the timeline used elsewhere (`OrgKpiHistoryTimeline`, etc.).
- Persisting expand/collapse state across dialog reopens.
