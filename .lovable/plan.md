## Problem (Root Cause)

`src/components/admin/OrgKpiFileUpload.tsx` attaches a `paste` listener on the **closest dialog (or `document`)** for every row that has no file yet. With 50 employees, 30+ row instances all listen on the same element. When the user presses Ctrl+V:

- The browser fires `paste` once on the dialog.
- Every row's listener runs in DOM-registration order.
- The first one calls `stopImmediatePropagation()` and uploads the file.

Result: the paste lands on the **first empty row in the DOM**, not the row the user intended. It looks "random" because adding/removing rows or evidence shifts which listener registers first. There is no concept of an "active" upload target.

## Fix

Make paste row-scoped instead of dialog-scoped. Only the row the user is actively interacting with should receive the pasted file.

### Changes

**`src/components/admin/OrgKpiFileUpload.tsx`** (single file, presentation only)

1. Wrap the Upload button in a focusable container (`tabIndex={0}`, `role="button"`, `aria-label="Paste or upload evidence"`) with a visible focus ring using existing tokens (`focus-visible:ring-2 ring-ring`).
2. Replace the dialog-wide paste listener with a **row-local** model:
   - Track `isArmed` state, set true on `focus` / `mouseenter` / `click` of the container, false on `blur` / `mouseleave`.
   - Attach the `paste` listener to the container element itself (not document/dialog) only while `isArmed`.
   - Keep `stopImmediatePropagation` so a textarea paste in the same row doesn't double-fire, but since the listener is on the row container it will only fire when the row is focused/hovered.
3. Hint text updates: show `or Ctrl+V` only when the row is armed (focused/hovered) so users see which row will receive the paste; otherwise show muted `Paste here`.
4. Keep file-size + upload logic identical (no business-logic change).

### What stays the same

- Upload path, naming, bucket, size validation, toasts, `onUploadComplete` contract — unchanged.
- Callers (`OrgKpiScopedEntryTable`, `OrgKpiEntryCard`) — no prop changes required.
- `existingUrl` view mode — unchanged.

## Risk & Impact

- **Data**: none. No schema, RLS, or storage changes.
- **Workflow**: none. Same upload outcome, just routed to the correct row.
- **UI/UX**: small visible focus ring + dynamic hint text. Improves clarity.
- **Regression risk**: low. Only `OrgKpiFileUpload.tsx` changes; behaviour for the file-already-uploaded branch is untouched. Other paste consumers (`MultiFileUpload`, `EvidenceUpload`, `EmployeeContactCard`) are not modified.
- **Mitigation**: manual QA with 50-row dialog — focus row A, Ctrl+V → file lands on A; focus row B, Ctrl+V → file lands on B; click outside any row, Ctrl+V → no upload (silent, expected).

## Out of scope

- No changes to `MultiFileUpload`, `EvidenceUpload`, dashboard KRA management rollback, or any business logic.
- No new admin settings.
