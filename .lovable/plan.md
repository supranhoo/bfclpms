## RCA

Toast: `invalid input value for enum kpi_status: "approved"`.

Confirmed in the live database:

- `public.kpi_status` enum has **only** `open | submitted | approved_by_manager | locked`. There is no `approved` value.
- `public.review_status` enum has `approved` (the terminal stage for `public.kpis.status`).
- `public.kpis.status` is typed `review_status`; `public.review_submissions.kpi_status` is typed `kpi_status`.
- `public.bulk_management_approve(...)` body currently contains:
  - `kpi_status = 'approved'::kpi_status` ← invalid (value not in enum) → THIS is what the user sees.
  - `kpis.status = 'approved'::workflow_stage` and `... <> 'approved'::workflow_stage` ← invalid (type `workflow_stage` does not exist; ADR-059 already established the canonical type is `review_status`).

The previous plan proposed adding `'approved'` to `kpi_status`. That is the wrong fix — it pollutes a stable enum and contradicts the codebase convention where the terminal `kpi_status` written by every approval/lock path (see all `20260313…`, `20260324…`, `20260325…` migrations) is **`'locked'`**. The plan now uses the existing canonical values and changes **only** the RPC.

## Plan

Single migration: `CREATE OR REPLACE FUNCTION public.bulk_management_approve(...)` with two surgical changes inside the existing body — signature, RLS gate, audit-log writes, override/skip logic, return shape all unchanged:

1. Replace `kpi_status = 'approved'::kpi_status` → `kpi_status = 'locked'::public.kpi_status` (canonical terminal value, matches every other final-stage writer).
2. Replace both `'approved'::workflow_stage` casts → `'approved'::public.review_status` (ADR-059 contract; `workflow_stage` does not exist).
3. Update the post-write drift guard at the bottom of the function to compare against the same corrected values (`kpi_status <> 'locked'::public.kpi_status OR k.status <> 'approved'::public.review_status`).

No enum alteration. No data backfill. No schema change. No client-side change.

### Tests / guards

- Extend `src/test/orgKpiPropagateEnumGuard.test.ts` pattern with a new sibling guard `src/test/bulkManagementApproveEnumGuard.test.ts` that scans `supabase/migrations/**` and asserts:
  - No occurrence of `'approved'::kpi_status` or `'approved'::workflow_stage`.
  - The latest `bulk_management_approve` definition contains `'locked'::public.kpi_status` AND `'approved'::public.review_status`.

### Docs / policy

- `docs/adr/ADR-066.md` — new ADR: "Fix `bulk_management_approve` enum casts (`kpi_status`→`locked`, `workflow_stage`→`review_status`)". References ADR-059.
- `DOCUMENTATION.md` Version History entry.
- `POLICY.md` §88.1 footnote: terminal `review_submissions.kpi_status` for Management-approved rows is **`locked`** (already true for every other stage writer; this aligns the bulk path).

## Risk & Impact

| Area | Impact |
|---|---|
| Data | None. Function currently aborts before any write, so no in-flight rows are mid-state. After fix, new writes use the same `'locked' / 'approved'` values the rest of the system already produces. |
| Workflow | Restores Management Bulk Approve + Admin Override Bulk Stamp (broken since ~May 27). |
| RLS / security | Untouched. |
| Regression | Very low — the two changed tokens are local to this RPC; guard test prevents reintroduction. |
| Rollback | Re-deploy previous `CREATE OR REPLACE` body. |

## Files

- `supabase/migrations/<new>_fix_bulk_management_approve_enums.sql` (new)
- `src/test/bulkManagementApproveEnumGuard.test.ts` (new)
- `docs/adr/ADR-066.md` (new)
- `DOCUMENTATION.md`, `POLICY.md` (edited)

Approve to proceed.