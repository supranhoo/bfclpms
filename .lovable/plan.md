# Plan: Edit HR Review Notes

The backend already supports updates (`useUpdateReviewNote` + `updateReviewNote` RPC). We just need a UI affordance and a sheet to edit existing notes. The cleanest route is to refactor `AddReviewNoteSheet` into a dual-mode sheet (create or edit) so we don't duplicate the form.

## Risk & Impact Report

- **Data Impact**: None. Uses existing `update` path; `applicable_from` already snaps to first-of-month server-side.
- **Workflow Impact**: Editing is gated by `useReviewNoteAccess().canEdit` (admin always allowed; creator/assignee always allowed via RLS). Status FSM unchanged.
- **UI/UX**: Adds one pencil icon in the Actions column on `/hr/review-notes`. Sheet layout reused — no visual drift.
- **Regression Risk**: Low. Sheet refactor changes prop surface; only one caller exists today (`ReviewNotes.tsx`) plus the inline `ReviewNoteTrigger` (create-only — keep behaviour identical).
- **Mitigation**: Add a unit test for the edit branch of the mutation hook (alongside existing `statusFsm.test.ts`); preserve the old "create" prop signature exactly so `ReviewNoteTrigger` keeps compiling.

## Changes

### 1. `src/components/reviewNotes/AddReviewNoteSheet.tsx`
- Add optional `mode?: 'create' | 'edit'` (default `'create'`) and `note?: ReviewActionNote` props.
- When `mode === 'edit'`:
  - Pre-fill state from `note` on open (title, details, category, priority, applicable_from, subject).
  - Hide employee picker (subject is immutable post-creation).
  - Title becomes "Edit Review Note"; primary button "Save Changes".
  - Call `useUpdateReviewNote().mutateAsync({ id, patch })` instead of create.
- Reset effect keys on `[open, mode, note?.id]`.

### 2. `src/pages/hr/ReviewNotes.tsx`
- Add state `const [editing, setEditing] = useState<ReviewActionNote | null>(null)`.
- In the Actions cell, render a `Pencil` icon button before the trash button, gated by `access.canEdit`, that sets `editing` to the row.
- Render a second `<AddReviewNoteSheet mode="edit" note={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />`.

### 3. `src/components/reviewNotes/ReviewNoteTrigger.tsx`
- No change. Keeps create-only behaviour.

### 4. Tests — `src/test/reviewNotes/edit.test.ts` (new)
- Verify `updateReviewNote` is called with the patched fields.
- Verify `applicable_from` is snapped to first-of-month on edit.
- Verify subject_employee_id is not included in the patch.

### 5. Docs / Memory
- Update `mem/features/hr/review-action-notes.md`: under "Surfaces" note that rows have a Pencil edit action gated by `canEdit`, opening `AddReviewNoteSheet` in `mode="edit"`.
- Append a one-line entry to `DOCUMENTATION.md` "Version History" describing the inline edit affordance.

## Out of scope
- Bulk edit, audit log of edits, field-level permission gating beyond existing `canEdit`.
- Editing the subject employee on an existing note (intentionally locked).
