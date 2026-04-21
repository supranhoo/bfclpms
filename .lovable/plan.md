

## Plan — Extend Explorer Mode to Management View (v2.65.1)

### Goal
Replicate the auditor Explorer Mode pattern in the Management view so management users can browse all employees org-wide in read-only mode, without disrupting their normal approval workflow.

### What Already Exists (auditor side, v2.65.0)
- "Explore All" toggle pill in `EmployeeSelectorGrid.tsx` (audit branch only)
- Amber "Explorer Mode (Read-Only)" banner
- Auto-applies `cross_check` status filter, hides status dropdown
- Sidebar sub-link "Explore Employees (Read-Only)" → `?view=audit&explore=1`
- `exploreMode` prop drilled into `UnifiedScorecard`, `KpiReviewPanel`, `KpiObservationsSection`
- `isReviewable()` forced false in explore mode → read-only viewer renders
- `EXPLORER_VIEW` audit log entry on each KPI open

### What to Build

#### 1. Extend the toggle to Management view
In `src/components/review/EmployeeSelectorGrid.tsx`, the current Explorer toggle is gated to `viewLevel === 'audit'`. Extend the gate to `viewLevel === 'audit' || viewLevel === 'management'`. Same UI: pill toggle + amber banner + status dropdown hidden.

#### 2. Cross-Check filter for Management
Confirm the `cross_check` status filter already includes management views. If currently audit-only, broaden it to also kick in for `viewLevel === 'management'`. The filter behavior is identical: ignore stage filter, show all active employees with KPIs in the selected period.

#### 3. Read-only enforcement (already in place)
`UnifiedScorecard.isReviewable()` already returns false when `exploreMode=true` — applies regardless of viewLevel. No change needed; management write actions (Approve, Bulk Approve, Forward, Send Back) are gated on `isReviewable()` and will be hidden automatically.

Verify and gate any management-specific affordances:
- Bulk Approve button (in `UnifiedScorecard` / management header) → hide when `exploreMode`
- Final Score input field → hide when `exploreMode`
- Observations: already hidden via `KpiObservationsSection exploreMode`

#### 4. Sidebar discoverability
In `src/components/layout/AppSidebar.tsx`, add a sub-link "Explore Employees (Read-Only)" under the Management menu item, visible to `management` and `admin` roles, pointing to `/dashboard?view=management&explore=1`.

#### 5. URL param wiring
In `src/pages/Dashboard.tsx`, the `?explore=1` reader already exists. Confirm it activates regardless of `view` param value (audit OR management). If currently view-gated, broaden it.

#### 6. Audit log
The `EXPLORER_VIEW` insert in `UnifiedScorecard` already records `viewLevel` in metadata — no change. Management explorer views will be naturally distinguishable via `metadata.viewLevel = 'management'`.

### Files Touched

| File | Change |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Broaden Explorer toggle gate from `viewLevel === 'audit'` to `['audit','management'].includes(viewLevel)`. Update banner copy: "viewing employees outside your assigned scope" → already generic enough. |
| `src/components/review/UnifiedScorecard.tsx` | Audit any management-only action buttons (Bulk Approve, Final Score input) and add `!exploreMode` gates if not already covered by `isReviewable()`. |
| `src/components/layout/AppSidebar.tsx` | Add "Explore Employees (Read-Only)" sub-link under Management menu for `management` + `admin` roles. |
| `src/pages/Dashboard.tsx` | Ensure `?explore=1` works for both `view=audit` and `view=management`. |
| `DOCUMENTATION.md` | v2.65.1 — Extend Explorer Mode to Management view. |
| `mem://features/review/auditor-access-expansion` | Rename concept note to cover both auditor + management; update body to reflect generalized explorer pattern. |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None. All writes already gated by RLS + `isReviewable()`. |
| Workflow | None. Explorer is opt-in; default Management dashboard behavior unchanged. |
| RLS | No changes. Management RLS already restricts writes to KPIs in `management_review` status; explorer browsing of any-status KPIs is read-only. |
| Existing process | Zero interruption. Management bulk approval workflow untouched. |
| Regression | Low. Pure additive UI gate broadening + sidebar link. |
| Test matrix | (a) Management user logs in → sees normal Management panel. (b) Toggles "Explore All" → all 2,533 employees visible, banner shown, status dropdown hidden. (c) Opens any out-of-scope employee → read-only scorecard, no Final Score input, no Bulk Approve button, no Send Back. (d) Toggles OFF → returns to normal Management workflow with approval actions restored. (e) Sidebar link `/dashboard?view=management&explore=1` lands directly in Explorer Mode. (f) Audit log shows `EXPLORER_VIEW` entries with `metadata.viewLevel='management'`. |

### Out of Scope
- Adding Explorer Mode for HR PMS, Manager, or Skip-Level views (separate request if needed).
- Persisting Explorer Mode across sessions.
- Bulk export from Explorer Mode.

