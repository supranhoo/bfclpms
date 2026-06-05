## RCA — May 2026 phantom "Governance lock active (planning)"

### What the user sees
On the KPI details dialog for Y R V S Murthy → Preventive Maintenance → May 2026, the header shows a red "View Only" badge with tooltip "Governance lock active for this period (planning)" and the sheet renders in Read Only mode. The user assumes May 2026 has been governance-locked.

### What the database actually says (verified just now)
- `review_periods` row for May 2026 (`id = 625cf51a-…`): `is_locked = false`, `current_stage = planning`, no `locked_at`, no `locked_by`.
- `review_period_locks` for that period: **0 rows** (no global / role / department / employee locks).
- RPC `check_review_period_permission(user, 'May', 2026, ...)` evaluated for both the viewing auditor (`Auditor001 / Shekhar Sharad`) and the KPI owner (`200493 / Y R V S Murthy`):
  - `edit_kpi = true`, `edit_scores = true`, `view_only = false`, `submit_self_review = true`.
- Conclusion: **May 2026 is NOT governance-locked.** No admin action created a lock. The DB-side governance contract is intact.

### True root cause (client-side bug)
`src/hooks/useReviewPeriodPermissions.ts` has an inverted fail-open for `view_only`:

```ts
if (error) {
  return { action, allowed: true }; // Fail-open
}
```

`view_only` semantics are inverted (`true = restrictive`). When the RPC errors for *any* of the 7 parallel permission checks — most commonly a transient network blip on iOS Safari, an auth-token refresh race, or a temporarily rate-limited PostgREST response — the catch path returns `allowed: true` for `view_only` too, which is interpreted as "user is view-only". `KpiHeaderSection` then computes `hasRestrictions = view_only || !edit_kpi || !edit_scores → true`, renders the lock badge, and the tooltip pulls `periodStage = 'planning'` from the (successful) `review_periods` fetch — producing the exact text in the screenshot.

This is fully consistent with the device involved (iPhone Safari, same device class as the auditor001 crash RCA in ADR-073) and with there being **zero** real locks in the DB.

### Why it's safe to call this the cause
- The badge text only appears when `hasRestrictions = true`, which requires at least one of `view_only=true`, `edit_kpi=false`, `edit_scores=false`.
- For a non-admin user with no locks and stage ≠ 'closed', the RPC can only return the default value: `false` for `view_only`, `true` for the other six actions. There is no DB state that produces `view_only=true` for May 2026.
- The only remaining way to flip `view_only` to `true` on the client is the inverted catch branch above.

### Pre-implementation Risk Report
- **Data impact:** none. UI-only fix; no schema, no policy, no RPC change.
- **Workflow impact:** none. Governance-locked periods (closed stage, real locks) continue to restrict correctly because the DB RPC is unchanged.
- **UI/UX impact:** when the RPC succeeds, behaviour is identical to today. When the RPC errors, the user is no longer falsely told the period is locked; instead the UI fails-open to "permissive" (matching the documented intent of the existing fail-open).
- **Regression risk:** minimal — single hook, single branch, plus a matching `?? false` defaulting in the success path. Covered by new unit tests.
- **Scalability:** unaffected.
- **Rollback:** trivial — revert the single hook diff. No migration.

### Plan (surgical, UI/hook only)

1. **Fix the inverted fail-open** in `src/hooks/useReviewPeriodPermissions.ts`:
   - In the per-action `catch`/`error` branch, return `allowed = (action === 'view_only') ? false : true` so a failed `view_only` check defaults to *not* restrictive, matching the documented "Fail-open" intent.
   - Defensive: in the success path, when `data` is not a strict boolean (null/undefined from a partial PostgREST error), apply the same default rather than coercing to `true`.
   - Verification: hook unit test with mocked RPC errors asserts `view_only=false`, others `true`, and `hasRestrictions` consumers see no phantom lock.

2. **Add a tiny diagnostic breadcrumb** (no behaviour change) so the next iOS event is observable:
   - Reuse the existing `reportClientError` / `lastRpc` sink from ADR-073: log a single `console.warn` already exists; additionally call `recordLastRpc('check_review_period_permission', 'error')` so the iPhone telemetry pipeline captures the failing call alongside the route. Zero new tables, zero new endpoints.

3. **Regression tests** in `src/test/useReviewPeriodPermissions.test.tsx` (new):
   - All actions succeed → permissions match RPC.
   - `view_only` RPC errors → returned `view_only=false`, others remain `true`.
   - Any non-`view_only` action errors → returned `true`.
   - `periodData` fetch fails → `periodStage=null`, no crash.

4. **Manual verification on preview**:
   - Open the same May 2026 KPI as Auditor001: expect no "View Only" badge, no "Governance lock active" tooltip.
   - Throttle network in DevTools to force RPC failures and confirm no phantom lock appears.
   - Confirm a *real* locked period (e.g. any period with `current_stage='closed'` for a non-admin) still shows the lock — proves we did not weaken governance.

5. **SSOT updates**:
   - `DOCUMENTATION.md`: add a one-line note under the governance-permissions hook describing the corrected fail-open semantics.
   - `POLICY.md`: clarify "fail-open" means *permissive* across all 7 actions, including the inverted `view_only`.
   - New `docs/adr/ADR-074.md`: capture this RCA + fix.

### Standing Menu CAPA checklist (re-asserted)
- Admin sidebar not empty: unchanged (no menu code touched).
- Auditor pages do not crash: improved (this fix removes a false-restriction path on iOS).
- Legacy baseline access remains available: unchanged.
- `menu_overrides_enabled=false` kill switch: unchanged.

### Files to change
- edit  `src/hooks/useReviewPeriodPermissions.ts`
- new   `src/test/useReviewPeriodPermissions.test.tsx`
- new   `docs/adr/ADR-074.md`
- edit  `DOCUMENTATION.md`
- edit  `POLICY.md`

### Files explicitly NOT touched
- DB: `review_periods`, `review_period_locks`, `check_review_period_permission` RPC, any RLS, any trigger.
- `KpiHeaderSection.tsx`, `SelfReviewSheet.tsx`, Dashboard, Menu Setting, Custom Tabs, scoring/enforcement, role grants.

Approve and I will implement steps 1–5 in a single pass.
