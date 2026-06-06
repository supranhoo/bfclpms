## Goal
On `/admin/org-kpi-data`, disable the 2-second debounced autosave currently driving every field change (Achieved, Remark, N/A, Evidence, scoped rows) and replace it with explicit **Save** buttons — one per scoped row in the Actions column, and one card-level Save for organization-scope KPIs.

## Scope (surgical)
- File: `src/components/admin/OrgKpiEntryCard.tsx` — remove autosave wiring, add manual save.
- File: `src/components/admin/OrgKpiScopedEntryTable.tsx` — render per-row Save button in Actions column; show row-level dirty/saved/error state.
- No backend/RPC/RLS changes. No schema migration. `onSave(getValues())` contract is unchanged — only its trigger changes.
- Out of scope: Self-review/Daily entry dialogs, Incentive grids, Safety modules.

## Behavior changes
1. **Typing in any field** (Achieved, Remark, N/A toggle, Evidence URL, scoped Achieved/Remark/N/A/Evidence) no longer schedules a save. It marks the row/card *dirty* and shows an amber "Unsaved" pill (replacing today's "Saving…/Saved" pill).
2. **Per-scoped-row Save** button (new) appears in the existing **Actions** column for any row whose local state diverges from the snapshot. Disabled when row is clean. On click: calls existing `onSave(getValues())` (which already upserts only touched scope IDs via `touchedScopeIdsRef`) and reports row-level toast.
3. **Card-level Save** button (new) for org-scope KPIs appears under the inputs, mirroring scoped-row behavior. Disabled when clean.
4. **Propagate** action stays as-is but is **disabled while dirty** with tooltip "Save before propagating". Today it implicitly waited for autosave; the new contract is explicit.
5. **Navigation guard**: `beforeunload` warning when any card is dirty (Card already tracks `isDirtyRef`; lift to a parent dirty-set via context or a small `useUnsavedChanges` hook).
6. **Evidence upload** — file uploads still persist the URL to storage immediately (existing behavior of `OrgKpiFileUpload`), but the *write of the URL into the OKV row* now waits for Save. Mark row dirty on upload-complete instead of triggering autosave.

## Risk & Impact
- **Data loss risk** — users currently rely on the fire-and-forget autosave. Mitigations:
  - Persistent "Unsaved" pill per row + card.
  - `beforeunload` confirm dialog when any card dirty.
  - Toast on successful save: "Saved <employee name>".
- **Propagate UX regression** — today users can edit → propagate quickly (autosave races). New: explicit Save required first. Acceptable because user opted into "disable autosave entirely".
- **Performance** — strictly improves (fewer DB writes; no debounce timers).
- **Scalability** — no change; same `onSave` contract.
- **Regression scope** — all field paths in `OrgKpiEntryCard` that call `triggerAutoSave()` (currently 7 callsites) must be flipped to `markDirty()`. Audit complete.
- **Rollback** — single-revert; no data migration.

## Implementation steps
1. Replace `triggerAutoSave` with `markDirty(scopeId?)` in `OrgKpiEntryCard.tsx`:
   - For org-scope: card-level dirty flag.
   - For scoped rows: per-`scopeId` dirty set (re-use existing `touchedScopeIdsRef`).
   - Remove `autoSaveTimerRef` and its `setTimeout` chain.
2. Expose `dirtyScopeIds`, `isCardDirty`, `handleSaveRow(scopeId)`, `handleSaveCard()` to the scoped table via existing props pattern (add `onSaveRow` + `dirtyScopeIds` to `OrgKpiScopedEntryTableProps`).
3. In `OrgKpiScopedEntryTable.tsx`:
   - Add a `Save` `Button` (icon `Save`, size `sm`) in the Actions cell of `EmployeeRow` / `DepartmentRow`, ahead of the existing Propagate cell. Disabled unless `dirtyScopeIds.has(row.scopeId)`. Show spinner while pending.
   - Update the Propagate `disabled`/tooltip logic: if `dirtyScopeIds.has(row.scopeId)`, disable with tooltip "Save row before propagating".
4. Add **card-level Save button** for org-scope (next to the existing controls under the Remark input). Same disabled-when-clean rule.
5. Replace the existing `saveStatus` pill copy: `idle | unsaved | saving | saved | error`. Amber pill for `unsaved`.
6. Add `useUnsavedChanges` lightweight hook (only registers `beforeunload` when any consumer is dirty) — placed in `src/hooks/useUnsavedChanges.ts`.
7. Update `OrgKpiDataEntry.tsx` only if a parent-level dirty registry is needed for the `beforeunload` aggregation (single import).

## Tests (Vitest)
- `src/test/orgKpiEntryCard.manualSave.test.tsx`:
  - Editing remark does NOT call `onSave`.
  - Editing remark sets `unsaved` pill and enables Save button.
  - Clicking Save calls `onSave` with current values and clears dirty state.
  - Propagate is disabled while dirty.
  - N/A toggle marks dirty without saving.
- `src/test/orgKpiScopedEntryTable.rowSave.test.tsx`:
  - Per-row Save button appears only for dirty rows.
  - Save click invokes `onSaveRow(scopeId)`.
- `src/test/useUnsavedChanges.test.ts`: registers/unregisters `beforeunload`.

## Documentation & policy
- `DOCUMENTATION.md` — Org KPI Data Entry section: document manual-save contract + Save button locations.
- `POLICY.md` — add section: "Org KPI Data Entry uses explicit Save; autosave is forbidden on this surface."
- New ADR: `docs/adr/ADR-075.md` — "Org KPI Data Entry: explicit Save replaces 2s autosave".
- Memory: update `mem/features/admin/org-kpi-data-entry-snapshot.md` with a "Save model: manual" rule so future agents don't re-introduce autosave.

## UI summary (for reviewer)
- **What changes visually**:
  - Each scoped row gains a small **Save** icon-button in the Actions column (left of Propagate).
  - Org-scope cards get a **Save** button under the Remark/Evidence inputs.
  - Status pill copy: "Unsaved" (amber) replaces silent autosave; "Saved" toast after manual save.
  - Propagate buttons show a tooltip ("Save before propagating") when dirty.
- **Location**: `/admin/org-kpi-data` only.
- **Responsiveness**: Save icon-button reuses existing 32×32 touch target — fits the action column at all breakpoints already used by Propagate.
- **Interaction impact**: One extra click per edited row before Propagate; navigating away while dirty prompts a confirm dialog.

## Files
- Edit: `src/components/admin/OrgKpiEntryCard.tsx`, `src/components/admin/OrgKpiScopedEntryTable.tsx`, `src/pages/admin/OrgKpiDataEntry.tsx` (small wire-up only), `DOCUMENTATION.md`, `POLICY.md`.
- Create: `src/hooks/useUnsavedChanges.ts`, `src/test/orgKpiEntryCard.manualSave.test.tsx`, `src/test/orgKpiScopedEntryTable.rowSave.test.tsx`, `src/test/useUnsavedChanges.test.ts`, `docs/adr/ADR-075.md`, `mem/features/admin/org-kpi-data-entry-manual-save.md`.
- NOT touched: any RPC, any other data-entry surface, scoring/propagation logic, evidence targeting, snapshot RPC.
