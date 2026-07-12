## 1. Assumptions
- Correct master values you want enforced for **Admin-Pollution** department in the active Annual Review cycle:
  - **Dept Head** = 101757, Prabhat Kumar Singh
  - **BU Head** (Admin BU) = 101089, Sindhu Raj Singh
- No other department/BU is being changed in this request.

## 2. Clarifications
Not Applicable — values verified against master and reporting chain in DB.

## 3. Deep RCA (verified against DB)

**Master data is already correct:**
- `departments.Admin-Pollution.head_user_id` = 223ba922… → **101757 Prabhat Kumar Singh** ✓
- `business_units.Admin.head_user_id` = 66b76d0c… → **101089 Sindhu Raj Singh** ✓

**Snapshots in the active cycle are wrong:**
- Cycle: Annual Review 2025-2026 (active), 39 Admin-Pollution instances.
- **Dept Head snapshot**: only 3 rows show Prabhat (101757). 36 rows show **Santosh Singh (200508)** — a reporting-chain fallback, not the master.
- **BU Head snapshot**: 36 rows show Sindhu correctly; 3 rows show a fallback.
- 38 of the 39 instances are in safe statuses (`not_started`, `pending_self`, `pending_manager`) — repair is safe for those.

**Root cause — same class as the FAD BU-Head bug reported earlier:**
`resolveHierarchicalHead` (dept-head and bu-head) treats the configured master head as valid *only when it appears in the reviewee's reporting ancestor chain*. When it doesn't (e.g. Prabhat is not a reporting ancestor of the 36 Admin-Pollution employees), the guard returns `reason='not_in_chain'` and stamps the reporting-chain fallback (Santosh Singh) into the instance. Every reseed/resync then re-writes this incorrect fallback, so the wrong value keeps returning.

## 4. Risk & Impact Report
- **Data**: Only `annual_review_instances.dept_head_id` / `bu_head_id` change on the 38 safe rows. No scores, responses, or workflow status touched.
- **Workflow**: Reviewer routing corrected forward; no completed/approved rows modified.
- **RLS/Security**: No policy changes; existing RLS unaffected.
- **Regression risk**: Low — scope is `department = Admin-Pollution`, `cycle = active`, `overall_status IN (not_started, pending_self, pending_manager)`.
- **Rollback**: Snapshot old values into `system_audit_logs` (`action = AR_HEAD_SNAPSHOT_REPAIR`) before update.
- **Scalability**: ≤ 39 rows — trivial.
- **Backup**: No schema change; no backup denylist impact.

## 5. Step-by-step Plan

### Part A — Immediate data repair for Admin-Pollution (active cycle)
1. Insert one `system_audit_logs` row per targeted instance capturing `{ instance_id, old_dept_head_id, old_bu_head_id, new_dept_head_id=223ba922…, new_bu_head_id=66b76d0c…, reason }`.
2. `UPDATE annual_review_instances SET dept_head_id='223ba922-9da1-4491-8dd7-d39daf262982', bu_head_id='66b76d0c-72c0-4588-baa7-718cee76c99b', updated_at=now() WHERE cycle_id=<active> AND employee_id IN (Admin-Pollution employees) AND overall_status IN ('not_started','pending_self','pending_manager') AND (dept_head_id IS DISTINCT FROM '223ba922…' OR bu_head_id IS DISTINCT FROM '66b76d0c…')`.
3. Verify: expect 38 rows corrected; 0 mismatches remaining in safe statuses.

### Part B — Root-cause fix so the values don't drift back
1. Modify `resolveHierarchicalHead` to treat `configured` master head as **authoritative** when it is an active user, regardless of whether it appears in the employee's reporting ancestor chain. Fallback path stays only for: `null_configured`, `self`, inactive user.
2. Keep `peer/not_in_chain` classification as a diagnostic (still logged), but no longer force fallback.
3. Update `seedInstancesByRules` / `buildSeedUpdatePatch` to write these authoritative values on every reseed. This makes reseeds idempotent and stops the recurrence pattern.

### Part C — Regression tests
1. Extend `src/test/annualReview/hierarchyGuard.test.ts`:
   - Configured BU head **not in ancestor chain** but active → `usedFallback=false`, `headId=configured` (new expected behavior).
   - Configured head **inactive** → falls back with reason `inactive`.
2. Add `src/test/annualReview/adminPollutionSnapshotRepair.test.ts` — pure predicate test asserting the repair filter targets only safe statuses and skips already-correct rows.

### Part D — Admin diagnostic (small, optional in same turn)
Add read-only badge on Admin → Progress row: "Snapshot ≠ master (BU/Dept head)" when the instance snapshot diverges from the current master. Uses existing joins; no writes.

### Part E — Docs (SSOT)
- `DOCUMENTATION.md`: authoritative rule — snapshotted `dept_head_id`/`bu_head_id` come from configured masters directly.
- `POLICY.md`: new clause **§AR-HEAD-MASTER-AUTHORITATIVE** — reporting chain is not required to justify a configured head.
- ADR appendix under `docs/adr/ADR-annual-review.md`.

## 6. UI Changes
No visual redesign. Existing Team review detail for the 38 affected employees will now show Prabhat Kumar Singh as Dept Head and Sindhu Raj Singh as BU Head immediately after Part A runs.

## 7. Implementation
- Part A: `insert` tool with the audit `INSERT` + `UPDATE`.
- Part B/C/D/E: code + test + doc edits after Part A commits.

## 8. Tests
- New/updated Vitest cases listed above.
- Post-Part-A SQL verification (0 mismatches).

## 9/10. DOCUMENTATION.md / POLICY.md
- Updates as in Part E.

## 11. Post-implementation notes
- After approval, I will execute in this order: Part A → verify → Part B code/test → Part E docs → optional Part D.

### Approval needed
Confirm to proceed with:
- **(a)** Part A only (fix the 38 rows now, defer root-cause fix), or
- **(b)** Part A + Part B + tests + docs together (recommended — prevents recurrence and closes the same-class FAD BU-Head issue in one shot).