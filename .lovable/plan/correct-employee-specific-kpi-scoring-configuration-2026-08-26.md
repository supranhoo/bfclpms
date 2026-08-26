# Correct employee-specific KPI scoring configuration

## Assumptions
- One KPI keeps one shared identity: title, description, and measurement formula.
- Each employee may independently carry a different target, R0–R5 bands, scoring test/instructions, and weightage.
- Existing employee scoring values are authoritative and must not be flattened or inferred from target alone.
- Approved historical scores remain immutable.

## Verified current-state gap
- The Align flow currently classifies `kpi_scoring_logic` as shared wording and writes it during “Standardise wording”. This can overwrite employee-specific scoring tests.
- Its variance grouping uses description + formula + scoring logic, but its predicted result is based only on distinct targets. Employees with one target but different R0–R5 bands or scoring tests are therefore not represented correctly.
- “Targets & bands” is presented inside Align, although it only flattens `target_value`; it does not manage the full employee scoring definition.
- The ladder seed groups rows by target only. It does not carry employee identities or R0–R5 bands, so it cannot safely reconstruct existing employee-specific scoring configurations.
- The backend ladder can store employee-specific tiers, targets, bands, formula, and scoring text, but the current handoff does not provide enough data and the UI asks for raw match values rather than a practical employee assignment workflow.

## Risk & Impact Report
- **Data impact:** Additive backend read/configuration support only if required for profile assignment; no historical score rewrite or destructive migration. Existing ladder data remains readable.
- **Workflow impact:** Shared wording alignment becomes narrower and safer. Employee scoring changes move to a separate, explicit scoring-profile workflow with preview and audit.
- **UI/UX impact:** Remove the misleading Targets & bands tab and ladder handoff from Align. Add a dedicated employee scoring workbench accessible beside Align, sized to avoid horizontal scrolling.
- **Regression risk:** Existing admins may expect Align to change scoring text or targets. Mitigate with renamed actions, field-level tests, preview assertions, and keeping existing ladder rules available under a clearly separate bulk-rules section.
- **Scalability impact:** Employee scoring rows will use existing server pagination/filtering; no full-roster browser load. Profile summaries are aggregated server-side and capped previews show counts plus paged detail.
- **Security/RLS:** Reads continue through console-authorized RPCs; writes remain admin-only RPC operations with immutable audit entries. No direct client writes to KPI rows.
- **Backup/data integrity:** Any additive public tables are automatically covered by the existing dynamic backup discovery. New tables will include explicit grants, RLS, and policies.
- **Rollback:** Revert the UI/service changes and additive migration. No existing KPI values are transformed automatically, so rollback does not require data repair.

## Step-by-step Plan

### 1. Correct the domain model and safety boundary
Define three explicit layers:

```text
Shared KPI definition
  title + description + measurement formula

Employee scoring profile
  target + R0–R5 bands + scoring test/instructions + weightage

Assignment
  which employee/group receives which scoring profile
```

- Reclassify `kpi_scoring_logic` as employee scoring data, not shared wording.
- Treat R0–R5, target, scoring logic, and weightage as one indivisible scoring signature for comparison and preview.
- Keep formula shared; do not copy it into newly created employee scoring profiles.

**Verification:** Pure model tests prove that shared-definition alignment never emits target, R0–R5, scoring logic, or weightage.

### 2. Simplify Align to do one job
- Rename the action/dialog to **Standardise shared definition**.
- Keep only description and formula selection/editing.
- Remove the **Targets & bands** tab, target flattening control, and automatic ladder handoff from this dialog.
- Show a permanent protected-fields summary: employee targets, bands, scoring tests, and weightages will not change.
- Update variant classification so scoring differences are reported separately rather than labelled wording drift.

**Verification:** Preview/commit payload inspection confirms only `kpi_description` and `kpi_formula` can be sent.

### 3. Build a dedicated Employee Scoring workbench
- Add a separate **Employee scoring** action for the KPI.
- Show server-aggregated scoring profiles using the complete signature: target + R0–R5 + scoring test + weightage.
- For each profile, show employee count and a paged employee list with names/codes; never expose hashes or raw identifiers as labels.
- Support two deliberate edit paths:
  1. **Edit selected employees** for genuinely individual scoring.
  2. **Create/apply a reusable rule** by employee, designation, level, department, manager status, or fallback for shared patterns.
- Replace raw employee-ID entry with the existing searchable people selector.
- Preview exact before/after fields and employee counts before save/apply; locked rows show withheld fields and reasons.

**Verification:** UI tests cover one unique profile per employee, multiple employees sharing a profile, same target with different bands, and same bands with different scoring tests.

### 4. Correct the existing ladder instead of duplicating it
- Retain the ladder engine as the reusable bulk-rule mechanism, but relabel it **Scoring rules** inside the workbench rather than a second concept competing with profiles.
- Seed rules from complete scoring signatures, never target alone.
- Carry exact employee identities for individual profiles and all R0–R5/scoring fields during seeding.
- Keep auto-split and central-value options only in the rules area because they solve group allocation, not wording alignment.
- Ensure individual edits remain authoritative unless an admin explicitly chooses to replace overrides.

**Verification:** Backend/client parity tests prove first-match resolution, named-employee assignment, complete scoring-field transfer, override preservation, and approved-row immutability.

### 5. Backend, audit, and pagination
- Add or revise admin-only RPCs to return paginated employee scoring-profile membership and to preview/apply profile assignments atomically.
- Reuse existing change-run/audit infrastructure so each scoring change records actor, reason, old values, new values, period, and affected employees.
- If a normalized profile/assignment table is needed after checking the current RPC response limits, create it additively with explicit grants, RLS, retention through audit history, and no cascade deletion of audit evidence.
- Do not update historical scores as part of this correction.

**Verification:** Authorization, pagination, locked-row, partial-failure, and audit tests; confirm new tables appear in dynamic backup discovery.

## UI Changes
- **Performance Console → KPI row:** separate actions for **Standardise definition** and **Employee scoring**.
- **Standardise definition dialog:** one vertical workflow; no scoring tab and no horizontal scrolling.
- **Employee scoring workbench:** profile summary on the left/top, paged employees and profile editor on the right/below depending on viewport.
- Desktop uses a constrained two-pane layout; mobile stacks sections with sticky Save/Preview actions and touch-safe controls.
- No table requires page-level left/right scrolling; long scoring text wraps or opens in an editor panel.

## Tests and Mock Data
- Update realistic mocks for:
  - three employees with targets 5, 7, and 10;
  - two employees sharing a target but carrying different R0–R5 bands;
  - two employees sharing bands but carrying different scoring tests;
  - one approved/locked row and one manual override;
  - large paginated roster.
- Add success and failure tests for shared alignment, profile grouping, individual assignment, reusable rules, immutable rows, authorization, pagination, and audit output.

## Documentation and Policy
- Update `DOCUMENTATION.md` architecture and Version History.
- Amend `POLICY.md` so scoring logic is explicitly employee-specific/protected and shared alignment is limited to description/formula.
- Supersede the conflicting ADR-325 field classification with a new ADR; amend ADR-324 terminology from “ladder as the model” to “profiles plus optional resolution rules”.

## Decision justification
- **Chosen:** shared definition + complete employee scoring profile + optional reusable rules. This supports both fully unique employee scoring and repeated group patterns without flattening either.
- **Rejected:** target-only grouping, because equal targets can have different bands/tests.
- **Rejected:** keeping scoring logic under wording, because it changes how an employee is evaluated.
- **Rejected:** one ladder tier per employee as the only model, because it becomes cumbersome at scale and obscures the current per-employee truth.
