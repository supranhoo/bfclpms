
# Unify "My Dashboard" with Reviewer Dashboard Layout — IMPLEMENTED ✅

## Changes Made

### 1. UnifiedScorecard — Added `'self'` View Level
- **Type**: Added `'self'` to `ScorecardViewLevel` union type
- **Config**: Added self-specific static config (title: "My KPIs", scoreFieldPrefix: "self")
- **Props**: Made `onBack` optional (not needed for self-view)
- **Self-mode guard in config useMemo**: Returns simplified config for self (no reviewer workflow resolution)
- **Self-mode hooks**: Added `useKraCategories`, `useSubPeriodSubmissionsByKpis`, category/pending-period state
- **Profile header**: Conditional — shows `ProfileCard` (no back button) for self, existing reviewer header for others
- **Category filter**: Added inline category dropdown in filter bar (self mode only)
- **Pending period alerts**: Computed from allKpis, rendered before WorkflowProgressTracker
- **Deep-link support**: Auto-open KPI from `autoOpenKpiId` with period auto-switching
- **SelfReviewSheet**: Rendered for self mode; reviewer Sheet guarded with `!isSelfMode`
- **Table callbacks**: `onReview`/`onView` open SelfReviewSheet for self mode, `onSendBack` disabled
- **Score calculation**: Added `'self'` case to `getRelevantScore`
- **viewType mapping**: `'self'` → `'my-kpis'` for KpiDetailsTable
- **OrgKPI map fix**: Both key construction and lookup now use `toLowerCase()` for consistent matching

### 2. Dashboard.tsx — Simplified from ~960 to ~220 lines
- **Removed**: All self-view rendering (charts, inline KPI table, SelfReviewSheet, modals, computed metrics, category metrics, sorting, sub-period fetching)
- **Self-view**: Now delegates entirely to `<UnifiedScorecard viewLevel="self" />` with current user's profile as employee
- **Preserved**: ViewModeToggle, EmployeeSelectorGrid for reviewer modes, deep-link effects (cross-user + self via autoOpenKpiId), MentionedKpiSheet
- **Deep-link simplified**: Self-view kpi deep-link passes raw kpiId as `autoOpenKpiId` to UnifiedScorecard

### 3. KpiDetailsTable — No Changes Needed
- Existing `'my-kpis'` viewType already handles self-review action buttons correctly

## Impact
- **Visual consistency**: Self-view now shares identical layout with reviewer views (1:5 charts, workflow tracker, KpiDetailsTable)
- **Code reduction**: ~750 lines removed from Dashboard.tsx
- **No schema changes, no RLS changes**
- **All reviewer flows unchanged** — only self-mode behavior added to UnifiedScorecard
- **Org KPI key matching**: Fixed case-sensitivity inconsistency across views
