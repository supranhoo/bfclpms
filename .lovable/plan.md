# Tablet-Friendly Monthly KRA/KPI Dashboard — Plan

Scope: Employee (`Dashboard` / `UnifiedScorecard`), Reviewer (`EmployeeSelectorGrid` + `EmployeeScorecard`), Auditor (`AuditScorecard`), HR PMS / Skip-Level / Management (`ManagementScorecard`). Frontend-only. Desktop (≥1280) layout untouched.

## 1. Risk & Impact Report

- **Data impact:** None. Read paths, RPCs, and mutations remain unchanged.
- **Workflow impact:** None. Same actions, same permissions, same guardrails.
- **UI/UX impact:** New adaptive tier only within `md` (768) → `xl` (1280). Below `md` still uses existing mobile cards; ≥`xl` still uses the current desktop tables.
- **Regression risk:** Medium — touches four large scorecards. Mitigated by (a) gating every change behind a new `useIsTablet()` hook so desktop CSS/DOM is byte-identical when the viewport is ≥1280, (b) reusing existing card sub-components (`MobileKpiCard`, `KpiDetailsTable`, `RatingSelector`, etc.) rather than forking logic, (c) snapshot + interaction tests for tap targets and layout contracts.
- **Scalability:** Server payload unchanged. Client render is lighter on tablet (card list + windowed rows instead of 12-column table).

## 2. Root Problem (why tablets feel broken today)

`useIsMobile()` in `src/hooks/use-mobile.tsx` flips at **768 px**. Everything ≥ 768 renders the desktop scorecard — a 10–14 column table with 28-px score chips, 32-px icon buttons, and a dense filter bar. On a portrait iPad (820) or landscape (1180) this forces horizontal scroll, sub-44-pt taps, and a toolbar that eats ~35 % of viewport height. There is no middle tier.

## 3. Design commitments

Three breakpoints, one behavior each:

```text
< 768 px         Phone     → existing MobileKpiCard / MobileSelfReviewCard
768 – 1279 px    Tablet    → NEW compact/list layout (this plan)
≥ 1280 px        Desktop   → existing table (unchanged)
```

Tablet UX principles applied across all four scorecards:

1. **No horizontal scroll.** Replace multi-column tables with a **2-column responsive grid of `KpiRowCard`s** (portrait: 1 col; landscape: 2 col). Each card shows KPI name, target, current value, weightage badge, score chip, and one-tap action.
2. **44×44 pt minimum tap targets.** All score chips, rating pills, evidence buttons, and filter chips forced to `min-h-11 min-w-11`. Segmented controls replace narrow dropdowns for R1–R5.
3. **Collapsible toolbar.** `ReviewFilters` collapses to a single "Filters (n)" button + inline period selector on tablet; opens as a `Sheet` from the right. Frees ~180 px vertical.
4. **Sticky action bar.** Bulk actions (Save, Send Back, Approve) move to a bottom sticky bar (adapting `SafetyStickyActionBar` pattern) so reviewers never scroll to find them.
5. **Two-pane split (landscape only).** In `EmployeeSelectorGrid` landscape, left rail (320 px) lists employees, right pane loads `EmployeeScorecard` — replaces today's tap-back-tap-forward navigation.
6. **Evidence flow.** Full-screen `Sheet` (not `Dialog`) for evidence upload/preview on tablet; native file picker uses `capture="environment"` hint so field auditors can shoot directly.
7. **Score entry.** Numeric inputs get `inputMode="decimal"`, larger 48-pt height, and a segmented R1–R5 selector below the input for one-tap rating.

## 4. Deliverables

### 4.1 New primitives (`src/components/review/tablet/`)

- `useIsTablet.ts` — mirrors `useIsMobile` shape; true when `768 ≤ vw < 1280`.
- `TabletKpiRowCard.tsx` — compact card: header row (KPI name + category dot + weightage), metric row (target / current / score), action row (44-pt buttons). Accepts a `variant` prop (`self` | `reviewer` | `auditor` | `management`) so all four scorecards reuse it.
- `TabletScoreEntry.tsx` — 48-pt numeric input + R1–R5 segmented control + evidence button; wraps existing `ScoreSelector` / `RatingSelector` logic.
- `TabletFilterSheet.tsx` — wraps existing `ReviewFilters` in a right-side `Sheet`; keeps counted "Filters" trigger button in the toolbar.
- `TabletStickyActionBar.tsx` — port of `SafetyStickyActionBar` with a tablet variant (`forceVisible` on `md`–`lg`).
- `TabletSplitPane.tsx` — landscape-only two-pane layout used by `EmployeeSelectorGrid` and `AuditScorecard`.

### 4.2 Scorecard integrations (behind `useIsTablet` guard)

Each of the four scorecards gets a small conditional branch — desktop DOM stays untouched:

```tsx
if (isMobile) return <MobileKpiCard … />;      // unchanged
if (isTablet) return <TabletKpiRowCard … />;   // NEW branch
// desktop table unchanged
```

Files touched:

1. `src/components/review/UnifiedScorecard.tsx` — swap KPI list rendering, toolbar, and action buttons.
2. `src/components/review/EmployeeSelectorGrid.tsx` — enable `TabletSplitPane` in landscape; card grid in portrait.
3. `src/components/review/EmployeeScorecard.tsx`, `AuditScorecard.tsx`, `ManagementScorecard.tsx` — same conditional pattern; reuse `TabletKpiRowCard` with role-appropriate variant.
4. `src/components/review/ReviewFilters.tsx` — expose a `compact` prop consumed by `TabletFilterSheet`.
5. `src/pages/Dashboard.tsx` — pad bottom for sticky bar (`pb-24 md:pb-28 xl:pb-6`), collapse KPI summary cards into a horizontal scroll strip on tablet.

### 4.3 Design tokens (no new colors)

Reuse existing semantic tokens (`--primary`, `--muted-foreground`, `--destructive`, `--accent`). Only adds spacing/size utility classes; no new CSS variables, no palette changes.

## 5. Verification

- **Regression tests (new):**
  - `src/test/tabletBreakpoint.test.tsx` — asserts `useIsTablet` boundaries (767, 768, 1279, 1280).
  - `src/test/tabletKpiRowCardTapTargets.test.tsx` — every interactive element ≥ 44 pt.
  - `src/test/tabletScorecardConditional.test.tsx` — snapshots that desktop (≥1280) branch remains byte-identical for all four scorecards.
  - `src/test/tabletFilterSheet.test.tsx` — filter count badge, sheet open/close, portrait vs landscape.
- **Manual matrix (documented in ADR):** iPad Mini (768×1024), iPad Air (820×1180), iPad Pro 11" (834×1194 & 1194×834), Surface Go (912×1368). Both orientations. Verify no horizontal scroll, sticky bar visible, evidence upload works.
- **Playwright smoke:** viewport 820×1180 and 1180×820 against `/dashboard`, `/review/team`, `/review/audit`, `/review/management` — screenshot each and confirm the tablet layout renders.

## 6. Documentation & policy

- New `docs/adr/ADR-170.md` — "Tablet-Friendly Monthly KPI Dashboard": records breakpoint contract, primitive inventory, and the four-scorecard integration map.
- `DOCUMENTATION.md` — append v2.67.0 entry linking ADR-170 and listing the new primitives.
- `POLICY.md` — new **§UX-TABLET-BREAKPOINT-CONTRACT**: 768–1279 uses tablet primitives; ≥1280 stays on desktop tables; all interactive elements ≥ 44 pt.
- `mem://design/responsive-ui-strategy` — update to add the tablet tier alongside existing mobile/desktop rules.

## 7. Rollout

Ship in three additive PRs so each is independently revertable:

1. **Primitives + `useIsTablet`** (no scorecard changes) — safe to merge, ships dormant code.
2. **Employee + Reviewer scorecards** (`Dashboard`, `EmployeeSelectorGrid`, `EmployeeScorecard`) — highest-traffic surface first.
3. **Auditor + Management scorecards** (`AuditScorecard`, `ManagementScorecard`) — smaller audience, same primitives.

Each PR is behind the `useIsTablet` conditional, so rollback = revert the PR; no data migration.

## 8. Out of scope (explicit)

- No RPC or schema changes (existing hooks already paginate).
- No new server-side filters or aggregates.
- No changes to score computation, workflow transitions, RLS, notifications, evidence storage, or scoring rules.
- Desktop layout (≥1280 px) is not modified.
- Annual review, Safety, Incentive dashboards — not in this plan.
