## Goal
Close out all remaining gaps in the Annual Review module (items A–E from the audit) so it reaches production parity with the rest of the PMS modules.

## Assumptions
- "Complete" = ship A through E from the prior audit. F (something else) is not in scope.
- Existing schema, RLS, RPCs, and routes stay intact; this is additive only.
- No new business policy — we are formalizing what already exists and hardening operations.

## Risk & Impact Report
- **Data Impact:** Additive only — one new column (`annual_review_cycles.reopened_at`, `reopened_by`, `reopened_reason`) plus an `annual_review_assignment_overrides` table for mid-cycle reassignment. No destructive changes. Existing rows untouched.
- **Workflow Impact:** Reopen is HR-only and audit-logged; reassignment writes an override row that the resolver consults before falling back to the rule engine. No change to the happy path.
- **UI/UX Impact:** Admin Progress tab gains pagination controls (page size, page nav). New "Reopen" action on closed cycles (confirm dialog). New "Reassign reviewer" row action on instance drawer. New `/reports/annual-review` page mirroring existing report styling. Team page swaps `window.matchMedia` for `useIsMobile()` — no visual change.
- **Regression Risk:** Medium on the Progress tab (query shape changes). Low elsewhere (additive).
- **Mitigation:** Server-side pagination behind a typed service method with unit tests; reopen/reassign gated by `has_role('hr_pms'|'admin')` and confirmed via `ConfirmDestructiveDialog`; resolver override path covered by tests; feature flag already gates the module.
- **Scalability:** Progress tab moves from O(org) memory to O(page_size). Report page uses the same paginated service. Override table is small (1 row per exception).

## Step-by-step Plan

### A. Server-side pagination on Admin Progress tab
1. Add `listInstancesPaginated({ cycleId, page, pageSize, search, status, sort })` to `annualReviewService.ts` using `.range()` + `count: 'exact'`.
2. New hook `useAnnualReviewInstancesPaginated` (TanStack Query, `keepPreviousData`, `staleTime: 30s`).
3. Refactor Progress tab in `AnnualReviewAdmin.tsx` to consume the hook + a shared `<DataTablePagination />` (reuse existing one if present, else local).
4. Tests: service returns correct slice; hook caches per page key.

### B. Documentation
1. Create `src/modules/annual-review/DOCUMENTATION.md` — schema, RPCs, routes, hooks, components, edge function.
2. Create `src/modules/annual-review/POLICY.md` — eligibility, scoring, send-back, finalization, reopen, reassignment, acknowledgment/rebuttal.
3. Create `docs/adr/ADR-annual-review.md` — decisions: separate instance table, role-scoped RLS, edge-function reminders, template versioning via clone.
4. Add Version History entry to each.

### C. Component / integration tests
1. `EmployeeResultsView.test.tsx` — renders scores, acknowledge flow, rebuttal submit.
2. `ManagerCalibration.test.tsx` — distribution math, delta highlighting.
3. `HrFinalizationSheet.test.tsx` — single + bulk finalize, override rating.
4. `useAnnualReview.test.ts` — autosave debounce, send-back state.
5. Service-layer tests for clone RPCs (mock Supabase client).

### D. Standalone Annual Review report page
1. New route `/reports/annual-review` (lazy-loaded), registered with existing report registry pattern.
2. Filters: cycle, BU, department, status, rating band.
3. Columns mirror admin grid; export via the existing xlsx dynamic-import pattern.
4. RLS-aware — reuses paginated service from step A.

### E. Reopen + mid-cycle reassignment
1. Migration: add `reopened_at`, `reopened_by`, `reopened_reason` to `annual_review_cycles`; create `annual_review_assignment_overrides (instance_id, role, new_reviewer_id, reason, created_by, created_at)` with GRANTs + RLS + audit trigger.
2. RPCs: `reopen_annual_review_cycle(cycle_id, reason)` (HR/admin only, writes audit, flips `status` back to `active`, unlocks trigger); `reassign_annual_review_reviewer(instance_id, role, new_reviewer_id, reason)`.
3. Resolver update: `getEffectiveReviewer(instance, role)` checks overrides table first, then falls back to rule engine.
4. UI: "Reopen cycle" button on Cycles tab (closed only) + confirm dialog; "Reassign" action in HR finalization sheet's reviewer row.
5. Tests: reopen restores write access; override takes precedence; non-HR cannot invoke either RPC.

### Cleanup
- Swap `window.matchMedia` in `TeamAnnualReview.tsx` for `useIsMobile()`.
- Update `mem://index.md` with one-liner pointing to a new `mem://features/annual-review/operations` memory documenting reopen + override precedence rules.

## UI Changes (summary)
- **Admin → Progress tab:** pagination bar at bottom (page size selector + prev/next + total count). Table itself unchanged.
- **Admin → Cycles tab:** new "Reopen" button on rows where `status='closed'`. Opens `ConfirmDestructiveDialog` requiring a reason.
- **HR Finalization sheet:** each reviewer row gets a small "Reassign" link → modal with user picker + reason.
- **New page** `/reports/annual-review` — standard report layout (filters left, table right, export top-right).
- **Sidebar:** add "Annual Review" entry under Reports section, gated by same feature flag.

## Tests
Vitest suites listed in step C, plus migration smoke test for the new table + RPCs.

## Documentation / Policy
DOCUMENTATION.md, POLICY.md, ADR all created in step B and amended after E lands.

## Post-implementation notes
- Reopen is intentionally manual and audited — no auto-reopen.
- Overrides are per-instance, not per-cycle, to avoid surprising other employees.
- Pagination default: 25 rows, max 100.
