## Root cause (verified in code)

`src/pages/annual-review/AnnualReviewAdmin.tsx` lines 1041-1048 and 1113:

```
const canChange = i.overall_status !== 'excluded';
const isCompleted = i.overall_status === 'completed';
const canChangeTemplateOrWeights = canChange && !isCompleted;
const isPastSelf = canChangeTemplateOrWeights
  && i.overall_status !== 'not_started'
  && i.overall_status !== 'pending_self';
...
{canChange && !isPastSelf && ( <DropdownMenuItem …>Edit workflow & reviewers</DropdownMenuItem> )}
```

`isPastSelf` is a **template-change** gate (a template swap resets the self review). It was reused for the workflow menu item, so:

| Status | Menu item shown? |
|---|---|
| not_started, pending_self | Yes |
| pending_manager / skip / dept / bu / hr / **pending_management** | **No** — `isPastSelf` is true |
| completed | Yes (`isPastSelf` false because `canChangeTemplateOrWeights` is false) |
| excluded | No (correct) |

So exactly the mid-workflow employees lose the option — the odd case where a *completed* review can be edited but an in-progress one cannot. This directly contradicts POLICY §AR-WORKFLOW-EDIT-ANYTIME (ADR-160/160b/160c), which states admin/HR PMS may edit stages and reviewers **at any status**; the RPC already enforces the real rules server-side.

Not a permissions issue: the item's only gate is status; role gating happens on the page/RPC level.

## Fix (UI-only, one line)

Change the render condition at line 1113 to `{canChange && (` and keep the existing label logic, extended so the intent is readable:

- `not_started` / `pending_self` → "Edit workflow & reviewers"
- any pending_* mid-stage → "Edit workflow & reviewers" (normal styling)
- `completed` → "Edit workflow & reviewers (re-open)" in destructive styling (unchanged)
- `excluded` → still hidden

No change to `isPastSelf`, which remains correct for the Change-template and Customise-weights items.

## UI change description

Location: Admin → Annual Review → Progress tab → row "…" actions menu.
Visual: the "Edit workflow & reviewers" entry now appears for every non-excluded row instead of only pre-self and completed rows. No layout, no new controls, no responsiveness impact.

## Risk & impact

- **Data impact**: none — no schema, no RLS, no migration. The `set_annual_review_enabled_stages` / reassignment RPCs already validate role, stage, and audit-log every edit.
- **Workflow impact**: admins regain the documented ability to fix reviewer mapping mid-review, which is the current manual-escalation path.
- **Regression risk**: low; the change is confined to one JSX condition. Change-template and weights gates untouched.
- **Scalability**: none (per-row boolean).
- **Rollback**: restore `canChange && !isPastSelf`.

## Verification

1. Unit test `src/test/annualReview/workflowEditVisibility.test.ts` — extract the predicate as a tiny pure helper (`canEditWorkflowAndReviewers(status)`) in `src/lib/annualReview/` and assert: true for not_started, pending_self, pending_manager, pending_skip, pending_dept, pending_bu, pending_management, pending_hr, completed; false for excluded.
2. Manual: open Progress, filter Stage = "Manager review pending", confirm the menu item appears and the dialog opens.

## Docs

- `src/modules/annual-review/DOCUMENTATION.md`: version-history entry (ADR-160d) recording the regression and fix.
- `src/modules/annual-review/POLICY.md`: clarify under §AR-WORKFLOW-EDIT-ANYTIME that the menu-item gate is `status !== 'excluded'` only, and must not reuse the template-reset gate.
