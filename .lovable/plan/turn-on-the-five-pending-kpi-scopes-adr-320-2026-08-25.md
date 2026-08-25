# Turn on the five pending KPI scopes (ADR-320)

Business Unit, Location, Division, PMS Grade and Level become real, selectable scopes — in that order.

## What already exists (verified)

More of this is built than the "Soon" chips suggest:

- `kpis` and `org_kpi_values` already carry `division_id`, `business_unit_id`, `location_id`, `pms_grade_id`, `level_id`.
- The `kpis` check constraint already permits all eight scope words and enforces that each scope carries exactly its own target column and no other.
- `resolve_scope_population(scope, division, bu, dept, location, grade, level, employee, period, year)` already returns the right employees for every one of the five new dimensions.
- The employee master already holds the keys: of 2,586 active employees, 2,584 have a location, 2,504 a level, 2,358 a PMS grade.

What is missing is everything above that line: no KPI has ever been given one of these scopes (0 rows carry a target id), and every screen, hook and remaining RPC still hardcodes the three old words.

## What gets built

### 1. One scope model, extended
`src/lib/review/kpiScope.ts` (ADR-319) is promoted from four scopes to eight. Each scope declares its target column, the master-data table its picker reads, and its label. Nothing else in the app is allowed to name a scope.

### 2. Target picker
Choosing Business Unit / Location / Division / PMS Grade / Level asks the one extra question those scopes need: *which one?* A single reusable picker, driven by the scope model, appears in:
- the console's New KPI dialog,
- the Admin KPI create and edit forms,
- the "Edit Scope" menu on the Org KPI card.

It shows a live count — "applies to 214 active employees" — before anything is saved, so an empty or mis-set scope is visible immediately.

### 3. Server plumbing for the new dimensions
The three RPCs that still assume department-or-employee are widened to take a scope plus its target id, resolving members through the existing `resolve_scope_population`:
- `bu_console_kpi_create` — writes the scope and its target column.
- `resolve_org_kpi_target_kpis` — filters candidate rows by the scope's target.
- `change_org_kpi_scope_cascading` / `migrate_okv_on_scope_change` — moves values when a KPI is re-scoped (e.g. Department → Business Unit) with the existing dry-run and audit trail.

### 4. Data entry and propagation
The Org KPI data entry grid groups rows by the KPI's own scope instead of a fixed three-way branch: one row per business unit, per location, per grade, per level. Propagation from one scope row to its employees reuses the existing preview → confirm → audit path; no new write path is introduced.

### 5. Guardrails
- A scope whose target has no active employees is refused at save time with a plain message, not a silent no-op.
- Employees missing the key a scope needs (82 without a level, 228 without a PMS grade) are listed as skipped rows in the preview, never silently dropped.
- Re-scoping a KPI that already has approved values requires the existing typed confirmation.

## Rollout order

Ships in two flights so each is verifiable in production before the next:
1. **Business Unit + Location** — cleanest data (2,584 of 2,586 employees have a location) and the two the user asked for first.
2. **Division + PMS Grade + Level** — same machinery, once flight 1 is proven.

## Risk and impact

- **Data:** additive only — no column is created, altered or dropped, and no historical row is rewritten. Existing organization/department/employee KPIs behave exactly as today.
- **Workflow:** unchanged. Scope decides *who a value reaches*, never who approves it.
- **Regression:** the risk is a widened RPC misreading an old-scope KPI. Mitigated by keeping the three legacy branches byte-identical and adding the new ones alongside, plus unit tests per scope on the mapping and member-resolution.
- **Scale:** an organization-wide scope already resolves ~2,586 employees; the new dimensions all resolve smaller sets through the same indexed joins.
- **Rollback:** revert the function bodies and drop the new scopes from the scope model — rows written with a new scope keep their target column and simply stop being offered.

## Documentation

ADR-320, a POLICY amendment to §KPI-SCOPE-SINGLE-VOCABULARY covering the target-id rule, and a DOCUMENTATION.md entry.
