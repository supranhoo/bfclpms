## Goal
Two fixes on the **Bulk Review** dashboard:

1. **Audit coverage gap notice** is too loud — collapse it to a single ⓘ icon (popover on click/hover).
2. **"My scope only"** currently includes any KPI tied to the auditor via `audit_kpi_assignments` (employee‑level) — even KPIs the auditor is *not* a reviewer of in the active workflow. It must instead show **only KPIs where the current user is the resolved reviewer for the active stage** (Auditor / Manager / Functional Manager / HR PMS / Skip‑Level) for that period.

---

## Risk & Impact

- **Data Impact**: none — read‑only filter logic + 1 new read‑only RPC.
- **Workflow Impact**: none — sign‑off/approve paths untouched.
- **UI Impact**: alert collapses to an icon; My‑scope rows shrink to true reviewer scope.
- **Regression risk**: auditors who currently rely on seeing every KPI of "their" employees will see fewer rows; mitigated by (a) keeping the toggle default ON but documenting the new semantics in tooltip + memory, and (b) toggling OFF still shows the full snapshot.
- **Scalability**: RPC returns a `(kpi_id, employee_id)` pair set bounded by the period’s active workflow (~hundreds–few thousand rows). Indexed lookup, cached 5 min.

---

## Fix 1 — Coverage‑gap as ⓘ icon only

**Where**: `src/pages/review/BulkReviewDashboard.tsx` lines 1042‑1073.

**Change**:
- Remove the full `<Alert>` block above the matrix.
- Render, only when `isAuditor && myScopeOnly && orgKpiCoverageGaps.length > 0`, a single small `<Info>` (lucide) button in the existing header strip right next to the **"X in my scope"** chip.
- Click/hover opens a `Popover` (shadcn) with the existing title + descriptive paragraph + up to‑4 KPI list + "…and N more". Same content, same data source — no logic change.
- A11y: `aria-label="Audit coverage gap details"`, focusable.

**No business‑logic change**. `computeOrgKpiCoverageGaps` and tests stay as‑is.

---

## Fix 2 — Redefine "My scope only" to the active workflow

### Server (new read‑only RPC)
`my_review_scope(p_period text, p_year int, p_stage text)` returns `(kpi_id uuid, employee_id uuid)`:

- Resolves the per‑employee workflow for the given period via the existing `resolve_workflow_for_employee` / `kpi_workflow_assignments` chain already used by Team Reviews.
- Returns the pairs where the **current `auth.uid()`** is the resolved reviewer at `p_stage`:
  - `auditor` → from resolved `auditor_id` (covers both `audit_kpi_assignments` AND `audit_kpi_level_assignments`, intersected with KPIs that have an active workflow for the period — this strips the "random KPIs of my assigned employees that aren't in workflow").
  - `manager` → resolved manager (line manager OR functional manager link).
  - `functional_manager` → resolved FM only.
  - `hr_pms` → resolved HR PMS.
  - `skip_level` → resolved skip‑level.
- `SECURITY DEFINER`, RLS‑safe (only returns rows for `auth.uid()`).
- `GRANT EXECUTE ... TO authenticated`.

### Client
`src/hooks/useBulkReview.ts`:
- Replace `useMyAuditScope` consumer with new **`useMyReviewScope(period, year, viewerStage, enabled)`** returning `{ pairs: Set<\`${kpi}|${emp}\`>, kpiIds: Set<string>, employeeIds: Set<string>, total }`. Keyed by `(stage, period, year)`; staleTime 5 min.
- Keep `useMyAuditScope` exported for backward‑compat (used elsewhere?). New hook is purpose‑built for this toggle.

`src/lib/bulkAuditScopeFilter.ts`:
- Add `isRowInMyReviewScope(row, pairs)` using the exact `${kpi_id}|${employee_id}` pair (no more "employee‑level expands to all KPIs"). Existing `isRowInAuditorScope` kept and marked deprecated.

`src/pages/review/BulkReviewDashboard.tsx`:
- Swap predicate to `isRowInMyReviewScope`.
- Toggle label changes only when viewer stage is non‑auditor: **"My scope only"** stays; tooltip text becomes "Show only KPIs where I am the resolved {Auditor|Manager|HR PMS|Skip‑Level|Functional Manager} for the active period."
- Show the toggle for **all reviewer roles** (auditor / manager / hr_pms / management / skip_level / functional_manager), not auditor only.
- `orgKpiCoverageGaps` now uses the new pair set; semantics still valid (covered = pair in my scope).

### Tests
- New: `src/test/bulkReview/myReviewScopePredicate.test.ts` — pair‑set semantics, no employee‑wide bleed, stage‑specific filtering, regression for the "random KPI" case.
- Update: `auditScopeAndCategoryFilters.test.ts` — mark legacy predicate as deprecated, keep regression case for Sindhu Raj Singh.
- New SQL test fixture in `supabase/migrations/...` covering each stage path.

### Docs / Memory
- `mem/features/review/bulk-review-auditor-scope-filter.md` → rename to **bulk‑review‑my‑scope‑filter.md**; document workflow‑driven semantics + stage matrix.
- New ADR `docs/adr/ADR-080.md` — "Bulk Review My‑Scope = resolved reviewer per stage".
- `DOCUMENTATION.md`, `POLICY.md` — update Bulk Review section.

---

## Step → Verification

1. Add `my_review_scope` RPC migration → run; manual `select * from my_review_scope('May', 2026, 'auditor')` returns expected pairs for a test auditor.
2. Add `useMyReviewScope` + new predicate + tests → `vitest` green.
3. Swap dashboard predicate + show toggle for all reviewer stages → load Bulk Review as auditor; verify Manning Norms no longer shows uncovered employees as "random" and only resolved‑auditor KPIs remain.
4. Collapse coverage Alert → ⓘ Popover → visual check matches mock; popover content identical to old alert.
5. Update memory + ADR + DOCUMENTATION + POLICY.

---

## UI Changes

- **Header strip (right of "90 in my scope" chip)**: new ⓘ icon button when coverage gaps exist. Click → popover with KPI list. Removes the wide amber banner above the matrix.
- **"My scope only" toggle**: visible for all reviewer roles; tooltip updated; behaviour now stage‑aware.

## Rollback
- RPC is additive; drop function + revert client diff.
- UI changes are component‑local.

## Not Applicable
- Hardcoding, pagination, backup coverage (no new tables), offline resilience (read‑only query).
