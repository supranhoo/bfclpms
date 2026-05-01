
# Phase 2: Activate the KPI Standardization Registry

Phase 1 built the registry tables, alias mapping, and admin tool. Phase 2 makes the registry actually do work across the app — linking trends, guiding new entries, and giving admins visibility into coverage.

Executed in three sequenced sub-phases. Each sub-phase is independently shippable and testable.

---

## Sub-Phase 2a — Cross-Month Dashboard Linking

**Goal:** Old variants and new canonical entries appear as ONE continuous KPI in trend views, without changing how individual months render.

### What changes
- Trend charts (Dashboard, MyKpis, Profile, Performance Report, Monthly Scorecard Trend) group by `kpi_definitions.id` when available, falling back to raw signature when no registry match exists.
- Monthly grids (April page, May page, etc.) keep showing their own original text — no visual change on per-month views.
- KPI Journey, KPI Employee Matrix, Variance Report group history correctly across renamed periods.

### Technical details
- New hook `useCanonicalResolver()` — wraps `resolve_canonical_kpi(category_id, kra_name, kpi_name)` RPC, batched + cached per session.
- New utility `src/lib/canonicalGrouping.ts` with `groupByCanonicalKey(rows, resolverMap)` — returns a stable key: `definition_id` if matched, else `nk(category_id|kra|kpi)`.
- Modify trend aggregators in:
  - `src/hooks/useMonthlyTrend.ts`
  - `src/hooks/useKpiJourneyReport.ts`
  - `src/hooks/useKpiEmployeeMatrix.ts`
  - `src/components/dashboard/PerformanceTrend.tsx`
  - `src/pages/reports/PerformanceReport.tsx`, `VarianceReport.tsx`
- Display rule: trend tooltip shows canonical name + small "(also known as: X, Y)" chip when multiple variants merged.
- Resolver caches at the React Query level (key: `['canonical', categoryId, kra, kpi]`, staleTime 10min).

### What stays the same
- No DB schema changes.
- Past KPI rows untouched.
- `final_score`, `review_submissions`, `org_kpi_values` untouched.

### Risk & Impact
- **Data Impact:** Read-only. Zero writes.
- **Workflow Impact:** None — purely presentational grouping.
- **UI/UX:** Trend lines may merge that previously appeared as separate lines. This is the desired behavior; tooltip discloses the merge.
- **Regression Risk:** Medium for trend reports. Mitigation: snapshot tests on `groupByCanonicalKey` with mixed matched/unmatched fixtures; visual QA on Dashboard and KPI Employee Matrix before/after.

---

## Sub-Phase 2b — Soft Enforcement at Creation Flows

**Goal:** Whenever a user/admin creates or assigns a KPI, the registry is suggested first, but custom names remain allowed (per your decision).

### Touchpoints
1. **Smart KRA Assignment** (`src/components/admin/SmartAssignment/`)
   - KRA + KPI name fields become a combined searchable picker backed by `kpi_definitions`.
   - "Use custom name" toggle reveals raw text inputs; saved with `kpi_definition_id = NULL` and a "Not in registry" badge.
2. **Bulk Import** (`src/lib/importValidation.ts`, `src/services/iac/iacService.ts`)
   - Import preview shows a "Registry match" column: green tick (auto-linked via alias), amber dot (fuzzy suggestion, click to confirm), grey dash (no match, will save as custom).
   - Auto-link applies when an exact alias exists in `kpi_name_aliases`.
3. **Copy KRAs** (existing flow)
   - When copying May+ rows forward, re-resolve through registry so the new period's rows get `kpi_definition_id` populated automatically.
4. **KRA Library** (`src/pages/admin/KRALibrary.tsx`)
   - New "Link to Registry" action per library entry; library entries linked to a definition propagate canonical text on assignment.
5. **Org KPI creation** (`OrgKpiEntryCard` and friends)
   - Same picker pattern; Org KPI signature uses canonical name when linked.

### Components to add
- `src/components/admin/registry/RegistryPicker.tsx` — searchable Combobox over `kpi_definitions` with category filter, "Add custom" footer action.
- `src/components/admin/registry/NotInRegistryBadge.tsx` — small amber badge for unlinked entries.
- `src/hooks/useRegistrySearch.ts` — debounced search across canonical names + aliases.

### Behavior rules
- Picker filters by selected `category_id` when present.
- Selecting a registry entry stamps both `kra_name` / `kpi_name` (as canonical) and `kpi_definition_id` on the row.
- Custom entries: save with raw text, `kpi_definition_id = NULL`. They show in the registry health dashboard (2c) for admin triage.
- Period guard: enforcement only activates for `review_period`/`review_year` >= May 2026. Earlier periods (e.g. data repair flows) bypass picker to avoid accidental rewrite.

### Risk & Impact
- **Data Impact:** Adds `kpi_definition_id` values to new rows. No schema change (column exists from Phase 1).
- **Workflow Impact:** Smart Assignment and Bulk Import UX changes. Existing users will see a new picker — needs a one-line tooltip explaining "Pick a standard KPI or add custom."
- **UI/UX:** New combobox in 5 places; consistent component reused everywhere.
- **Regression Risk:** Bulk Import is highest-risk surface. Mitigation: keep existing import path working unchanged when no registry exists for a row; add unit tests around alias auto-match in `importValidation.test.ts`.

---

## Sub-Phase 2c — Registry Governance Dashboard

**Goal:** Admins can see how clean their data is, find drift, and act on unmatched signatures.

### New tab on `/admin/kpi-standardization` → "Health & Governance"

Sections:
1. **Coverage card** — "May 2026+ KPI rows: 1,247 total · 1,089 linked (87%) · 158 unlinked"
2. **Unlinked Queue** — Paginated list of distinct (category, kra_name, kpi_name) signatures from May+ that have no `kpi_definition_id`. Each row has actions:
   - "Link to existing definition" (registry picker)
   - "Promote to new definition" (creates new `kpi_definitions` entry + back-fills aliases for this signature)
3. **Alias Drift Detector** — Signatures that appear in May+ but match an existing alias by fuzzy normalization (`nk()` collation) yet weren't auto-linked. One-click "Apply alias" to link.
4. **Registry Audit Log** — Filterable view of registry actions: definitions created, aliases added/removed, May correction runs. Backed by existing `audit_logs` with new action codes:
   - `REGISTRY_DEFINITION_CREATED`
   - `REGISTRY_ALIAS_ADDED`
   - `REGISTRY_ALIAS_REMOVED`
   - `REGISTRY_MAY_CORRECTION_APPLIED`
   - `REGISTRY_KPI_LINKED`
5. **Export** — Download canonical taxonomy as CSV (definition_id, canonical_kra, canonical_kpi, category, alias_count, linked_kpi_count).

### Backend additions
- New RPC `get_registry_coverage_stats()` → returns counts by category for May 2026+.
- New RPC `get_unlinked_signatures(p_limit, p_offset, p_category_id)` → distinct unlinked signatures with row counts.
- New RPC `detect_alias_drift()` → signatures that should auto-link but didn't.
- Audit triggers on `kpi_definitions` and `kpi_name_aliases` insert/update/delete that write to `audit_logs` with `performed_by = auth.uid()`. System-driven events (e.g. May correction RPC) set `performed_by = NULL` per the System Performer Attribution memory.

### Files to add
- `src/components/admin/kpi-standardization/HealthGovernanceTab.tsx`
- `src/components/admin/kpi-standardization/CoverageCard.tsx`
- `src/components/admin/kpi-standardization/UnlinkedQueueTable.tsx`
- `src/components/admin/kpi-standardization/AliasDriftPanel.tsx`
- `src/components/admin/kpi-standardization/RegistryAuditLogPanel.tsx`
- `src/hooks/useRegistryHealth.ts`
- New migration: 3 RPCs + 2 audit triggers + indexes on `kpis(kpi_definition_id)` and `(category_id, kra_name, kpi_name)` if not present.

### Risk & Impact
- **Data Impact:** Adds indexes and audit log rows. No data mutation outside admin actions.
- **Workflow Impact:** None for non-admin users. Admins gain new visibility tab.
- **UI/UX:** New tab, follows existing `KpiStandardization.tsx` shell.
- **Regression Risk:** Low. Read-heavy. Audit triggers are append-only.

---

## Sequencing & Delivery

```text
Sub-Phase 2a (Linking)        → ship first, immediate value, zero workflow change
        ↓
Sub-Phase 2b (Enforcement)    → ship second, requires 2a's resolver
        ↓
Sub-Phase 2c (Governance)     → ship last, measures success of 2a + 2b
```

Each sub-phase ends with:
- Unit tests for new hooks/utilities
- Updated mock data reflecting registry-linked + unlinked rows
- DOCUMENTATION.md section updates
- POLICY.md §88B addendum (Phase 2 enforcement and visibility rules)
- mem://features/admin/kpi-standardization-registry update

---

## Out of Scope (deferred)
- Hard enforcement (blocking custom names) — explicitly chosen as "soft" by user.
- Retroactive correction of pre-May 2026 data — frozen by Phase 1 policy.
- Auto-merging of definitions (admin-driven only).
- ML-based fuzzy suggestions beyond the existing `nk()` normalization.
