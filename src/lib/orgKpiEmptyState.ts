/**
 * Pure classifier for the Org KPI Data Entry empty state.
 *
 * Centralises the decision tree so the page can show an accurate, actionable
 * message instead of the generic "No org-level KPIs found" card that hid the
 * real cause when the user (admin) actually had data in the backend.
 */
export type OrgKpiEmptyKind =
  | 'loading'              // auth/role/ownership/data still resolving
  | 'masked-admin'         // admin viewing as natural role, owns nothing
  | 'no-backend-rows'      // backend truly has zero org KPIs for this period
  | 'all-frequency-locked' // rows exist but every one is locked for this month
  | 'filtered-out'         // rows exist but UI filters hide them
  | 'ok';                  // groupedKpis has at least one card

export interface OrgKpiEmptyInput {
  isLoading: boolean;
  totalOrgKpis: number;            // backend definitions for the period
  ownershipFilteredCount: number;  // after RLS/ownership filter
  frequencyFilteredCount: number;  // after frequency lock filter
  groupedCount: number;            // after category/search/status/owner filters
  isMaskedAdmin: boolean;          // role==='admin' && !isAdminMode
  hasActiveFilters: boolean;       // category/search/status/owner != defaults
}

export function deriveOrgKpiEmptyState(input: OrgKpiEmptyInput): OrgKpiEmptyKind {
  if (input.isLoading) return 'loading';
  if (input.groupedCount > 0) return 'ok';
  if (input.totalOrgKpis === 0) return 'no-backend-rows';
  if (input.isMaskedAdmin && input.ownershipFilteredCount === 0) return 'masked-admin';
  if (input.frequencyFilteredCount === 0 && input.ownershipFilteredCount > 0) {
    return 'all-frequency-locked';
  }
  if (input.hasActiveFilters) return 'filtered-out';
  // Defensive fallback — rows after frequency filter but groupedCount=0 with no
  // active filters means an unexpected filter chain; treat as filtered-out so
  // the user gets the Clear Filters affordance.
  return 'filtered-out';
}