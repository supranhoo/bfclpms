## Root cause

The instance `test003` has:
- `overall_status = 'pending_hr'`
- `enabled_stages = ['self','dept_head','bu_head']`  ← **`hr` is missing**

The admin "Step back" dialog maps `pending_hr → role='hr'` and calls `send_back_annual_review_status(instance, 'hr', reason)`. The RPC's second guard rejects it:

```sql
IF NOT (v_inst.enabled_stages ? p_reviewer_role::text) THEN
  RAISE EXCEPTION 'stage % is not enabled for this instance', p_reviewer_role;
END IF;
```

So the RPC raises, but the client catch block does `err instanceof Error ? err.message : 'Failed to step back'`. Supabase `PostgrestError` is a plain object, not an `Error` instance, so the user only sees the generic fallback and cannot tell why it failed.

DB scan confirms this is not isolated: **1 of 2,653** instances currently has `overall_status` pointing at a stage that isn't in its `enabled_stages` (the row you just tried). Any admin action that keys off `overall_status` will trip on rows like this.

## Risk & impact

- Data: no schema change; one PL/pgSQL function replaced (`send_back_annual_review_status`) and a one-shot repair `UPDATE` for mismatched instances (scoped to the tiny set found above).
- Workflow: step-back becomes tolerant of drift — it always lands on the previous **enabled** stage per `annual_review_effective_chain`, matching what `prevStatus()` already does on the client.
- UI/UX: reason dialog unchanged; only error toast text improves.
- Regression risk: low — RPC still enforces caller-is-active-reviewer / admin, still audit-logs, still clears proxy state on step-back to self.
- Rollback: revert the migration file and the frontend patch.

## Plan

### 1. Frontend — surface the real error (`src/pages/annual-review/AnnualReviewAdmin.tsx`)
Replace the `instanceof Error` fallback in the step-back handler (~L1103) with a helper that unpacks Supabase's PostgrestError shape:

```ts
const msg =
  (err as any)?.message ??
  (err as any)?.error_description ??
  (err as any)?.hint ??
  'Failed to step back';
toast.error(msg);
```

Do the same for the row-level "Step back" trigger and for `rollbackFinalizedInstance` so future RPC failures surface cleanly.

### 2. Backend — tolerant step-back (new migration)
Rewrite `public.send_back_annual_review_status` so it:
1. Derives the *effective current reviewer role* from `overall_status` mapped through `annual_review_effective_chain(instance)`. If `overall_status = 'pending_hr'` but `hr` isn't enabled, treat the last enabled stage in the chain as the current reviewer and step back from there.
2. Keeps the admin/hr_pms override.
3. Keeps the caller-is-active-reviewer guard for non-admins (unchanged semantics — non-admins still can't step back a stage that isn't theirs).
4. Removes the hard `enabled_stages ? role` rejection when called by admin/hr_pms; instead re-anchors to the effective chain.
5. Continues to audit-log the actual `from_stage`/`to_stage` pair used.

### 3. Data reconciliation (same migration, guarded)
For every instance where `overall_status LIKE 'pending_%'` AND that stage isn't in `enabled_stages`, snap `overall_status` to `pending_<last-enabled-role>` and audit-log each correction with reason `'reconcile: overall_status pointed at disabled stage'`. Scope confirmed: 1 row today.

### 4. Tests
- Unit: `src/test/annualReviewStepBackDialog.test.tsx` — mock a rejected mutation returning `{ message: 'stage hr is not enabled' }` and assert the toast shows that message, not the generic fallback.
- SQL: add a pgTAP-style scenario doc under `docs/adr/ADR-106.md` describing the drift case + RPC contract.

### 5. Docs & memory
- Update `docs/specs/annual-review-template-factory.md` §Step-back with the new behaviour.
- Add memory `mem/features/annual-review/stepback-drift-tolerance` capturing the invariant "step-back re-anchors to enabled_stages chain".
- Append version-history entry to `DOCUMENTATION.md`.

## Technical details

Files touched
- `src/pages/annual-review/AnnualReviewAdmin.tsx` — error message unpacking (2 handlers)
- `supabase/migrations/<new>.sql` — replace RPC + one-shot repair
- `src/test/annualReviewStepBackDialog.test.tsx` — regression test
- `docs/adr/ADR-106.md`, `docs/specs/annual-review-template-factory.md`, `mem/features/annual-review/stepback-drift-tolerance`

Approve and I'll implement in one pass (migration first so types regenerate before the frontend patch).
