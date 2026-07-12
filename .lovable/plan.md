## RCA — Employee 200679 (Twinkle Kumar)

Two separate issues are being reported. Both are configuration/role issues, not bugs or "data loss".

### Issue A — "Self annual review & Manager review is removed"

**Facts from DB (cycle `Annual Review - 2025-2026`, `b82a935f-…`):**
- Twinkle's instance `3b172d37-…` is `pending_self`, `enabled_stages = ["self","dept_head","bu_head"]`.
- Cycle `default_enabled_stages = ["self","dept_head","bu_head"]`.
- **All 2,579 instances** in this cycle share the same `enabled_stages` — Manager stage is not enabled for **any** employee.
- Assignment rule matched: *Generic W — (With KRA)*.

**Root cause:** Nothing was "removed" from Twinkle. The cycle itself was configured (during setup) with `default_enabled_stages` that **excludes `manager`**. Every instance was stamped with the cycle default, so the Manager stage doesn't appear in the workflow chain for anyone in FY 2025-26. Self stage is present and active (`pending_self`) — it hasn't been removed.

The screenshot ("Self Review 1, Manager Check 0") is the **monthly PMS** dashboard, not the annual review — its counts are unrelated to the annual review chain.

### Issue B — "He is in HR, he should be able to submit self-review for all employees"

**Facts from DB:**
- Twinkle has role `employee` only.
- Only `102061 – Swastik Kar` currently holds role `hr_pms`.
- The HR-proxy self-review feature (built in the earlier "Sandeep is HR person" work) is gated by the `hr_pms` role.

**Root cause:** Twinkle simply hasn't been granted the `hr_pms` role, so the HR proxy-submit UI/RPC is not available to him. Being a member of the *HR-Human Resources* department is a master-data attribute — it does not automatically grant PMS permissions (by design, per Role Management Policy §RBAC — role assignment is explicit, not department-derived).

---

## Fix Plan (requires approval)

### Part 1 — Grant HR PMS role to Twinkle (Issue B)
Insert `user_roles (user_id = 6ef8b0f0-…, role = 'hr_pms')`.
- Twinkle keeps `employee` role and additionally gains `hr_pms`.
- After grant + re-login, HR PMS menu + proxy self-review submission becomes available for all employees in scope.
- Audit row in `system_audit_logs` recording the grant (actor, target, role, timestamp).

### Part 2 — Decide Manager stage for FY 2025-26 cycle (Issue A)
This is a **policy decision, not a bug fix**. Two options — need user's choice before we touch data:

- **Option A (recommended, no data change):** Leave the cycle as designed. Confirm with HR that FY 2025-26 intentionally runs `Self → Dept Head → BU Head` (no Manager stage). Document in `POLICY.md` §AR-CYCLE-STAGES so this doesn't recur as a "bug" report.
- **Option B (add Manager stage back):**
  1. Update cycle `default_enabled_stages` → `["self","manager","dept_head","bu_head"]`.
  2. For each of the 2,579 in-flight instances, call `set_annual_review_enabled_stages` to inject `"manager"` in the correct position. Only safe for instances still at `pending_self` (or earlier); anything already at `dept_head`/`bu_head`/finalized needs an explicit send-back — HR must approve the list.
  3. Write `AR_ENABLED_STAGES_BACKFILL` audit rows.
  4. Regression test in `src/test/annualReview/` covering stage-chain rebuild + skip-if-past-manager guard.

**Please confirm Option A or Option B before I proceed with Part 2.** Part 1 can be executed immediately on approval.

### Part 3 — Doc + policy sync (mandatory, both parts)
- `POLICY.md` §AR-CYCLE-STAGES: cycle-level `default_enabled_stages` is the single source of truth; per-instance overrides only via `set_annual_review_enabled_stages`.
- `POLICY.md` §AR-HR-PROXY: HR proxy self-review requires explicit `hr_pms` role — HR department membership alone does not grant it.
- `DOCUMENTATION.md` Version History entry.

### Part 4 — Tests
- `src/test/annualReview/hrProxyRoleGrant.test.ts` — assert role check gates the proxy RPC.
- If Option B chosen: `enabledStagesBackfill.test.ts` for the backfill filter (only `pending_self`).

### Not doing
- No schema changes.
- No changes to Twinkle's monthly PMS dashboard (the screenshot's counts are unrelated).
- No blanket role grants to other HR-department members (each must be explicitly approved).
