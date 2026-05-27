# Plan: Management Bulk Approve — Admin Override

## Goal
Give admins the same override control in Management "Bulk Approve" that already exists in stage sign-off: manually stamp `final_score` (derived from a per-row Achieved value) on selected cells, bypassing the §88 cascade, the `already_final` guard, and the `no_completed_stage` guard. Re-stamp APPROVED rows when override is ON.

## UI Changes

**`src/components/review/BulkApproveDialog.tsx`**
- Remove the `isSignoff` half of the `isSignoff && isAdmin` gate around the Override card. New gate: `isAdmin` only.
- Card copy adapts to mode:
  - Signoff: existing copy (unchanged).
  - Approve: title "Override Final score (admin)". Body explains: writes `final_score` + `management_score` from each row's Achieved input, bypasses §88 cascade, re-stamps already-APPROVED rows, audit-logged as `ADMIN_BULK_OVERRIDE_FINAL_STAMP`, notifies employee + manager + HR PMS.
- Pass `isOverride` through to `BulkSignoffPreview` (already wired) so the existing per-row Achieved inputs render in approve mode too when toggle is ON.

**`src/components/review/BulkSignoffPreview.tsx`**
- When `mode === 'approve' && isOverride === true`:
  - Show per-row Achieved override input (same control already rendered in signoff mode).
  - Final column highlight stays; "Resolved" column shows the override-derived score with source badge `override`.
  - Legend gains one line: "Override ON — Final is stamped from your Achieved input, bypassing the §88 cascade."

**`src/lib/carriedScoreResolver.ts`** (logic, not UI, but small)
- Extend `resolveCarriedScore` so when `stage === 'management' && isOverride && achievedOverride != null`, it computes score via the existing KPI rule and returns `{ score, source: 'override' }`. Same pathway sign-off already uses.

**`src/lib/bulkSignoffImpact.ts`**
- No structural change. `resolveWithInputs` already routes through `resolveCarriedScore` when `isOverride` is on.

## Backend Changes

**New migration: `bulk_management_approve(p_cells, p_batch_reason, p_attachment_urls, p_achieved_values jsonb, p_is_override bool)`**
- Drop old 3-arg signature, recreate with two additional optional params (defaults preserve existing callers).
- Server-side admin check: `IF p_is_override AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'override_requires_admin'`.
- When `p_is_override = true`:
  - Skip the `already_final` guard (re-stamp allowed).
  - Skip the `no_completed_stage` guard (override supplies the value).
  - For each cell, read `achieved` from `p_achieved_values->>submission_id`; if missing, skip row with reason `override_value_required`.
  - Compute `v_final` from achieved using the same SQL helper sign-off override uses (`public.score_from_achieved(kpi_id, achieved)` — confirm exact name in current migrations; reuse, do not duplicate).
  - Set `v_source := 'override'`.
  - Capture `old_final := v_cur.final_score` for the audit row.
- When `p_is_override = false`: existing cascade and guards unchanged (full back-compat).
- Stamp block already writes `final_score`, `management_score`, `management_remarks`, `management_evidence_urls`, `kpi_status='approved'`, advances `kpis.status`. With override, also force-overwrite `final_score` (drop the `COALESCE` on `management_score` so admin re-stamp lands).
- Insert into `audit_log` (or whichever immutable audit table the existing `ADMIN_BULK_OVERRIDE_FINAL_UNLOCK` uses — match exact pattern) one row per overridden cell: `action='ADMIN_BULK_OVERRIDE_FINAL_STAMP'`, payload `{old_final, new_final, achieved, source: prior_source, batch_id, reason}`.
- Notification: enqueue per overridden cell to employee + manager + HR PMS, mirroring §88.1 sign-off override notification.

**`src/hooks/useBulkReview.ts`** — `useBulkApprove` mutation passes new args:
```ts
supabase.rpc('bulk_management_approve', {
  p_cells, p_batch_reason, p_attachment_urls,
  p_achieved_values: achievedValues ?? null,
  p_is_override: isOverride ?? false,
})
```

**`src/pages/review/BulkReviewDashboard.tsx`** — `handleBulkApprove` mgmt branch threads `extras.achievedValues` and `extras.isOverride` into the mutation call (currently dropped on the floor for mgmt — only signoff uses them).

## Policy / Docs

**`POLICY.md` §88.1 addendum** — "Admin Override (Management terminal)": parallels the existing sign-off override clause. States it is a §88 immutability exception, gated on `admin` role server-side, audit-logged as `ADMIN_BULK_OVERRIDE_FINAL_STAMP`, and notifies employee/manager/HR PMS on every re-stamp.

**`DOCUMENTATION.md`** — Update Bulk Approve section: dialog now exposes Override card to admins in both signoff and approve modes; document new RPC signature and skip reasons (`override_requires_admin`, `override_value_required`).

## Tests

**Frontend (`src/test/bulkApproveDialogApproveMode.test.tsx`)**
- New cases:
  - Override card hidden for non-admin in approve mode (regression guard).
  - Override card visible for admin in approve mode; toggling it reveals per-row Achieved inputs.
  - Submit payload includes `isOverride: true` + `achievedValues` map when toggled and inputs filled.
  - Submit blocked when override ON but at least one row missing Achieved.

**Backend (SQL test or RPC integration test)**
- Non-admin calling with `p_is_override=true` → `override_requires_admin`.
- Admin override on APPROVED row → re-stamps `final_score`, bumps `row_version`, writes audit row.
- Admin override on `no_completed_stage` row → stamps using achieved-derived score.
- Default call (no override args) → byte-identical behaviour to current production (cascade + guards).

## Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Override drops §88 immutability | Server-side `has_role(admin)` check; immutable audit row per stamp; notification fan-out. |
| Non-admin client tampers with `is_override` flag | Server ignores the flag for non-admins (raises). UI gate is defence-in-depth, not the security boundary. |
| Re-stamping APPROVED rows could surprise downstream consumers | `row_version` bump + audit event + notification fires existing realtime invalidation; same path sign-off override already uses. |
| RPC signature change breaks callers mid-deploy | New params are optional with safe defaults; old 3-arg shape behaviour preserved. |
| Achieved → score derivation differs between signoff and approve | Both call the same `score_from_achieved` helper; covered by the new test cases. |

## Rollback

1. Frontend revert: restore the `isSignoff && isAdmin` gate in `BulkApproveDialog.tsx` and drop the mgmt-branch `achieved_values` / `is_override` wiring in `BulkReviewDashboard.tsx`.
2. Backend revert migration: drop 5-arg `bulk_management_approve`, recreate the prior 3-arg signature from `20260525094723_*.sql` verbatim.
No data migration required — override is additive and audit-logged.

## Out of Scope

- Changing sign-off override behaviour.
- Adding override to non-bulk single-cell management approval.
- Re-opening already-APPROVED rows via a separate workflow (Re-open path remains untouched).
