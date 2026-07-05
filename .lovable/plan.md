## 1. Assumptions
- The affected cycle is **Annual Review - 2025-2026**.
- The uploaded workbook-derived template is **HK, Pol, Dust, hort - W**.
- The intended audience is the selected departments in its rule: Admin-HK, Admin-Pollution, Admin-Dust Management, Admin-Horti, primarily Workman employees.
- Because all 2,653 cycle instances are still at `pending_self`, template/workflow remapping can be corrected safely before employee submissions begin.

## 2. Clarifications
Not required before implementation. The database already shows the mismatch:
- Uploaded workbook template exists but has **0 mapped employees**.
- It has **10 criteria**, total criteria weight **65**.
- It has **0 system-based questions**, total system weight **0**.
- Its final-score/stage weights are hardcoded to legacy workflow: `Self 30 / Manager 40 / Skip 15 / BU 10 / HR 5`.
- The cycle workflow is already `Self > Dept Head > BU Head`, so the template import is inconsistent with the cycle workflow.

## 3. Risk & Impact Report
### Data Impact
- Existing review instances will be updated only for the intended target audience.
- No schema changes are expected.
- No historical submitted review data should be affected because all current instances are still pending self.
- Audit rows should be inserted for traceability when mapping instances to the corrected template.

### Workflow Impact
- Target employees will receive the workbook-uploaded bilingual form instead of the default Blue-Collar Comprehensive Review.
- Workflow will remain aligned to the cycle: `Self > Dept Head > BU Head`.
- Manager, skip-manager, and HR review stages will not be reintroduced.

### UI/UX Impact
- No visual redesign.
- Admin template preview/list should show correct system score count and final-score blend after import.
- The employee/reviewer form should render uploaded bilingual criteria and system questions from the corrected template.

### Regression Risk
- Medium: this upload path is used by annual-review admins and can affect future imports.
- Main risk is over-applying workbook templates to employees outside the selected upload filters.

### Scalability Impact
- Updates must be batched and filtered by department/grade/cycle; no full unbounded employee loading.
- Mapping checks should use aggregate queries and targeted updates.

### Mitigation Plan
- Fix the import logic first so future uploads preserve system questions and weight distribution.
- Add unit tests covering BFCL workbook section parsing: Eligibility/System/Type blocks, bilingual criteria, and weight split.
- Repair only the affected cycle/template data.
- Verify counts before and after: template counts, weight totals, assignment rule, employee instance mapping, and workflow stages.

## 4. Step-by-step Plan
1. **Fix workbook parsing/import logic**
   - Extend the workbook upload parser to preserve the workbook’s System block instead of dropping it.
   - Save system-based questions into `sections.system_scores` with stable IDs, bilingual labels where available, and their workbook weights.
   - Stop hardcoding imported workbook templates to the old 5-stage weights.
   - Set imported workbook template weights/workflow to match the uploaded workbook and current cycle workflow: `Self > Dept Head > BU Head`, including system-score contribution where applicable.

2. **Fix assignment rule matching for workbook templates**
   - Ensure workbook-created assignment rules store archetype/grade bucket in the same canonical fields used by the seeding/mapping resolver, not only inside JSON filters.
   - Confirm the rule matches selected departments and Workman grade bucket as intended.

3. **Repair the current 2025-2026 data**
   - Rebuild/update the existing **HK, Pol, Dust, hort - W** template so it contains:
     - Uploaded bilingual criteria.
     - Uploaded system-based questions.
     - Correct weight distribution.
     - Correct enabled stages.
   - Map matching employees in the selected departments to this template for the active cycle.
   - Preserve any per-employee override values if present.
   - Insert audit log entries for the data repair.

4. **Verification**
   - Confirm the workbook template has non-zero system questions.
   - Confirm total weight distribution is correct and no longer shows the legacy 5-stage split.
   - Confirm target employees now resolve to the uploaded template.
   - Confirm no employee outside the selected departments was remapped.
   - Confirm no progressed/submitted instances were changed.

## 5. UI Changes
Not Applicable — no UI redesign is planned.

## 6. Implementation
After approval, I will make surgical code changes in the annual-review workbook import/mapping services, then apply a targeted backend data repair for the affected cycle.

## 7. Tests
- Add/update tests for workbook parsing to prove:
  - System block rows are parsed and saved.
  - Bilingual criteria labels/rating options are preserved.
  - Criteria/system weight split is preserved.
  - Self Review Fields are not accidentally treated as scored criteria.
- Add/update mapping tests to prove workbook assignment rules match the intended employee audience.

## 8. DOCUMENTATION.md updates
Update the annual-review template import documentation/spec to state that BFCL workbook imports preserve:
- Bilingual criteria.
- System-based questions.
- Uploaded weight distribution.
- Cycle-compatible workflow stages.

## 9. POLICY.md updates
Update annual-review policy notes to state that workbook-uploaded templates must not fall back to the legacy 5-stage review workflow when the active cycle is configured as `Self > Dept Head > BU Head`.

## 10. Post-implementation notes
- Rollback strategy: restore affected instances to their previous template IDs from the pre-repair query/audit snapshot, and revert the import parser change if needed.
- Backup consistency: no new tables are added; existing annual-review tables remain covered by the existing backup process.