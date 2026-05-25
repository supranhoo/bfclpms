## 1. Assumptions

- You want **HR PMS bulk sign-off with Admin Override** to treat the selected April 2026 cells as a corrective terminal action.
- For employees whose workflow terminal stage is **HR PMS**, the operation must end in **Approved** even if their current status is still earlier, such as `self_review`.
- Already-approved rows must remain approved, but their locked `final_score` may be re-stamped with a full audit log.

## 2. Clarifications

Not Applicable — the reported case is specific enough and the live data confirms the failure mode.

## 3. Actual RCA / Why-Why Analysis

### Current live result for the reported April 2026 batch

Latest HR PMS override batch checked:

- Batch processed: **4 cells**
- Skipped: **0**
- Override: **true**
- Re-stamped approved rows: **2**
- Workflow advanced count: **0**

Current database state for the selected Cost Control KPI after processing:

| Employee | Before expectation | Actual now | HR PMS score | Final score |
|---|---:|---:|---:|---:|
| Deepak Ranjan | Already approved | `approved` | 0 | 0 |
| Sourav Kumar Jaiswal | Already approved | `approved` | 0 | 0 |
| Ankit Kumar | `self_review` should become approved | still `self_review` | 0 | NULL |
| Rahul Kumar Prasad | `self_review` should become approved | still `self_review` | 0 | NULL |

### Why 1 — Why did the toast say “No status change”?

Because the backend returned:

- `applied = 4`
- `advanced = 0`
- `relocked = 2`
- `skipped = 0`

So the frontend truthfully reported that values were written, but workflow status did not advance for the two self-review rows.

### Why 2 — Why were values written but status not advanced?

`bulk_write_stage_scores` successfully wrote `hr_pms_score = 0` for all 4 selected rows, including Ankit and Rahul.

But status advancement is delegated to `reconcile_workflow_statuses`, and that reconciler currently refuses to fast-forward a KPI from `self_review` when the workflow still contains intermediate reviewer stages like Manager and Skip-Level.

### Why 3 — Why did the reconciler refuse to fast-forward?

The reconciler has a sequential-workflow guard:

- If the KPI is at `self_review`
- And future reviewer stages still exist
- It exits early before checking the newly written terminal HR PMS score

This protects normal review order, but it conflicts with the new Admin Override requirement.

### Why 4 — Why did the already-approved rows work?

Already-approved rows use a separate Admin Override re-stamp path. That path bypasses final-score immutability, updates `final_score`, and logs `ADMIN_BULK_OVERRIDE_FINAL_UNLOCK`.

That part is working.

### Why 5 — Why did Ankit and Rahul not become approved?

Because the override implementation only handled the **locked approved row** case. It did not add a matching **terminal-stage force-approve** path for rows that are not yet approved but are being corrected by Admin Override at their terminal stage.

## 4. Risk & Impact Report

### Data Impact

- Requires a backend function migration only.
- No new table is required.
- No destructive schema change.
- Existing scores remain intact unless Admin Override is explicitly used.
- For override terminal rows, the change will set:
  - `kpis.status = 'approved'`
  - `review_submissions.final_score = <acted terminal stage score>`
  - `review_submissions.final_rating = <acted terminal stage rating>`

### Workflow Impact

- Normal non-override workflow remains sequential.
- Admin Override gains a controlled exception:
  - If acted stage equals the employee’s terminal workflow stage, approve directly.
  - If acted stage is non-terminal, only write the stage column and do not approve.

### UI/UX Impact

- No major layout change.
- Toast wording should distinguish:
  - rows newly force-approved by terminal override
  - already-approved rows re-stamped
  - non-terminal column-only writes
- The screenshot case should become: **Process complete — 4/4**.

### Regression Risk

Medium, because workflow status and final-score immutability are sensitive.

Primary risk is accidentally allowing non-admin users or non-terminal stages to bypass workflow sequence.

### Scalability Impact

Low.

The operation already processes selected cells only. The added logic is per selected row and uses existing workflow lookup. No full-table scan should be introduced.

### Mitigation Plan

- Gate direct approval behind **Admin + Override + acted stage equals terminal stage**.
- Keep non-admin and normal reviewer paths unchanged.
- Add SQL contract tests and frontend summary tests.
- Add documentation and policy alignment in the same change.

## 5. Step-by-step Plan

### Phase 1 — Backend correction: terminal override approval

Update `public.bulk_write_stage_scores` so that after writing the acted stage score:

1. Resolve the employee workflow for that KPI.
2. Determine terminal stage excluding `approved`.
3. If all conditions are true:
   - user is Admin
   - `p_is_override = true`
   - acted stage equals terminal stage
   - KPI is not already approved
4. Then directly approve the KPI:
   - set `kpis.status = 'approved'`
   - set `final_score = v_score`
   - set `final_rating = v_new_rating`
   - insert audit log, e.g. `ADMIN_BULK_OVERRIDE_FORCE_APPROVE`
   - increment a new counter such as `override_approved`
5. Keep already-approved re-stamp path as-is.
6. Keep non-terminal override path as column-only.

Expected result for the reported case:

```text
Deepak   approved -> approved, final re-stamped
Sourav   approved -> approved, final re-stamped
Ankit    self_review -> approved, final stamped
Rahul    self_review -> approved, final stamped
```

### Phase 2 — Reconcile safety alignment

Do not globally weaken `reconcile_workflow_statuses` yet.

Reason: changing the reconciler broadly could unintentionally fast-forward normal workflows. The safer fix is to keep the exception inside `bulk_write_stage_scores`, where we know the action is Admin Override and where we have the acted stage.

### Phase 3 — Frontend result reporting

Update `summariseStageWriteOutcome` to support the new `overrideApproved` counter.

Target toast for this case:

```text
Process complete — 4/4 (2 approved by override, 2 re-stamped)
```

If any non-terminal approved rows are selected, keep them clearly reported as column-only.

### Phase 4 — Policy alignment

Update `POLICY.md` under the Admin Override / Bulk Sign-off sections:

- Admin Override may bypass workflow sequence only when the acted stage is the employee’s terminal configured stage.
- The bypass is per-row, per-batch, audit-logged, and admin-only.
- Non-terminal override cannot approve or alter `final_score`.
- Already-approved rows may be re-stamped only through the final-score override audit path.

This aligns with current §88 final-score governance and §111.7 bulk sign-off rules.

### Phase 5 — Documentation alignment

Update `DOCUMENTATION.md` version history with the RCA:

- Symptom: 4 written, 0 skipped, but 2 remained `self_review`.
- Root cause: sequential reconciler guard exited before checking terminal HR PMS override score.
- Fix: terminal-stage Admin Override direct approval path.
- Impact: no schema/RLS/backup change; audit trail extended.

## 6. UI Changes

Minimal.

- Location: Bulk Review toast after sign-off.
- Visual change: success message becomes explicit when override fully processes rows.
- Interaction impact: no new click path; same Admin Override toggle and Sign-off button.
- Responsiveness: Not Applicable — no layout restructuring.

## 7. Implementation

Planned files:

- New database migration replacing `bulk_write_stage_scores`
- `src/lib/summariseSkipReasons.ts`
- `src/lib/summariseSkipReasons.test.ts`
- `src/test/bulkWriteStageScoresContract.test.ts`
- `POLICY.md`
- `DOCUMENTATION.md`

No direct data patch is planned unless needed after the function is corrected. The same bulk action can be re-run safely, or we can plan a controlled one-time repair only if you explicitly want that.

## 8. Tests

Add/update tests for:

1. Admin terminal override on non-approved row returns `override_approved`.
2. Admin terminal override writes `final_score` and sets status approved.
3. Admin override on already-approved row returns `relocked` and logs final re-stamp.
4. Admin override on non-terminal stage does not approve.
5. Non-admin cannot trigger override approval.
6. Toast summary shows full completion when `advanced + overrideApproved + relocked = total`.

## 9. DOCUMENTATION.md updates

Required.

Add a new version-history RCA entry describing this exact failure and the corrected terminal override behavior.

## 10. POLICY.md updates

Required.

Add or amend the Admin Override policy so the implementation is formally allowed and bounded:

- Admin-only
- Explicit override only
- Terminal stage only for approval
- Full immutable audit trail
- Non-terminal remains column-only

## 11. Post-implementation notes

After implementation, I will verify with read-only database checks that the same April 2026 scenario would produce:

- Deepak: approved + final re-stamped
- Sourav: approved + final re-stamped
- Ankit: approved + final stamped
- Rahul: approved + final stamped

Rollback strategy: revert the migration via project history if needed; the change is additive in behavior and does not drop data.