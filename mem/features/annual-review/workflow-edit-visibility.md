---
name: AR Workflow Edit Visibility Gate
description: ADR-160d — "Edit workflow & reviewers" row action gate is status !== 'excluded' only; never reuse the isPastSelf template-reset gate
type: constraint
---
The Admin → Annual Review → Progress row action **"Edit workflow & reviewers"**
is gated on `overall_status !== 'excluded'` and nothing else.

SSOT: `src/lib/annualReview/workflowEditVisibility.ts`
(`canEditWorkflowAndReviewers`, `workflowEditReopensCompleted`).
Call site: `src/pages/annual-review/AnnualReviewAdmin.tsx`.

**Forbidden:** gating this action on `isPastSelf` (or any derivative of
`canChangeTemplateOrWeights`). `isPastSelf` is the **template-reset** gate and
exists only because swapping a template discards the self review. It applies to
*Change template* and *Customise weights* — never to workflow/reviewer edits.

**Why:** reusing it produced an inverted matrix — the action was hidden for every
`pending_manager` / `pending_skip` / `pending_dept` / `pending_bu` /
`pending_management` / `pending_hr` instance while still visible on `completed`.
That hid the action precisely on the mid-cycle instances that need a reviewer
re-point, contradicting POLICY §AR-WORKFLOW-EDIT-ANYTIME (ADR-160/160b/160c),
which the server RPCs already honoured.

Mode selection (`safe` vs `supersede`), reason length, and the typed `REPLAN`
confirmation are dialog/RPC concerns — never visibility concerns.

Regression test: `src/test/annualReview/workflowEditVisibility.test.ts` pins the
full status matrix.