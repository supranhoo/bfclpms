## Goal
Make **Step back** functional per-row from the three-dot menu on the Annual Review Admin → Progress table (image), reusing the existing send-back-to-previous-stage service used by "Bulk send back".

## Scope
- File: `src/pages/annual-review/AnnualReviewAdmin.tsx` only (UI + wiring).
- Backend: no changes. Uses `useSendBackStatus` → `svc.sendBackStatus(instanceId, role, reason)` already in place.

## Behavior
1. In the row `DropdownMenu` (line ~840), add a new item **"Step back to previous stage"** (icon `Undo2`) shown only when the instance is on a stage that has a previous stage in the configured chain — i.e. `overall_status` is one of `pending_manager | pending_skip | pending_dept | pending_bu | pending_hr` (excludes `not_started`, `pending_self`, `completed`).
2. Clicking opens a small confirmation `AlertDialog` (row-scoped state `stepBackFor: instance | null`) with:
   - Title showing employee name + current stage → previous stage (derived via `prevStatus(role, instance.enabled_stages)` from `@/lib/annualReview/stageChain`).
   - Optional reason textarea.
   - Confirm button "Step back" (disabled while pending).
3. Confirm calls the existing `useSendBackStatus().mutateAsync({ instanceId, role, reason })`; on success show toast, close dialog, invalidate queries (same pattern as bulk send back).
4. Fix latent bug in `bulkSendBack` roleMap: add `pending_dept: 'dept_head'` (currently missing, so dept-head stage rows are silently skipped from bulk send back too).

## Technical
- Reuse imports: `Undo2` already imported; `AlertDialog*` already imported (used by bulk).
- Add local state:
  ```ts
  const [stepBackFor, setStepBackFor] = useState<AnnualReviewInstance | null>(null);
  const [stepBackReason, setStepBackReason] = useState('');
  ```
- Compute `role` and previous-stage label in the dialog via existing `roleMap` and `prevStatus` helper (import `prevStatus` from `@/lib/annualReview/stageChain`; already imported for `describeChain`? verify — if not, add).
- Menu item rendered inside existing `DropdownMenuContent` after "Finalize / View", gated by `canStepBack = role != null` where `role = roleMap[i.overall_status]`.

## Verification
- Typecheck clean.
- Manual: on `test003` row (currently `Dept Head Review Pending`) → three-dots → "Step back to previous stage" → confirm → stage returns to `pending_skip` (or the previous enabled stage per chain), toast shown, table refreshes.
- Bulk send back now also handles dept-head-pending rows.

## Out of scope
- Full ADR-049 "select any prior stage" chooser and "Clear all review data" reset — not requested here; can be a follow-up.
- No policy/schema changes.
