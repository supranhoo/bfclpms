# Auto-Rollover Recurrence: RCA, Repair, and Prevention Plan

## Assumptions
- The affected run is the scheduled **August 2026 → September 2026** rollover executed on **1 September 2026 at 00:00 UTC**.
- “Already prepared” follows the existing ADR-248 rule: if an employee already has any KPI in the exact target month, the scheduler must not top up that employee, even when the existing set is below 100%. Manual/admin rollover remains the explicit top-up path.
- Production data repair will be limited to rows proven to have been added by this faulty run; existing September rows will not be changed.

## Confirmed RCA
The feature exists, but its protection did not recognize the real scheduler request.

- The scheduler sent `{"triggered_by":"cron"}`.
- `auto-rollover-kpis` treated a request as scheduled only when `triggered_by === "system"`.
- Therefore `isCronRun` was false, so both ADR-248 protections were bypassed:
  1. no `kra_period_issuance` check;
  2. no “target month already contains a KPI” backstop.
- The same mismatch made the job behave like a manual run and write issuance rows with `source = rollover:cron` only after inserting the unwanted KPIs.
- The tests covered only the synthetic value `system`; they did not execute the scheduler’s real `cron` payload.
- The guard’s database reads also discard query errors, so a backend read failure can currently fail open rather than stop a scheduled run.

### Verified impact
- One completed rollover log at `2026-09-01 00:00:24 UTC`: **2,292 KPIs**, **153 employees**, **0 employees skipped as already issued**.
- **30 employees** already had September KPIs before the job, but the job added **347 rows** to them: 343 September rows and 4 later cycle-sibling rows.
- **10 employees already at 100%** received 44 extra September KPIs; examples include Binay Singh (100 → 155), Dippendu Das (100 → 126.5), and V.A.V.S.S. Ganapathi Varma (100 → 124.5).
- Prakash Kumar Sinha had 96% and was raised to 164%.
- The 347 candidate rows have **0 review submissions**, **0 observations**, **0 queries**, and **0 auditor assignments**. They have **99 audit rows**, which must be retained in the repair evidence.

## Five-Why Analysis
1. **Why were additional KPIs rolled over?** The scheduled execution did not enter the issuance/already-prepared skip branch.
2. **Why did it not enter that branch?** The code recognizes only `triggered_by = system`, while the deployed scheduler sends `triggered_by = cron`.
3. **Why did that contract mismatch exist?** Scheduler configuration and edge-function vocabulary were maintained independently instead of sharing one canonical invocation mode.
4. **Why did tests not catch it?** Unit tests mirrored the implementation’s `system` value rather than the deployed scheduler payload and authentication context.
5. **Why did the run still complete after weightage exceeded 100%?** Weightage is currently a post-insert warning, not a scheduled-run safety boundary, and guard-query errors are not fail-closed.

## Risk & Impact Report
- **Data impact:** A corrective delete is required only for the 347 incident rows after archiving full before-images and linked audit evidence. Existing September KPIs, scores, and historical periods remain untouched.
- **Workflow impact:** Scheduled rollover will skip prepared target periods as ADR-248 intended. Manual/admin top-up and `force: true` behavior remain available and explicit.
- **UI/UX impact:** No new page or navigation. Existing rollover results will continue to show skipped employees and weightage warnings.
- **Regression risk:** Medium because frequency rollovers can create sibling months. Mitigation: classify the invocation once, preserve cycle behavior for unprepared employees, and test monthly plus multi-month scenarios with the exact cron payload.
- **Scalability impact:** Existing 50-row batching and pagination remain. Guard reads will be checked for errors and abort the job instead of processing incomplete results.
- **Backup/integrity:** The repair archive is a normal public table and is automatically included by the dynamic backup contract. No backup allowlist will be changed.
- **Rollback:** Code can be reverted independently. Data repair can be reconstructed from archived before-images; no affected row will be deleted unless the preflight dependency counts remain zero for operational records.

## Step-by-Step Plan

### 1. Canonicalize scheduled invocation
- Derive scheduled execution from the validated `X-Cron-Secret` request context, not only a caller-controlled body label.
- Normalize legacy labels `cron` and `system` to one internal mode for compatibility.
- Use that single mode for the feature-toggle check, ADR-248 skip guard, issuance behavior, and audit logging.
- Preserve admin/manual semantics and explicit `force: true` bypass.

**Verification:** Replay the exact deployed body `{"triggered_by":"cron"}` with scheduled-auth context and confirm prepared employees are skipped.

### 2. Make protections fail closed
- Check and surface errors from target-KPI and issuance queries; never treat a failed guard read as an empty result.
- Before insert, calculate the scheduled run’s projected exact-target-month weightage. Abort that employee’s scheduled insert if it would exceed 100%, while returning a structured blocked reason. Manual/admin runs retain the existing warning behavior.
- Keep existing per-KPI deduplication for genuinely unprepared employees and multi-month cycle siblings.

**Verification:** Simulate read failures and projected overweight; assert zero inserts for affected employees and a visible diagnostic in the rollover log/response.

### 3. Add production-parity regression tests and mock data
Cover:
- exact scheduler payload `triggered_by: cron`;
- authenticated cron-header classification;
- legacy `system` compatibility;
- already-issued and target-month-present skips;
- manual top-up and forced rerun behavior;
- monthly, Bi-Monthly, Quarterly, and cross-year sibling creation;
- guard-query failure and projected-overweight fail-closed behavior;
- realistic mock employees at 96%, 100%, partial multi-month, and empty target states.

**Verification:** Run focused rollover tests and confirm all success/failure paths pass.

### 4. Deploy and perform a non-writing production probe
- Deploy the corrected function.
- Invoke a dry run using the scheduled payload for September and verify the 30 prepared employees are classified as skipped, with no writes.
- Confirm the auto-rollover setting remains enabled and only one active monthly scheduler exists.

**Verification:** Compare dry-run skip identities/counts with the database’s pre-existing September set.

### 5. Reversible incident repair
- Add an immutable repair archive/audit table with explicit grants and admin-only RLS. Store the incident run id, original KPI JSON, linked audit JSON, reason, and repair timestamp.
- Generate a dry-run manifest using all of these constraints: employee had a September KPI before 00:00 UTC; candidate KPI was created by the faulty execution window; period is September or a cycle sibling created by that run; no review submission/observation/query/auditor assignment exists.
- Require the manifest to equal the verified baseline (**347 KPI rows; 99 linked audit rows; zero operational dependencies**) before applying.
- Archive first, then delete only those candidate KPI rows in one transaction. Cascaded audit rows are retained in the repair archive.
- Recompute and report each affected employee’s remaining September weightage; do not synthesize, rename, or top up any KPI.

**Verification:** Confirm all 30 employees return exactly to their pre-run KPI count/weightage, candidate count becomes zero, unaffected employees and all pre-existing September rows are unchanged, and the repair archive count matches the manifest.

### 6. Policy, architecture record, and technical documentation
- Add a new ADR documenting the scheduler vocabulary mismatch, authenticated invocation classification, fail-closed guard reads, and reversible September repair.
- Amend `POLICY.md` §KRA-PERIOD-ISSUANCE so scheduled identity comes from validated request context and scheduled runs cannot commit projected weightage above 100%.
- Update `DOCUMENTATION.md` implementation details and Version History with verified impact, tests, deployment, and repair results.

## UI Changes
Not Applicable. Existing skip and warning surfaces remain; this change corrects backend classification and data integrity.

## Implementation Deliverables
- Hardened `auto-rollover-kpis` function.
- Production-parity unit tests and realistic rollover mocks.
- Additive repair archive schema with RLS/grants.
- Dry-run and transactional repair operation.
- New ADR plus synchronized `POLICY.md` and `DOCUMENTATION.md` updates.

## Post-Implementation Notes
- No automatic mutation of legitimate pre-existing September KPI rows.
- No historical score recalculation is needed because the incident rows have no review submissions.
- The next scheduled rollover should be monitored for: prepared employees skipped, no projected-overweight inserts, and no guard-query errors.
