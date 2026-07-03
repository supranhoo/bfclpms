## Where the "Eligibility Criteria (HR Inputs)" editor lives

The per-employee HR inputs used by the Annual Review eligibility evaluator are edited from the **Admin → Annual Review** page, inside the HR Finalization side sheet.

### Navigation path
1. Sign in as an Admin / HR PMS user.
2. Left nav → **Annual Review → Admin** (`AnnualReviewAdmin` page).
3. Select the active **cycle** and locate the employee row in the progress table.
4. Click the employee's **Finalize / HR Review** action — this opens the `HrFinalizationSheet` on the right.
5. Inside the sheet, scroll to the **"Eligibility Inputs"** card. Each criterion defined on the template renders one field (number / boolean / text) plus an **Eligibility Remark** textarea (required when any criterion fails).
6. Click **Save** — writes to `annual_review_instances.eligibility_inputs` via `updateEligibilityInputs()` and re-runs `evaluateEligibility()`.

### Where the values come from / go to
- Component: `src/components/annual-review/EligibilityInputsEditor.tsx`
- Rendered by: `src/components/annual-review/HrFinalizationSheet.tsx` (line ~138)
- Opened from: `src/pages/annual-review/AnnualReviewAdmin.tsx` (line ~921)
- Criteria list source: the active **Annual Review Template** (`annual_review_templates.eligibility_criteria`). To change *which* criteria appear, edit them in **Admin → Annual Review → Templates** (template editor), not in the HR sheet.
- Persisted to: `annual_review_instances.eligibility_inputs` (jsonb) + `eligibility_remark`.

### Related but separate surfaces (do not confuse)
- **General Eligibility Configs** (`general_eligibility_configs`) — org-wide eligibility for increments, edited on the Increment Admin page. Not the same as Annual Review HR Inputs.
- **Increment Ineligibility Criteria** — increment module (ADR-069).

### Deliverable
Read-only answer — no code changes proposed. If you'd like, I can follow up with a plan to (a) surface a direct "Edit Eligibility Inputs" shortcut from the employee row, or (b) allow bulk-editing HR inputs across employees.
