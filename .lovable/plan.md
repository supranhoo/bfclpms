# Fix: Bulk-override value lost for HR PMS + enrich Review Timeline

## Problem (RCA)

1. **`bulk_management_approve` stamps the wrong stage column for non-Management actors.**
   Today the function always sets `management_score = v_final` and never sets `management_achieved_value`. The override value is written only to top-level `achieved_value`. For employees whose workflow chain ends at **HR PMS** (no Management stage shown — confirmed in the Review Journey screenshot), the Management column never renders, so the bulk-override value is invisible.
   Compounding this: today's bulk runs were executed by a user whose natural role is **HR PMS** (admin-bypass enabled). Conceptually those overrides belong on `hr_pms_achieved_value / hr_pms_score`. Our last revert migration correctly restored the original HR PMS values (35.32 / rating 4), so the bulk-override value (16.66 / rating 5) now has no home in the per-stage columns.

2. **Review Timeline rows don't show the "Added Value" or actor's remark line per stage.**
   `KpiTimeline.formatDetails()` only emits `*_score` and `*_remarks`, never the `*_achieved_value` that the reviewer actually typed. The user wants every audit row to read **Added Value · Score · Added by · Remark**.

## Risk & Impact Report

| Dimension | Impact |
|---|---|
| Data | Re-write per-stage columns ONLY for submissions touched by today's bulk overrides (batch_id ∈ today's `bulk_review_batches`). Reads earliest pre-cascade snapshot from `kpi_audit_logs` to preserve any natural HR PMS value if it differed; we overwrite only when the column is currently equal to that snapshot AND a bulk override exists. No top-level `achieved_value` / `final_score` mutation. |
| Workflow | Unchanged (status, kpi_status, row_version logic untouched). |
| UI/UX | (a) HR PMS card shows the bulk override value/rating on affected rows; (b) Timeline rows gain `Added Value: …` and existing remark/score lines. |
| Regression | Low. Function change is additive (derive actor stage; fall back to `management` when ambiguous). Timeline change is read-only formatting. |
| Scalability | Bounded — repair scoped to `batch_id` IN today's batches, one UPDATE per submission. |
| Mitigation | Repair guarded by `WHERE created_at::date = current_date AND stage IN ('management_override')`; audit row `BULK_OVERRIDE_STAGE_RESTAMPED` written for every change so it's reversible. |

## Plan (Step → Verification)

### Step 1 — Function: stamp the actor's own stage column on override
File: new migration `xxxx_bulk_override_actor_stage_stamp.sql`

Inside the `IF p_is_override THEN …` branch of `public.bulk_management_approve`:

1. Resolve actor stage:
   ```text
   v_actor_stage := CASE
     WHEN has_role(v_actor, 'hr_pms')      THEN 'hr_pms'
     WHEN has_role(v_actor, 'auditor')     THEN 'auditor'
     WHEN has_role(v_actor, 'skip_level')  THEN 'skip_level'
     WHEN has_role(v_actor, 'manager')     THEN 'manager'
     ELSE 'management'   -- pure admin/management actor (legacy default)
   END;
   ```
2. Write `<actor_stage>_achieved_value = v_ach_num` and `<actor_stage>_score = v_final` **in addition to** top-level `achieved_value` (still write top-level for Final-score parity). Use dynamic SQL gated by an allow-list to avoid SQL injection.
3. Audit row action becomes `BULK_OVERRIDE_VALUE_APPLIED` with metadata `{actor_stage, ach_value, score}`.
4. `management_score` / `management_remarks` / `kpi_status='locked'` block (lines 262–281) remains unchanged so the existing "Score Changed (Safety Net)" path still fires.

**Verify:** Run an override as an HR PMS-role actor → `hr_pms_achieved_value` and `hr_pms_score` reflect the new value/rating; running as a pure Management actor still writes `management_score` exactly as today (no regression).

### Step 2 — Data repair for today's overrides
Same migration, after the function. Bound strictly to today.

```text
FOR each row in kpi_audit_logs
 WHERE action = 'TOP_LEVEL_VALUE_OVERWRITTEN'
   AND created_at::date = current_date
LOOP
   v_actor_stage := <derived from performed_by's role at execution time>
   UPDATE review_submissions
      SET <actor_stage>_achieved_value = (new_value->>'achieved_value')::numeric,
          <actor_stage>_score          = (new_value->>'recomputed_final_score')::numeric,
          updated_at                   = now()
    WHERE id = (metadata->>'submission_id')::uuid;
   INSERT INTO kpi_audit_logs(action='BULK_OVERRIDE_STAGE_RESTAMPED', …);
END LOOP;
```
Disable / re-enable `check_period_lock_on_submission_update` around it (same pattern as the previous repair).

**Verify:** Re-open the affected KPI → HR PMS card now shows Value 16.66 / Rating 5 (or whatever was overridden), other stages still show their reverted values, Final score still 16.66.

### Step 3 — Timeline UI enrichment
File: `src/components/dashboard/KpiTimeline.tsx`

Extend `formatDetails(log)` to also emit, for any log whose `new_value` is an object:
- `Added Value: <achieved_value | manager_achieved_value | skip_level_achieved_value | hr_pms_achieved_value | auditor_achieved_value | management_achieved_value>` (whichever non-null key exists)
- `Score: <self_score | manager_score | …>` (existing logic kept but de-duplicated via a small helper)
- `Remark: <metadata.batch_reason || new_value.*_remarks || metadata.reason>`
- Performer name ("Added by") already rendered by the existing row chrome — no change.

Add an entry to `actionConfig` for the two new actions:
- `BULK_OVERRIDE_VALUE_APPLIED` → label "Bulk Override (Value)"
- `BULK_OVERRIDE_STAGE_RESTAMPED` → label "Bulk Override Restamped"

**Verify:** Open Review Timeline on an affected KPI → today's override rows read `Added Value: 16.66 · Score: 5 · Remark: Target - 9765 …` with the HR PMS performer name in the existing performer chip.

### Step 4 — Tests + docs
- Unit test (vitest): `bulkOverrideActorStamp.test.ts` — mocks `has_role` and asserts that the correct stage column update is emitted.
- `DOCUMENTATION.md` → "Submission Score Integrity": document actor-stage stamping rule.
- `POLICY.md` → §88.1 add bullet "Override value is mirrored to the actor's own stage column (HR PMS, Auditor, Manager) so per-stage review cards remain accurate."
- Update memory: `mem://features/admin/submission-score-integrity` and `mem://features/review/management-bulk-approval`.

## UI Changes

| Where | Change |
|---|---|
| Review Journey card (HR PMS) | Now reflects the override value on submissions touched by today's bulk |
| Review Timeline rows | Each row gains an "Added Value: …" line plus a "Remark: …" line when present; "Added by" already visible |

No layout/responsiveness changes; existing card and dialog widths preserved.

## Files Touched

- `supabase/migrations/2026053112xxxx_bulk_override_actor_stage_stamp.sql` (new)
- `src/components/dashboard/KpiTimeline.tsx` (formatDetails + actionConfig)
- `src/test/bulkOverrideActorStamp.test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md`, two memory files
- `.lovable/plan.md` auto-updated

## Rollback

- Migration adds an audit row per change → run a follow-up to NULL the stamped `<stage>_achieved_value`/`<stage>_score` where `kpi_audit_logs.action = 'BULK_OVERRIDE_STAGE_RESTAMPED'`.
- Function rollback: re-deploy the prior version captured in `20260531113209_…sql`.
- UI rollback: revert `KpiTimeline.tsx`.
