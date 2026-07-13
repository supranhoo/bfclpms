## Goal

Enforce the finalized policy without deviation: for every Annual Review instance,

- `dept_head_id` = `departments.head_user_id` of the employee's department (org setting).
- `bu_head_id`  = `business_units.head_user_id` of the employee's BU (org setting).

No manager/ancestor fallbacks, no legacy 3-hop BU inference, no peer/self stamping.

## Assumptions

- Org settings screen already lets admin set `departments.head_user_id` and `business_units.head_user_id` per department / BU — this remains the single source of truth.
- Cycles already opened will be resynced in place; historical closed cycles are left as-is unless the user asks otherwise.
- If a department/BU has no head configured, the slot stays `NULL` and the effective-chain resolver marks that stage as `no_reviewer_mapped` (existing behavior). Admin gets a visible warning; we do NOT invent a fallback.

## Deviations found (RCA)

File: `src/services/annualReview/annualReviewService.ts` (seed + reseed paths).

1. **BU fallback path** — `bu_head_id: buResolved.headId ?? buFallback` still stamps a legacy 3-hops-above-employee ancestor when the configured BU head is missing. Violates policy.
2. **Dept fallback path** — `resolveHierarchicalHead(..., fallbackId: mgr)` falls back to the employee's direct manager when the configured dept head is null or the dept head is inactive. Violates policy.
3. `**resolveHierarchicalHead` (`src/lib/annualReview/hierarchyGuard.ts`)** — on `null_configured` / `inactive` / `self`, returns the caller-provided fallback. Under the new policy, dept/BU flows must pass `fallbackId: null` (i.e. leave the slot empty) instead of substituting a manager. Same applies to the second seeder (`seedInstancesForCycle` around line 1245–1262).
4. **Preflight/admin UI** — `AnnualReviewFormMapping` / `BuHeadColumn` should surface departments and BUs with no head configured so admin can fix org settings before seeding.
5. **In-flight instances** — existing rows already carry the wrong `dept_head_id` / `bu_head_id` (RCA history: Uttam→Amit, Ganapathi, Prabhat cases). A one-shot resync must overwrite them from org settings.

## Plan (each step ends with verification)

### Step 1 — Tighten `hierarchyGuard` for annual-review use

- Keep the function pure; callers already control the fallback. Add an explicit `enforceConfigured: true` option that, when set, returns `{ headId: configuredHeadId ?? null, usedFallback: false, reason: 'null_configured' | 'inactive' | 'self' | 'authoritative' }` and NEVER substitutes `fallbackId`.
- Verify: extend `src/test/annualReview/hierarchyGuard.test.ts` to assert null-in → null-out with `enforceConfigured: true`, and that `self` / `inactive` also return null (not the fallback).

### Step 2 — Update both seeders to policy-authoritative mode

- In `seedInstancesForCycleFast` and `seedInstancesForCycle` (annualReviewService.ts):
  - Call `resolveHierarchicalHead(..., enforceConfigured: true, fallbackId: null)` for both dept and BU.
  - Set `dept_head_id = deptResolved.headId` (may be null).
  - Set `bu_head_id  = buResolved.headId`  (drop `?? buFallback`; remove `buFallback` variable).
  - Keep `fallbackEvents` logging so we can audit "missing configured head" instead of silently substituting.
- Verify: update `src/test/orgHeadsSeederIntegration.test.ts` — assert `bu_head_id === null` when BU has no configured head (replaces the current "falls back to 3-hop ancestor" expectation), and add a case that asserts `dept_head_id === null` when the department has no head configured.

### Step 3 — Resync RPC for in-flight cycles

- Add a targeted admin-only RPC `resync_annual_review_org_heads(p_cycle_id uuid)` (migration).
  - Updates `annual_review_instances` for the cycle: `dept_head_id = departments.head_user_id` for the employee's dept; `bu_head_id = business_units.head_user_id` for the dept's BU.
  - Skips instances whose stage has already been actioned by the current dept/BU head (guard: only overwrite when the slot's stage hasn't been submitted yet — status ∈ pre-that-stage). Log skipped rows with reason.
  - Writes an audit row per changed instance to `annual_review_assignment_overrides` (existing table) tagged `source = 'org_head_resync'`.
- Client wrapper: `src/services/annualReview/resyncOrgHeads.ts` (mirrors `resyncDeptHead.ts`).
- Admin surface: add a "Resync Org Heads (Dept + BU)" action button on the cycle admin page (next to the existing dept-head resync), gated by admin/HR role. Confirm-destructive dialog required (rewrites reviewer assignments).
- Verify: unit test the client wrapper (mirrors `resyncDeptHead.test.ts`); integration-style test asserting the RPC updates the two columns and leaves acted stages untouched.

### Step 4 — Preflight validation UI

- On `AnnualReviewFormMapping` seed screen, add a preflight banner listing:
  - Departments with `head_user_id IS NULL` (blocking — cannot seed until fixed OR admin explicitly acknowledges "leave dept_head empty").
  - BUs with `head_user_id IS NULL` (same treatment for bu_head).
- Verify: component test showing banner appears when a demo dept/BU has no head, and disappears once configured.

### Step 5 — Docs, policy, changelog

- `POLICY.md`: add `§AR-ORG-HEAD-AUTHORITATIVE-ONLY` — dept/BU heads come solely from org settings, no manager/ancestor fallback; missing head = empty slot; effective-chain marks stage `no_reviewer_mapped`.
- `DOCUMENTATION.md`: bump version, describe seeder change, resync RPC, preflight UI.
- Cross-link supersedes `§AR-HEAD-MASTER-AUTHORITATIVE` (which allowed peers but still permitted fallbacks).

## Risk & Impact Report

- Data impact: `dept_head_id` / `bu_head_id` will change on in-flight instances after resync. Historical closed cycles untouched.
- Workflow impact: Employees whose dept/BU had no head configured will see the dept/BU stage marked "not mapped" — HR must fix org settings before that stage becomes actionable. Explicit banner + resync report communicates this.
- UI impact: banner on seed screen, new resync button on cycle admin.
- Regression risk: existing tests that expected the 3-hop BU fallback must be rewritten (Step 2). Low risk otherwise — the change narrows behavior, doesn't broaden it.
- Rollback: seeder change is a one-line revert; resync RPC is idempotent and audited; no destructive schema change.

## Open question

Before I execute: should the resync also **overwrite stages that were already actioned** by the old (wrong) reviewer, forcing those stages to be re-reviewed by the correct configured head? Or preserve completed actions and only fix pending stages? My default is **preserve completed, fix pending** — but the phrasing "All the forms should be mapped this way only" could go either way.

&nbsp;

&nbsp;

Here, we should update whatever. If the incorrect mapping has approved it, that should not be the case. Approval should be as per the defined map only. Show me how many cases there are, and based on that, we can take the final decision. 