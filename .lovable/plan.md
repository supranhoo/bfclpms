## Goal

Make the Team Reviews dashboard look and behave the same for **all roles** (Admin, HR PMS, Management, Auditor, Manager, Skip-Level Manager) — same 6 tiles, same labels — and add a **diagnostic panel** that explains *why* a manager sees zeros when they do.

No business logic changes to scoring, rosters, or RLS. Visual + diagnostic only.

---

## Risk & Impact Report

- **Data Impact:** None. No schema, RLS, or query change to KPI/score data.
- **Workflow Impact:** None. Tile counts continue to reflect each role's roster scope (a manager still only counts their direct/indirect reports — they just see the same *layout* as admins).
- **UI/UX Consistency:** Improves parity. Removes the current divergence where managers see 5 tiles and admins see 6.
- **Regression Risk:** Low. Changes confined to `EmployeeSelectorGrid.tsx` `viewLevel === 'team'` branch and the `useOrgKpiPeriodCounts` `enabled` gate. Existing tests in `teamReviewsFullAccessTiles.test.ts` remain valid (they test classification, not tile visibility).
- **Mitigation:** Add unit tests for the diagnostic helper; keep the `isFullAccess` classification branch unchanged so tile *numbers* don't shift for any role.

---

## Part 1 — Unified 6-tile layout (Policy-aligned)

### Changes in `src/components/review/EmployeeSelectorGrid.tsx`

1. **Tile #1 label**: change from conditional `'Total Employees' : 'Team Size'` to **always `'Total Employees'**` (matches the attached reference).
2. **Org KPIs tile**: remove the `isFullAccess &&` gate so the 6th tile renders for managers and skip-level managers too. Org KPI counts are organisation-wide for the period — managers seeing them is informational, not a permission leak (the data is already visible via Org KPI Data Entry / reports per existing RLS).
3. **Grid stays `xl:grid-cols-6**` — already correct.

### Changes in `src/hooks/useOrgKpiPeriodCounts.ts`

- Drop the `enabled` parameter requirement at the call site so the query fires for all roles on the Team Reviews tab. Keep the 60s `staleTime` cache so cost is negligible (one lightweight `SELECT status` per period per user-session).

### Policy update (`POLICY.md`)

- New section: **Team Reviews Tile Parity (v2.66.11.11)** — "All reviewer roles see the same 6 tiles on Team Reviews. Tile counts are scoped by each role's roster (direct/indirect for managers, org-wide for full-access). Org KPI tile shows period-wide counts and is informational for all roles."

---

## Part 2 — Zero-state diagnostic for managers

When a non-full-access user (Manager / Skip-Level) loads Team Reviews and **all five status tiles are zero AND `Total Employees === 0**`, render a diagnostic banner *above* the team list explaining the cause.

### New component: `src/components/review/TeamReviewsZeroDiagnostic.tsx`

Inputs (all already available in `EmployeeSelectorGrid`):

- `directCount` — `teamMembers.length`
- `skipCount` — `skipLevelMembers.length`
- `periodKpiCount` — `periodKpis.length`
- `selectedPeriod`, `selectedYear`
- `userId`

Diagnostic decision tree:


| Condition                                             | Message shown                                                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `directCount === 0 && skipCount === 0`                | "No direct or indirect reports are mapped to you for this period. Ask Admin to verify your reporting structure in **User Management**."   |
| `directCount + skipCount > 0 && periodKpiCount === 0` | "You have N reports mapped, but none have KPIs assigned for {Period} {Year}. KRAs may not yet be issued — check **KRA Issuance** report." |
| `periodKpiCount > 0 && stats.totalEmployees === 0`    | "KPIs exist for your reports but none match the active workflow stage filter. Try clearing filters or switching periods."                 |


UI: amber-tinted `Alert` (shadcn) with `Info` icon, tight `text-sm` body, optional **"Refresh roster"** button that re-runs the team query.

### Wiring in `EmployeeSelectorGrid.tsx`

Render `<TeamReviewsZeroDiagnostic />` immediately after `renderStatsCards()` when `viewLevel === 'team' && !isFullAccess && stats.totalEmployees === 0`.

### Tests

New file `src/test/teamReviewsZeroDiagnostic.test.ts`:

- 3 tests covering the three branches of the decision tree
- 1 test confirming the diagnostic does NOT render when `stats.totalEmployees > 0`
- 1 test confirming admins (`isFullAccess === true`) never see it

---

## Files Touched


| File                                                  | Change                                                 |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `src/components/review/EmployeeSelectorGrid.tsx`      | Tile #1 label, ungate Org KPIs tile, render diagnostic |
| `src/hooks/useOrgKpiPeriodCounts.ts`                  | Allow query for all roles on Team Reviews              |
| `src/components/review/TeamReviewsZeroDiagnostic.tsx` | **New** — diagnostic banner                            |
| `src/test/teamReviewsZeroDiagnostic.test.ts`          | **New** — 5 unit tests                                 |
| `POLICY.md`                                           | New section — tile parity v2.66.11.11                  |
| `DOCUMENTATION.md`                                    | Version History entry — v2.66.11.11                    |


---

## Out of Scope (will not change in this plan)

- The `isFullAccess` classification logic in `classify()` — managers still count by roster relationship, admins still count by workflow status. Changing this would alter business meaning, not visual parity.
- HR PMS / Manager Review / Skip Mgr Review dashboards — already on 6-tile parity since v2.66.11.8.
- Org KPI RLS — unchanged.

---

Approve to proceed?