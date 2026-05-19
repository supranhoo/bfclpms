
# Wire "Evidence & Parity" into Organization KPI Data Entry, per scope

## Current state (verified)
- `OrgKpiEntryCard.tsx` **already** imports and renders the Evidence chip, Parity badge, "Manage files" button, and `OrgKpiEvidenceManagerSheet` — but **only when `data.scope === 'organization'`** (lines 218–225 and 578–600). For Department- and Employee-scope KPIs, the chip/badge/sheet never appear, so admins perceive the feature as "not implemented" on the Org KPI Data Entry page.
- The standalone `/admin/org-kpi-evidence-demo` page (`OrgKpiEvidenceDemo.tsx`) is the only place all three scopes render today. It was a preview surface and should not be the production entry point.

## Goal
The Evidence & Parity controls live **inline on each KPI inside the Organization KPI Data Entry page**, and adapt to the KPI's Scope:

| Scope         | Where the controls live                                     | What the sheet manages                              |
|---------------|--------------------------------------------------------------|------------------------------------------------------|
| Organization  | KPI card header (today's location, unchanged)               | One OKV row → files distributed to all mapped employees |
| Department    | KPI card header **and** per-row in the scoped table         | Header sheet = roll-up across all dept OKV rows; row sheet = files on that one department's OKV row |
| Employee      | KPI card header **and** per-row in the scoped table         | Header sheet = roll-up across all employee OKV rows; row sheet = files on that one employee's OKV row |

This matches how the KPI is actually scoped — admins manage org-shared files for org KPIs, department-scoped files for dept KPIs, etc.

## Implementation

### 1. Backend — generalize OKV-id resolution beyond organization scope

`useOrgScopeOkvId` today resolves a single OKV row for an org-scope KPI. Add two siblings (or one parameterised hook) in `src/hooks/useOrgKpiEvidenceFiles.ts`:

- `useScopedOkvIds({ categoryId, kraName, kpiName, reviewPeriod, reviewYear, scope })` — returns a `Map<scopeId, okvId>` for department/employee scope KPIs by querying `org_kpi_values` filtered on `kpi_definition_id` (or kra+kpi+category fallback) for the period, where `department_id IS NOT NULL` (dept scope) or `employee_id IS NOT NULL` (employee scope). One round-trip per card.
- `useAggregateEvidenceForScope(okvIds[])` — returns the union of `evidence_files` across the supplied OKV rows, plus a per-OKV breakdown. Used by the **card-header** sheet for dept/employee KPIs so the admin can see "all evidence across all departments/employees on this KPI" in one place.

No new RPC required for the row-level sheet — it just re-uses the existing `useOrgKpiEvidenceFiles(okvId)`.

### 2. Frontend — `OrgKpiEntryCard.tsx`

- Drop the `data.scope === 'organization'` gate around the Evidence chip / Parity badge / Manage files button. Render them for all scopes.
- For dept/employee scopes:
  - Compute `aggregateOkvIds` via the new hook.
  - The chip shows the **total file count across all scoped OKV rows**, with a tooltip like "12 files across 4 departments".
  - The Parity badge shows aggregate parity (worst-case wins: if any underlying OKV has drift, show drift).
  - "Manage files" opens the sheet in **roll-up mode**: a small scope selector at the top of the sheet lets the admin pick "All <scope>s" or a single dept/employee to edit just that OKV. Targeting still works exactly as today inside the sheet.

### 3. Frontend — `OrgKpiScopedEntryTable.tsx`

- Extend `ScopedRow` with optional `okvId?: string`. Populated by the parent when the row maps to an existing `org_kpi_values` record. (For not-yet-propagated rows, `okvId` is undefined and the row controls are disabled with a "Save first" hint.)
- Add a slim trailing cell rendered after the existing Evidence column:
  - `OrgKpiEvidenceStatusChip` (file count for that row's OKV)
  - `OrgKpiParityBadge` (parity for that one OKV)
  - Paperclip "Manage" icon button opening `OrgKpiEvidenceManagerSheet` scoped to that single OKV.
- Reuses the existing components verbatim — no new UI primitives.

### 4. `OrgKpiEvidenceManagerSheet.tsx` — small additive change

- Accept an optional `okvIds: string[]` (multi-OKV roll-up) alongside today's `okvId: string`.
- When multiple ids are passed, render a scope picker at the top of the sheet ("All departments" / per-dept) that swaps the loaded OKV id. Each individual edit still hits exactly one OKV row.
- When a single id is passed (today's behaviour, including row-level use), the picker is hidden. Zero regression.

### 5. Retire the standalone demo route

- Keep `OrgKpiEvidenceDemo.tsx` as a Storybook-style preview at the same URL but add a yellow banner "Demo only — the production controls live inline on Org KPI Data Entry". This avoids confusing admins who already bookmarked the link.
- Optional: remove the demo route from any sidebar entry (search and remove if present).

### 6. Documentation & memory

- Update `mem://features/admin/org-kpi-management-suite` with: "Evidence & Parity controls render inline per KPI on Org KPI Data Entry for all scopes; dept/employee scopes also expose a row-level Manage-files action."
- Append a "Scope-aware Evidence Manager" section to the existing Org KPI Evidence doc.
- New ADR `docs/adr/ADR-065.md` covering the roll-up vs row-level dual entry pattern.

## Files to touch
- `src/hooks/useOrgKpiEvidenceFiles.ts` — add `useScopedOkvIds`, `useAggregateEvidenceForScope`.
- `src/components/admin/OrgKpiEntryCard.tsx` — remove scope gate; wire aggregate hook; pass `okvIds[]` to sheet.
- `src/components/admin/OrgKpiEvidenceManagerSheet.tsx` — accept `okvIds[]` + render scope picker.
- `src/components/admin/OrgKpiScopedEntryTable.tsx` — new column with chip/badge/manage button; thread `okvId` into `ScopedRow`.
- `src/pages/admin/OrgKpiDataEntry.tsx` — populate `okvId` on `ScopedRow[]` from the existing scoped fetch (already has the OKV ids in its query).
- `src/pages/admin/OrgKpiEvidenceDemo.tsx` — add "Demo only" banner.
- `mem/features/admin/org-kpi-management-suite` — append paragraph.
- `docs/adr/ADR-065.md` — new.

## Risk & Impact Report

- **Data impact:** None. Pure UI surfacing on top of existing OKV rows. No schema or RPC writes; new hooks are reads only.
- **Workflow impact:** Admins gain row-level control today missing for dept/employee scope. Existing org-scope flow unchanged.
- **UI/UX consistency:** Reuses the same chip/badge/sheet/popover components, so the visual language stays identical across scopes.
- **Regression risk:** Low. The sheet's existing single-OKV mode keeps its current contract (`okvIds` is additive and optional). Removing the `scope === 'organization'` gate only adds rendering — does not change existing branches. Mitigation: keep one Vitest snapshot for the org-scope card to prove no header layout shift.
- **Performance:** One extra OKV lookup per card for non-org scopes (already loaded server-side as part of the existing scoped fetch on `OrgKpiDataEntry.tsx`, so we just thread it through — no new query). Aggregate evidence count is computed client-side from the already-fetched JSONB.
- **Mitigation:** Conditional render guards stay in place (`okvId` must exist before showing row chip), and the disabled-with-tooltip state covers not-yet-propagated rows so admins never see broken controls.

## Out of scope
- Changing how evidence files are stored or how targeting works (per-employee/per-dept targeting from the prior change stays exactly as-is).
- Removing or renaming the demo route's URL — only banner-flag it.
- Any change to non-admin views.
