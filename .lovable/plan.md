

## Plan — Execute Phase A1 & A2 Repair Passes

Phases A1 (Bucket B/C historical repair) and A2 (Bucket F propagation-failure repair) ship as **admin-driven UI actions**, not background scripts. The migrations and edge function modes are already deployed. What's left is for an admin to actually click through the scan → preview → confirm → repair flow in the Data Repair tab so the historical orphans get cleared.

Since I'm in read-only mode, I can't click those buttons for you. But I can drive the same RPCs/edge function modes directly from the database side once you switch me to default mode, audit-log everything the same way the UI would, and report back the row counts.

### What will run

**A1 — Bucket B + Bucket C historical repair**
- Bucket B: `kpis.is_org_level=true, status='kra_set'` where the matching OKV is `propagated`/`approved` (orphaned children — propagation silently skipped them).
- Bucket C: `kpis.is_org_level=true, status='kra_set'` where the matching OKV is `draft` but `achieved_value` exists (DO entered a value but never clicked Propagate, then KPI was reset).
- Tool: existing `repair-orphaned-propagations` edge function in `scan` + `repair` modes.
- Output: row counts per bucket, per-employee breakdown, audit log entries (`PROPAGATION_BACKFILL` action, `performed_by = NULL`, tool = `bucket_bc_repair`).

**A2 — Bucket F propagation-failure repair**
- Detection: OKVs marked `propagated`/`approved` where 100% of matching `kpis` are still `kra_set` (the propagation row update silently failed for the entire batch).
- Tool: `repair-orphaned-propagations` edge function in `scan_propagation_failures` + `repair_propagation_failures` modes.
- Action: resets affected OKVs back to `draft`, clears `propagated_at`, audit-logs `PROPAGATION_FAILURE_RESET`.
- Output: list of reset OKVs (kpi_name + period + employee/dept scope), so admin can re-propagate them through the new atomic RPC (A3).

### Execution sequence (in default mode)

1. Run `cloud_status` to confirm the backend is `ACTIVE_HEALTHY` before any writes.
2. Snapshot pre-state counts (Bucket B/C/F sizes) via `read_query`.
3. Invoke the edge function for **A1 scan** → present preview counts.
4. Invoke **A1 repair** → log results.
5. Invoke **A2 scan_propagation_failures** → present preview.
6. Invoke **A2 repair_propagation_failures** → log results.
7. Snapshot post-state counts and diff against pre-state.
8. Append a "Phase A1+A2 Execution Report" entry to `DOCUMENTATION.md` change log with exact row counts, timestamp, and any anomalies.
9. Note any OKVs that A2 reset to `draft` so you can decide whether to re-propagate them now (using the new atomic RPC from A3) or hand them to the relevant Data Owner.

### Risk & Impact

- **Data Impact**: Both passes are repair-only. A1 advances orphaned `kra_set` rows into `self_review` with pre-filled scores from the OKV (matches what propagation should have done). A2 *reverts* OKV status from `propagated` → `draft` (the propagation didn't actually happen, so this corrects the lie). All changes audit-logged with `performed_by = NULL`.
- **Workflow Impact**: A1 makes employees see new self-reviews waiting (one-time backfill). A2 makes Data Owners see KPIs back in `draft` needing a re-propagate click — expected and intended.
- **Reversibility**: Every row touched is audit-logged with the prior state. The existing "Step Back" admin tool can reverse individual rows if any false positive is found.
- **Regression Risk**: Low — same code paths the UI uses, just driven server-side. No schema change.
- **Mitigation**: Dry-run scan first, present counts, only run repair after I show you the preview numbers. If anything looks wrong, abort before the write step.

### Deliverables on completion

- Row-count delta report (Buckets B/C/F before vs after).
- List of OKVs reset by A2 (so you know which ones need re-propagation).
- Audit log entry IDs for traceability.
- DOCUMENTATION.md change log entry.

### What this loop will NOT do

- Not touching A3/A4/B1/B2 — those are already shipped.
- Not auto-re-propagating A2's reset OKVs. After A2 you tell me which ones (or all) to push through the new atomic RPC, and that's a follow-up loop.

