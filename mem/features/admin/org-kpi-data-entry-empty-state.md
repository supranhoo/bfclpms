---
name: Org KPI Data Entry empty-state policy
description: /admin/org-kpi-data must classify the empty card via deriveOrgKpiEmptyState, wait for auth+ownership readiness, self-heal stale filters, and show admin diagnostics
type: feature
---
- Page: src/pages/admin/OrgKpiDataEntry.tsx
- Helper: src/lib/orgKpiEmptyState.ts (`deriveOrgKpiEmptyState`)
- Tests: src/test/orgKpiEmptyState.test.ts (7)
- Loading guard: render TableSkeleton until `authLoading || !isReady || kpisLoading || ownershipLoading` all false (ownership loading exposed via `useOrgKpiOwnershipMap().isLoading`).
- Empty kinds: no-backend-rows | masked-admin | all-frequency-locked | filtered-out (never the old generic copy).
- Stale filters: selectedCategoryId and selectedOwnerId auto-reset via useEffect when their target leaves frequencyFilteredKpis/ownership.
- Admin-only diagnostics: backend / ownership / frequency / grouped counts.
- Codified in POLICY.md §98.
