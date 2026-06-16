
# Consolidate Annual Review Admin toolbar — Download / Upload only

## Goal
Replace the 5 highlighted toolbar buttons on `AnnualReviewAdmin` with just two:

1. **Download data** (covers today's *Export to Excel* + new download templates for each bulk operation)
2. **Upload data** (covers *Bulk system-score upload*, *Bulk template assignment*, *Bulk workflow assignment*, *Bulk stage weights*)

The user picks the dataset *inside* each dialog. Same capabilities, fewer entry points, lower cognitive load.

## Assumptions
- No change to underlying services, RPCs, RLS, or audit behaviour — purely a UI surface refactor.
- All four bulk dialogs already accept Excel input today (`SystemScoresUploadDialog`, `BulkTemplateAssignmentDialog`, `BulkWorkflowAssignmentDialog`, `BulkStageWeightsAssignmentDialog`). We keep those engines, just wrap entry under one shell.
- "Export to Excel" today exports the progress grid. That becomes the *Progress snapshot* download option.
- Role gating (Admin / HR PMS) and disabled rules (e.g. system-score upload requires `uploadTemplate`) are preserved per-dataset inside the new dialogs.

## Clarifications
None blocking — the request is explicit. If you'd rather keep "Send reminders now" outside the consolidation (it's a different verb), say so; the current plan leaves it untouched.

## Risk & Impact Report
- **Data Impact:** None. No schema, RLS, or service changes.
- **Workflow Impact:** Same actions, fewer clicks-to-discover, +1 click-to-execute (dataset picker step). Net neutral-to-positive.
- **UI/UX:** Toolbar shrinks from 6 → 3 buttons (Send reminders / Download / Upload). Consistent iconography.
- **Regression Risk:** Low. Existing dialogs are reused as-is and mounted from a new wrapper. Risk concentrated in: (a) disabled-state logic per dataset, (b) reset of dataset picker on close.
- **Scalability:** No change — server-side pagination and existing export batching untouched.
- **Mitigation:** Unit tests for the new wrapper's dataset routing + disabled states; keep underlying dialogs unchanged so their existing tests still cover them.

## Step-by-step plan

1. **New wrapper: `AdminDataActionsDialog.tsx`** (single file, two modes)
   - Props: `open`, `onOpenChange`, `mode: 'download' | 'upload'`, plus the same context props the current 4 dialogs need (`cycle`, `instances`, `templatesById`, `onRefresh`, `uploadTemplate`, filter snapshot for export).
   - Renders a small radio/segmented list of datasets:
     - **Download mode:** `Progress snapshot (xlsx)`, `System-score template`, `Template assignment sheet`, `Workflow assignment sheet`, `Stage weights sheet`.
     - **Upload mode:** `System scores`, `Template assignments`, `Workflow assignments`, `Stage weights`.
   - On dataset select → renders the matching existing dialog body inline (or, simplest: delegates by opening the existing dialog and closing the wrapper). Recommended: **delegate** — keeps blast radius minimal.
   - Each option shows a one-line description and a "disabled reason" when not actionable (e.g. *"Requires an active template with system-score config"* for system-score upload).

2. **Toolbar refactor in `AnnualReviewAdmin.tsx`**
   - Remove the 4 bulk buttons + the standalone *Export to Excel* button.
   - Add two buttons: `Download data` (icon: `Download`) and `Upload data` (icon: `Upload`).
   - Wire to new state `actionsDialog: null | 'download' | 'upload'`.
   - Keep `Send reminders now` as-is.
   - Keep the per-row context menu actions and the selection action bar (Bulk send back / Bulk finalize) untouched — those are *selection-driven*, not dataset-driven, so they don't belong in this consolidation.

3. **Download routing**
   - `Progress snapshot` → reuses today's `exportProgress(...)` flow verbatim (including the current filter snapshot annotations).
   - The other four download options call small new helpers `downloadXTemplate()` that generate the *exact* xlsx schema each upload dialog already expects. Where a "download template" helper already exists in the upload dialog, expose it; otherwise add one alongside the dialog file.
   - All downloads run through a single progress/toast surface in the wrapper.

4. **Upload routing**
   - Selecting a dataset opens the matching existing dialog (`SystemScoresUploadDialog`, `BulkTemplateAssignmentDialog`, `BulkWorkflowAssignmentDialog`, `BulkStageWeightsAssignmentDialog`) with its current props. Wrapper closes itself when it hands off.

5. **Tests** (`src/test/annualReview/adminDataActions.test.tsx`)
   - Renders wrapper in `download` mode → shows 5 options; clicking *Progress snapshot* invokes the export service mock.
   - Renders wrapper in `upload` mode → shows 4 options; system-score row is disabled with the expected reason when `uploadTemplate` is null.
   - Toolbar test: only `Send reminders`, `Download data`, `Upload data` are present.
   - Existing 87 annual-review tests must still pass unchanged.

6. **Docs & policy sync**
   - `DOCUMENTATION.md` → Admin toolbar section: replace the 5-button list with the 2-action consolidated description + dataset matrix.
   - `POLICY.md` → note that bulk operations are dataset-picker driven; role/disabled rules unchanged.
   - Add an ADR entry under `docs/adr/` (next free number) capturing the UX rationale and that no data contracts changed.

## UI Changes (explicit)
- **Location:** Top-right action cluster of `AnnualReviewAdmin` page header.
- **Before:** `Send reminders now · Export to Excel · Bulk system-score upload · Bulk template assignment · Bulk workflow assignment · Bulk stage weights` (6 buttons).
- **After:** `Send reminders now · Download data · Upload data` (3 buttons).
- **New dialog:** Centered modal, title `Download data` or `Upload data`, body = vertical list of dataset cards (icon · label · one-line helper · disabled hint when applicable), footer = `Cancel` only (selection itself is the primary action).
- **Responsiveness:** 3 buttons wrap cleanly on narrow screens; dialog uses existing `Dialog` component (already responsive).
- **Interaction:** One extra click vs. today, but discoverability is higher because every bulk dataset is listed in one place with its description.

## Implementation notes
- Reuse existing dialog components — do not re-implement their forms.
- Centralize dataset metadata in a single `ADMIN_DATA_DATASETS` array so adding a new dataset later is one entry, not new buttons.
- Keep `exportProgress` exactly as-is; only its caller moves.

## Rollback
Pure UI change. Revert the toolbar JSX and delete the wrapper file to restore the previous surface — no data migrations involved.

## Not Applicable
- Backup coverage (no schema change)
- Offline resilience (no new write paths)
- Pagination (existing service-layer pagination untouched)
