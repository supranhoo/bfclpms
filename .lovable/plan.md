## 1. Assumptions
- One uploaded workbook = **one template**. Every sheet in that workbook = **one template variant** (its own criteria list + weights) that should become a real, assignable `annual_review_templates` row.
- Each sheet targets **one or many departments** (and optionally sub-units / grades / archetype). You pick these once at import time, per sheet.
- You do NOT want to hand-build a template from the library after import. The library upsert stays as the staging layer (so criteria are reusable), but the same import step must also **create the templates and the assignment rules** that route employees to them.
- Existing Factory / Archetype / Weight-Matrix machinery stays. Sheet-based templates live alongside factory-generated ones and are keyed so re-import updates them in place.

## 2. Clarifications
Not Applicable — earlier questions covered scope, mapping source, library role, and sheet semantics.

## 3. Risk & Impact Report
- **Data Impact:** Adds N template rows and N assignment-rule rows per import (N = active sheets). Reruns update in place via a new `sheet_key` inside `sections` (no schema change). Criteria Library rows continue to upsert as today.
- **Workflow Impact:** Employees are auto-routed via existing `annual_review_assignment_rules` → resolver. No new resolver logic; we just seed the rules the resolver already reads.
- **UI/UX Impact:** Import dialog gets one extra section per sheet: "Create template as" (name, active cycle) + per-sheet Sub-unit picker + "Also create assignment rule" toggle. Templates page shows imported templates with a "From workbook: <sheet>" badge.
- **Regression Risk:** Medium. Mitigated by keeping factory templates untouched (different `sections.source`), unique idempotency key per sheet, and unit tests around the commit path.
- **Scalability Impact:** Low. Small N per workbook; all writes batched sheet-by-sheet inside the existing mutation. No new queries on hot paths.
- **Mitigation Plan:** Dry-run preview shows exactly which templates + rules will be created/updated before commit; commit is idempotent; rollback = delete rows tagged with the sheet's `sheet_key`.

## 4. Step-by-step Plan

### Step 1 — Extend importer commit to also emit templates
For each non-skipped sheet, in one transaction-like sequence:
1. Upsert criteria into library (existing behaviour — unchanged).
2. Build a `TemplateCriterion[]` payload from the sheet rows using `bandsToBilingualOptions`, preserving each row's `weight_pct` (workbook is the source of truth for weights).
3. Upsert one row into `annual_review_templates` keyed by:
   ```json
   sections.sheet_key = {
     source: "criteria_workbook",
     workbook_hash: "<optional stable id>",
     sheet_name: "<sheet>",
     cycle_id: "<chosen cycle>"
   }
   ```
   with `sections.criteria`, `sections.display_mode`, `sections.stage_weights` (default 100 self+manager or archetype default if archetype chosen), and `sections.system_scores = []` unless the sheet includes system KPIs.
4. For each selected (department × sub-unit) target, upsert one `annual_review_assignment_rules` row: `template_id`, `cycle_id`, `department_id`, `sub_unit_id`, `archetype_code` (nullable), `grade_bucket` (nullable), `grade_code` (nullable). Idempotent on the natural key.

### Step 2 — Add per-sheet template metadata to the import dialog
Small additive UI per sheet:
- **Template name** (default: sheet name).
- **Active cycle** picker (defaults to current).
- **Sub-units** multi-select (already have departments).
- **Create/refresh assignment rule** checkbox (default ON).
- Existing archetype / grade bucket / grade code stay and flow into both the assignment rule and (optionally) `sections.factory_key`-style metadata.

### Step 3 — Preview panel before commit
Replace the single "Planned rows to write: N" badge with a compact table:
```text
Sheet                Template action   Criteria   Assignment rules
Workmen-Production   CREATE            12         3 (Dept×SubUnit)
Managers-M4          UPDATE            9          1
Generic-Common       SKIPPED           —          —
```
Commit button is disabled until every non-skipped sheet has a target cycle + at least one department (or explicit "wildcard" opt-in).

### Step 4 — Templates page: surface workbook-sourced rows
Add a small badge on `annual_review_templates` list where `sections.sheet_key.source === 'criteria_workbook'` showing `Workbook · <sheet_name>` and a "Re-import from workbook" hint. No new page.

### Step 5 — Keep library + picker (staging), no rework
`CriteriaLibraryPickerDialog` and "Add from Library" stay for **manual** template authoring / one-offs. Sheet-based flow bypasses the picker end-to-end.

## 5. UI Changes
- **Criteria Library Import dialog (existing):**
  - New "Template" sub-block per sheet: `Template name`, `Cycle`, `Sub-units` multi-select, `Create assignment rule` toggle.
  - New preview table replacing the single planned-rows badge.
  - Commit button gated by validation described above.
- **Templates list (existing):**
  - `Workbook · <sheet>` badge on imported rows, right of the template name. Responsive: wraps under the name on mobile.
- No new pages, no new routes.

## 6. Implementation
- `src/components/annual-review/CriteriaLibraryImportDialog.tsx` — extend `SheetMapping` (`template_name`, `cycle_id`, `sub_unit_ids`, `create_rule`), extend commit mutation with steps 2–4 above, add preview table.
- `src/services/annualReview/criteriaWorkbookTemplates.ts` (new, small) — pure helpers:
  - `buildTemplateSectionsFromSheet(sheet, meta)` → `sections` JSON.
  - `upsertWorkbookTemplate(sheetKey, payload)` → template row.
  - `upsertWorkbookAssignmentRules(templateId, targets)` → rules.
  - All idempotent, keyed on `sheet_key` / natural rule key.
- `src/pages/annual-review/admin/Templates*.tsx` (or existing templates list component) — add the workbook badge.
- No schema migration. Uses existing `annual_review_templates.sections` (JSONB) and `annual_review_assignment_rules`.

## 7. Tests
- `criteriaWorkbookTemplates.test.ts`:
  - `buildTemplateSectionsFromSheet` produces bilingual options and correct weights.
  - Rerunning `upsertWorkbookTemplate` with same `sheet_key` UPDATES, never duplicates.
  - `upsertWorkbookAssignmentRules` is idempotent on `(template_id, cycle_id, dept, sub_unit, archetype, grade_bucket, grade_code)`.
- Integration-style test on the commit mutation: 2 sheets × 2 departments produces 2 templates + 4 rules; second run produces 0 new templates and 0 new rules.

## 8. DOCUMENTATION.md updates
- Add "Criteria workbook → Templates" section:
  - Contract: one sheet = one template.
  - Explains `sections.sheet_key`, idempotency, and how assignment rules are created.
  - Notes that the Criteria Library remains the staging layer for reuse.

## 9. POLICY.md updates
- Clarify that imported workbook templates are the SSOT for reviewer-facing criteria + weights on the departments/employees they are mapped to, and that manual edits to those templates persist across re-imports **only** for fields outside `sections.criteria` / `sections.stage_weights` (matching factory rebuild policy).

## 10. Post-implementation notes
- Rollback: templates and rules created by a workbook are all tagged with `sections.sheet_key.workbook_hash`; a single delete-by-key removes them cleanly. No destructive migration.
- Answers the frustration directly: **one Excel upload = N ready-to-use templates auto-mapped to the chosen departments**, no manual template building, no per-employee mapping.
- Future enhancement (not in this plan): auto-derive department/sub-unit/grade from explicit columns inside the sheet, so the dialog picker becomes optional.
