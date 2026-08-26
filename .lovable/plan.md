# Group Definition Edit — Complete Descriptive-Change Processing

## 1. Assumptions
- **Formula** and **Scoring Logic** are explanatory text. They do not execute calculations; structured controls such as target, KPI type, threshold mode, qualitative/rating bands, weightage, frequency/cycle, and day-count rules determine scoring.
- “Edit definition for the whole group” should standardise descriptive fields across every matching existing KPI row, including rows already in review or carrying an approved final score, without changing any score, input, status, or review history.
- Future months with no matching KPI rows remain “no matching rows”; this edit will not silently create assignments.

## 2. Clarifications
Resolved: Formula and Scoring Logic changes should be treated as text when no structured scoring field changes.

## 3. 5-Why Analysis
1. **Why are Title/Description rows skipped?** The request sends `p_text_only=false` unless the operator manually enables “Standardise text on locked and in-review rows.”
2. **Why is it false for a descriptive-only edit?** The UI detects the edit correctly but uses that result only to display an optional switch; it does not automatically select the safe server path.
3. **Why does the process require manual selection?** ADR-321 was implemented as an opt-in exception to the old blanket lock rule rather than as field-aware default behavior.
4. **Why did the earlier fix appear incomplete?** Unit tests cover field classification and month-span resolution separately, but not the end-to-end contract that a descriptive-only preview must automatically bypass scoring locks.
5. **Why can the issue recur across the process?** Client intent (`descriptiveOnly`) and backend execution (`p_text_only`) are separate decisions, while individual-override filtering can independently remove descriptive fields.

## 4. Root Cause Analysis
- **Primary logic gap:** `GroupDefinitionEditDialog` computes `descriptiveOnly`, but both preview and commit send `textOnly: descriptiveOnly && textOnly`; `textOnly` resets to `false` whenever the dialog opens. The backend therefore applies `final_score_locked` / `past_kra_set` unless a second switch is discovered and enabled.
- **Policy/UX gap:** The UI already knows the safe classification, but asks the operator to restate it. This contradicts the requested process-aware behavior.
- **Coverage gap:** Existing tests verify Title/Description are classified as descriptive, but do not verify the RPC arguments or backend preview result for locked/in-review rows.
- **Classification decision:** Title, Description, Criteria/Direction, Source of Data, Formula text, Scoring Logic text, and Unit text are descriptive. Structured score inputs remain protected.
- **Screenshot interpretation:** The four July rows are actual skips; future months report zero matching rows, not locked skips. Those are separate outcomes and should be labelled distinctly.

## 5. Risk & Impact Report
- **Data impact:** Additive function update only; no schema deletion and no historical-score rewrite. Existing audit/undo records remain authoritative.
- **Workflow impact:** Descriptive-only group edits will update matching rows at every workflow stage. Score-affecting edits retain current lock, inclusion, and confirmation rules.
- **UI/UX impact:** Remove the redundant text-standardisation switch and show an automatic “Definition text only — scoring and workflow remain unchanged” state. Preview will distinguish “no assignment exists” from “skipped by protection.”
- **Regression risk:** Moderate because the shared RPC serves preview and commit. Main risks are misclassifying a score-bearing field or overwriting an intentional descriptive per-employee override.
- **Scalability impact:** No broader scans or extra API calls; existing scoped, paged RPC and 500-row detail cap remain. Count summaries remain server-side.
- **Mitigation:** Maintain identical client/server allowlists, reject mixed descriptive/scoring change sets from the bypass, audit every row, retain undo, and add end-to-end regression tests.
- **Backup:** No new table or exclusion. Existing edit-run and audit tables remain covered by automatic public-table backup discovery.

## 6. Step-by-Step Plan
1. **Make classification explicit and policy-driven**
   - Rename the concept from optional `textOnly` to an automatically derived descriptive-only mode in the UI/service contract.
   - Keep the backend as the final authority and reject any request that claims descriptive mode while carrying a protected field.

2. **Process all descriptive group fields automatically**
   - For a change set containing only Title, Description, Criteria, Source of Data, Formula, Scoring Logic, or Unit, automatically bypass `final_score_locked` and `past_kra_set`.
   - Treat descriptive group standardisation as canonical for the selected group; do not let descriptive individual-override markers silently remove those fields. Preserve individual overrides for score-bearing/operational fields unless the existing reset option is explicitly selected.
   - Do not mutate achieved values, submitted scores, final scores, rating bands, targets, weightages, statuses, or review submissions.

3. **Retain strict handling for score-affecting edits**
   - Continue protected handling for target, weightage, KPI/UOM type, threshold mode, qualitative options, R0–R5 bands, frequency/cycle, day-count, scope/targeting, KRA/category, and workflow-sensitive controls.
   - Mixed edits follow the strictest classification: if any protected field changes, the entire request uses the normal guarded path.

4. **Improve preview clarity**
   - Replace the optional switch with a non-interactive safety notice when the edit is descriptive-only.
   - Show per-month states as “N rows will update,” “N protected rows skipped,” or “No KPI assignments exist for this month,” avoiding the current ambiguous “no matching rows” under a rows column.
   - Keep per-employee skip reasons, span selection, confirmation, and undo behavior.

5. **Backend CAPA and audit integrity**
   - Update the group-edit RPC so classification is derived from `p_changes`, rather than trusting an optional client flag to activate safe behavior.
   - Record the derived edit class in edit-run/audit metadata and keep each month independently undoable.
   - Preserve authorization, active-employee filtering, scope filters, variant targeting, and cycle-conflict safeguards.

6. **Verification**
   - Preview and commit a Title + Description change against mock rows in `kra_set`, in-review, and final-score-locked states; all must update with scores/statuses byte-identical.
   - Verify Formula/Scoring Logic text follows the same path.
   - Verify every protected and mixed-field case remains skipped/guarded.
   - Verify future months without KPI rows remain no-op and are clearly reported, not created.
   - Run the focused tests, backend write/read/restore parity script required by policy, build validation, and browser verification of the dialog.

## 7. Tests
- Extend field-classification tests for every descriptive field, every protected field, and mixed change sets.
- Add service/UI argument tests proving descriptive-only preview and commit automatically request the safe path without a toggle.
- Add backend regression coverage for `kra_set`, in-review, final-score-locked, descriptive overrides, protected overrides, unauthorized caller, and dry-run/commit parity.
- Update realistic mock rows for unlocked, in-review, approved, overridden, and missing-future-month scenarios.

## 8. DOCUMENTATION.md Updates
- Document the automatic field-aware behavior, preview states, audit/undo contract, and version-history entry.

## 9. POLICY.md Updates
- Amend §CONSOLE-TEXT-ONLY-STANDARDISATION: descriptive-only mode is server-derived and automatic, not operator opt-in.
- State that Formula and Scoring Logic columns are explanatory text; structured scoring controls are the calculation SSOT.
- Define mixed-field strictness and descriptive override behavior.

## 10. Rollback and Post-Implementation Notes
- **Rollback:** Restore the prior RPC and UI behavior; no data migration reversal is needed. Any committed group edit remains individually undoable through its edit run.
- **Decision rationale:** Automatic classification is simpler and safer than a manual bypass because both client and server already know exactly which fields changed. Keeping the opt-in would preserve the confirmed failure mode.
