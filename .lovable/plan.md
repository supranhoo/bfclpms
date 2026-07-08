## Goal

Make Form Mapping enforce "the latest rule wins" for an employee already seeded on a different template in the same cycle — without silently breaking in-flight reviews.

Today, the seeder (`writeSeedRowsPreservingOverrides`) intentionally never re-points an existing instance to a different template, so a new mapping only affects future seeds. The pieces to move employees over already exist (`set_annual_review_template_override` RPC + `findSeededConflicts` + `bulkReassignViaOverride` helpers per `mem://features/annual-review/per-employee-template-override`), but they aren't wired into the Form Mapping save flow or exposed as a per-rule action. This plan wires them in.

---

## UX flow

### A. On Save of a mapping rule
1. Resolve the rule's audience to a concrete employee ID list (existing preview logic + `resolveFilterToEmployeeIds` for filter-only rules).
2. Call `findSeededConflicts(cycleId, employeeIds, thisRule.templateId)`.
3. If conflicts exist, open a blocking **"Reassign existing employees?"** dialog listing:
   - Employee (code + name)
   - Current template
   - Current stage
   - Eligible? (Yes = `not_started` or `pending_self`; No = past self stage)
4. Three actions:
   - **Save mapping and reassign eligible now** (default, recommended) — saves the rule, then loops `set_annual_review_template_override(instance_id, newTemplateId, "Reassigned via Form Mapping rule <name>")` for each eligible row. Ineligible rows are listed in the result toast with a reason ("Already past self stage — reassign manually via Progress tab").
   - **Save mapping only** — today's behaviour; rule wins for future seeding only.
   - **Cancel** — nothing is written.

### B. Per-row "Sync assignments" action on the mapping list
Same dialog, invoked on demand, so an admin can move eligible employees over any time after the rule was saved.

### C. Guardrails
- Reassign is stage-gated at the RPC level — the client cannot bypass it.
- Every override is audit-logged as `annual_review.template_override_set` with rule name in the reason.
- Ineligible instances (past `pending_self`) are never touched — admin must use the existing per-employee "Change template" dialog or send-back first.
- Precedence for future seeds is unchanged (rule priority = `minExisting - 1`).

---

## Technical work

**Service (`src/services/annualReview/formMapping.ts`, `annualReviewService.ts`)** — helpers already exist per plan.md; verify they are exported and covered:
- `resolveFilterToEmployeeIds`
- `findSeededConflicts`
- `bulkReassignViaOverride` (thin loop over `set_annual_review_template_override`, per-row error isolation)

**UI (`src/pages/annual-review/AnnualReviewFormMapping.tsx`)**:
- New `SyncAssignmentsDialog` component (conflict table + eligible/ineligible split + progress bar).
- Hook into the existing Save handler: after successful mapping save, run conflict check → if non-empty, open dialog. Reassign runs after the rule row exists.
- Add a **"Sync assignments"** button on each mapping card.

**No schema changes. No new RPC.** All behaviour rides on `template_override_id` + `set_annual_review_template_override`.

---

## Risk & Impact

- **Data**: Only `template_override_id` writes on eligible instances; responses, scores, reviewer chains untouched.
- **Workflow**: Admin sees exactly which employees will move and which won't before confirming.
- **Regression**: Seeder is unchanged; override survives future re-seeds by design.
- **Rollback**: Remove the dialog + Save-flow hook; DB state unaffected (overrides can be cleared per-row).

## Tests
- `findSeededConflicts.test.ts` (exists) — conflict detection + eligibility.
- Extend `bulkSetTemplateOverrides.test.ts` — reassign batch with mixed eligibility, audit reason contains rule name.
- New integration test on the Save handler — conflict present → dialog opens; confirm → RPC called N times with correct template ID.

## Documentation
- `mem://features/annual-review/per-employee-template-override` — add "Form Mapping Save flow auto-offers reassign for eligible instances".
- `POLICY.md` — "Latest Form Mapping rule wins for future seeding automatically; already-seeded employees are moved only via the explicit Reassign dialog and only when in `not_started` or `pending_self`."
