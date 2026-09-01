# Admin KPI Editor — data entry owners for organization-level KPIs

## Assumptions
- "Map the KPI data to its owner" means the existing **Data entry owners** capability (`org_kpi_data_owners`) already shipped in the Performance Console group editor (`GroupDataOwnersField`, ADR-322).
- Ownership stays period-agnostic: keyed by category + KRA name + KPI name, matching today's behaviour. No new table, no new RPC.

## Current gap
- The Admin KPI Editor's Settings block has the Organization-Level toggle plus scope selector, but no owner picker — so a KPI created there can only be filled by admins until someone re-opens it from the Performance Console to attach owners.

## What gets built

### 1. Owner picker in the Settings section
- Directly under the Organization-Level row, shown only while the toggle is on.
- Reuses the existing owner field component (extracted so both surfaces share one implementation — no forked copy) with its badge list, remove button, and person combobox.
- Same helper text: only these people plus admins can enter the central value; saved separately from the monthly KPI apply.

### 2. Create vs edit behaviour
- **Edit mode** (KPI already exists): the picker writes immediately, exactly as in the Performance Console.
- **Create mode** (no saved KPI yet, KPI name may still change): selections are held as a pending list in the form; on successful save the owners are assigned against the final saved category / KRA / KPI name. If an owner assignment fails, the KPI still saves and a clear toast names the people that were not attached, with the list kept so the user can retry.
- Renaming the KRA or KPI text in edit mode carries the existing owner rows to the new name so ownership is not silently orphaned.

### 3. Guardrails
- Picker is disabled until category, KRA and KPI name are filled (the ownership key).
- Turning the org-level toggle off leaves existing owner rows untouched (no destructive side effect) and simply hides the control.
- Inactive employees are excluded from the person list.

## UI changes
- Location: Admin KPI Editor → SETTINGS section, immediately below "Organization-Level KPI".
- Visible: label "Data entry owners", helper line, chips for current owners each with a remove (X), and a searchable "Add a data entry owner…" combobox.
- Appears/disappears with the org-level toggle; full-width row inside the same bordered card style, no layout shift for non-org KPIs.
- Responsive: chips wrap; combobox is full width on mobile.

## Risk & impact
- **Data**: no schema change; writes only to `org_kpi_data_owners` through the existing hooks and RLS.
- **Workflow**: additive — grants data-entry rights that previously required a second screen.
- **Regression**: the shared component is extracted, so the Performance Console must render unchanged; covered by tests below.
- **Scalability**: employee list comes from the existing cached profiles query; owner lists are small (single-digit rows per KPI).
- **Mitigation / rollback**: purely additive UI; removing the section restores today's behaviour.

## Tests
- Unit tests for the pending-owner model: queue/dedupe/remove before save, key readiness gating, flush-after-save payload shape, partial-failure retention.
- Rename-carry logic test (owner rows follow KRA/KPI rename).
- Full `vitest` run plus typecheck; results reported back.

## Documentation
- ADR-335 describing the parity, POLICY §KPI-SCOPE-SINGLE-VOCABULARY note that owner assignment is available from both surfaces, and a DOCUMENTATION.md version entry.
