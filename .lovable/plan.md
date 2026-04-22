

## Plan — Resolve Lingering "1 sent back" Badge After Re-Propagation

### What the screenshot actually shows

The badge in the screenshot is **`1 sent back`** (amber, `Undo2` icon), not "Stuck". The card is fully propagated (`32 / 32 entered`, Propagate button enabled). One employee within those 32 still triggers the sent-back marker.

### Root Cause

`useSentBackOrgKpiEmployees` (src/hooks/useSentBackOrgKpiEmployees.ts) flags an employee as "sent back" when **both** are true:

1. Their `kpis` row for this signature has `status = 'kra_set'`, **and**
2. A `kpi_queries` row exists with `query_type = 'send_back'` for that KPI.

When the data owner re-propagates after a send-back:

- The OKV anchor + the per-employee submission get refreshed.
- However, for the one affected employee the `kpis.status` was reverted to `'kra_set'` by the send-back action and **was NOT re-advanced** by the propagation pass — propagation writes the achieved value into `org_kpi_values` and per-employee `review_submissions`, but the per-employee `kpis.status` only advances when the propagate loop's `UPDATE kpis SET status='self_review' WHERE id=… AND status='kra_set'` actually fires for that row. If the row had been stepped back AFTER an earlier propagation already advanced it to `self_review`, the second propagation may see a status it doesn't expect, OR the audit-trail / send-back query never gets cleared even when status does advance.

Net effect: the `kpi_queries` send-back row is **never resolved/cleared** when the propagation re-fixes the data, so the hook keeps returning the row as "sent back" forever — even though the value has been corrected and re-propagated.

This is identical-pattern to **Bucket F** in `docs/audits/org-kpi-data-entry-2026-04.md` (silent propagation skip) plus a **stale `kpi_queries.send_back` row**.

### Fix — Two-Part Resolution

**Part 1: Clear the stale send-back marker on successful re-propagation**

When `propagate_org_kpi_value` (or its React wrapper) advances an employee's KPI past `kra_set`, mark the open `kpi_queries.send_back` row(s) for that KPI as `status='resolved'` AND set `resolved_at = now()`. The hook already filters out queries by `kpi_id` regardless of status, so we additionally need to **tighten the hook's query** to only return send-back rows that are still `status != 'resolved'` OR that post-date the most recent `kpis.status` advance.

Cleanest fix: change `useSentBackOrgKpiEmployees` step 2 query to add `.gt('created_at', <last status advance timestamp>)` — i.e., only show send-back markers raised AFTER the most recent advancement out of `kra_set`. Practically, join against `kpi_audit_logs` for the latest `KPI_PROPAGATED` / `STATUS_ADVANCED` event per KPI and filter `kpi_queries.created_at > that_event.created_at`.

**Part 2: Backfill clear stale markers**

One-shot migration: for every `kpi_queries` row with `query_type='send_back'` whose owning KPI is currently NOT in `kra_set` (i.e., already advanced), set `status='resolved'`. Audit-logged as `STALE_SENDBACK_MARKER_RESOLVED`.

### Files Changed

1. **`src/hooks/useSentBackOrgKpiEmployees.ts`** — add a sub-query (or use a SECURITY DEFINER RPC `get_active_send_back_markers(p_kpi_ids uuid[])`) that returns only send-back rows whose `created_at` is greater than the latest "advance out of kra_set" event in `kpi_audit_logs` for the same KPI. Falls back to current behaviour if no such event exists.

2. **Migration `<ts>_clear_stale_sendback_markers.sql`**:
   - `CREATE OR REPLACE FUNCTION public.get_active_send_back_markers(p_kpi_ids uuid[]) RETURNS TABLE(...)` — SECURITY DEFINER, returns only "still-active" markers.
   - One-shot UPDATE to resolve all currently-stale `kpi_queries.send_back` rows (where the corresponding `kpis.status != 'kra_set'`).
   - Audit row `STALE_SENDBACK_MARKER_RESOLVED` summarising count.
   - Optional trigger `clear_send_back_marker_on_advance` on `kpis` AFTER UPDATE: when `OLD.status = 'kra_set' AND NEW.status <> 'kra_set'`, mark associated open `kpi_queries.send_back` rows as `resolved`.

3. **DOCUMENTATION.md v2.66.7.7** — note under "Send-Back Workflow": send-back markers are now auto-resolved when the KPI advances past `kra_set` (whether by employee re-submit, propagation, or admin step-forward).

4. **POLICY.md §93** — *"A send-back marker (`kpi_queries.query_type='send_back'`) MUST be resolved automatically the moment the underlying KPI advances out of `kra_set`. Stale markers must never persist past status advancement."*

5. **`mem://features/review/send-back-data-preservation`** — append the auto-resolve rule and the new `STALE_SENDBACK_MARKER_RESOLVED` audit action.

### Risk & Impact Report

- **Data Impact**: Backfill mutates `kpi_queries.status` only (sets `resolved` on already-stale markers). No KPI / submission data altered. Audit-logged.
- **Workflow Impact**: Reviewers' "Sent Back" UI cleans up automatically when employees/data-owners fix the issue. No new user-facing actions.
- **UI/UX**: The "1 sent back" amber badge will disappear immediately after the next successful re-propagation or status advance for the affected employee.
- **Regression Risk**: Very low. Hook change is read-only narrowing; trigger only fires on the specific kra_set→other transition; backfill is gated by current status check.
- **Mitigation**: All changes audit-logged; trigger is idempotent (only updates open send-back rows); hook still returns markers if the audit-log lookup fails (graceful fallback).

### Out of Scope

- Re-running propagation for that one employee (deferred — visible Stuck workflow exists separately).
- Reworking `kpi_queries` schema.
- Same auto-resolve for `query_type='query'` (different lifecycle, intentionally manual).

### Deliverables

- Updated `useSentBackOrgKpiEmployees.ts` using audit-log-aware filter (or new RPC).
- Migration adding auto-resolve trigger + one-shot backfill + audit logging.
- DOCUMENTATION.md v2.66.7.7, POLICY.md §93, memory update.

