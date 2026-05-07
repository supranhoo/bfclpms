## Risk & Impact Report

- **Data impact:** No schema, RLS, storage bucket, or historical data changes. This only changes frontend paste routing before the same existing upload call.
- **Workflow impact:** No permission or review workflow changes. Users can still use the Upload button; Ctrl+V will target the active employee row.
- **UI/UX consistency:** Minimal UI change. The existing Upload / Ctrl+V hint remains, but the whole editable row will become the paste target instead of only the tiny upload control.
- **Regression risk:** Low-to-medium because this touches keyboard paste behavior near remark textareas. Mitigation: only intercept paste when the clipboard contains files, so normal text paste into remarks continues normally.
- **Mitigation plan:** Add a small reusable paste helper and unit tests covering image/file paste, text-only paste, disabled/existing-file states, and target-row routing.

## Root Cause

The current fix arms Ctrl+V only when the mouse/focus is on the tiny `OrgKpiFileUpload` wrapper. In the screen shown, the user is focused inside the remarks textarea, so the upload wrapper is not armed. When Ctrl+V is pressed, the paste event goes to the textarea, not to the attachment control, so no attachment upload is triggered.

## Implementation Plan

1. **Extract paste-upload handling from the tiny upload button**
   - Keep `OrgKpiFileUpload` responsible for file selection/upload UI.
   - Add optional props so a parent row can register a pasted file against that same upload logic.
   - Ensure only clipboard file pastes are intercepted; text-only pastes are ignored and continue into the textarea/input.

2. **Make the employee row the paste target**
   - Update `OrgKpiScopedEntryTable.tsx` where employee rows render.
   - Track the active/hovered/focused row by `scopeId`.
   - Add a capture-phase row paste handler on the row or row content area.
   - If clipboard has a file and the row is not N/A / not disabled / has no existing evidence, upload to that row’s `evidenceUrl`.
   - This makes Ctrl+V work while the cursor is in the remarks field, matching the screenshot.

3. **Keep normal typing/pasting safe**
   - If clipboard contains plain text and no files, do not call `preventDefault`.
   - Remarks text paste keeps working exactly as before.
   - If a file is too large, show the existing toast.

4. **Cover the secondary card usage**
   - Review `OrgKpiEntryCard.tsx` and keep current behavior or wire the same helper where needed so the non-table org KPI entry path does not regress.

5. **Add regression coverage**
   - Add unit tests for the paste helper:
     - file paste is accepted and returns the first file;
     - text-only paste is ignored;
     - disabled/existing evidence states reject upload;
     - oversized file triggers the existing size guard path.

## Expected Result

Ctrl+V will upload the pasted attachment to the employee row the user is actively editing/hovering, instead of requiring focus on the tiny Upload button.