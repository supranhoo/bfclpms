## Root cause

The admin re-mapped the employee onto a new template, but the instance is already past `pending_self` (currently `pending_dept`). All non-destructive template-swap paths (`set_annual_review_template_override` RPC, single-row "Change template" dropdown, `BulkTemplateAssignmentDialog`, Form-Mapping "Reassign now") **refuse anything past `pending_self`** and only affect future seed runs. Result:

- Instance stays on the OLD template.
- `overall_status` stays at `pending_dept` (dept head sees it in their queue).
- Employee only sees the already-submitted self-review (read-only), never a fresh form.

The only server path that actually moves a past-self instance onto a new template and restarts it at `pending_self` is the destructive `bulk_force_reset_annual_review_instances` RPC (archives responses → wipes → swaps template → status `pending_self`). Today that RPC is only reachable from the Form-Mapping Save flow's `SyncAssignmentsDialog` when the admin explicitly ticks "Force reset" per row — easy to miss.

## Fix (single-employee "Reset & reassign template" action)

Add a per-row destructive action on the Admin → Progress table so HR can reset one employee's instance onto a new template without going through Form Mapping. Reuses the existing RPC — no new schema, no policy change.

### 1. `src/pages/annual-review/AnnualReviewAdmin.tsx`
- Add a new dropdown item **"Reset & reassign template"** visible when `overall_status` is past `pending_self` and not `completed` / `excluded` (i.e. `pending_manager | pending_skip | pending_dept | pending_bu | pending_hr`), gated to admin / hr_pms (same gate as existing template actions).
- Opens a new `ResetAndReassignTemplateDialog` prefilled with the instance.

### 2. New `src/components/annual-review/ResetAndReassignTemplateDialog.tsx`
- Fields: current template (read-only), **New template** (Select — active templates only), **Reason** (Textarea, min 10 chars), **Type `RESET` to confirm** (Input).
- Prominent destructive warning listing what will happen (archive + wipe responses, swap template, restart at `pending_self`, notify employee).
- Submit calls `bulkForceResetInstances([{ instanceId, templateId }], reason)` (existing service helper).
- On success: toast, invalidate the Progress + instance queries, close.

### 3. Employee-side visibility (no code change required)
Once the RPC runs, `overall_status = 'pending_self'` and `template_override_id = new template`. Existing self-review page already renders `resolveTemplateId(instance)` and shows the form when status = `pending_self`. Verify by opening the employee's self-review route after the reset.

### 4. Tests
`src/test/annualReview/resetAndReassignTemplateDialog.test.ts` (Vitest + RTL):
- Renders with current template label, submit disabled until reason ≥ 10 chars AND gate = "RESET" AND new template chosen.
- Submitting calls `bulkForceResetInstances` with `[{ instanceId, templateId }]` + reason.
- Failure path shows toast, dialog stays open.

## Data / policy notes
- SSOT unchanged: `resolveTemplateId` still `COALESCE(template_override_id, template_id)`; RPC writes `template_override_id`. Update `mem/features/annual-review/per-employee-template-override.md` to note the new single-row destructive entry-point.
- Audit trail preserved by the RPC (`annual_review.instance_force_reset`).
- No RLS change; RPC is admin/hr_pms only server-side.

## Rollback
Remove the dropdown item + new dialog file + memory note. RPC and prior flows unchanged.

## Risk
Low — additive UI over an existing, already-audited destructive RPC. Same guardrails as the bulk path (min-10-char reason + typed "RESET" gate + two-step confirm).
