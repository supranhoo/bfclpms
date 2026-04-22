

## Plan — Add Multi-Step Confirmation Guard for "Clear All KPI Data"

The current flow has only a single AlertDialog with one click → destructive action fires. Per `mem://design/destructive-action-governance`, system-wide destructive operations require a hardened reconfirmation guard. "Clear All KPI Data" is the most destructive button in the entire app (wipes all KPIs, submissions, reviews) and is currently one mis-click away.

### Fix — Strong Triple-Lock Guard

Replace the existing single AlertDialog (lines 2193–2215 in `src/pages/admin/ImportData.tsx`) with a **two-stage hardened confirmation dialog**:

**Stage 1 — Warning Dialog**
- Big red warning icon + heading "Danger: This will erase all PMS data"
- Bullet list of exactly what gets deleted (KPIs, review_submissions, performance reviews, audit logs references, sub-period evidence, observations, queries — pulled from the existing `handleClearKpiData` scope)
- Display live row counts fetched on dialog-open (e.g., "You are about to delete **2,847 KPIs**, **9,231 submissions**, **412 reviews**") so the admin sees the blast radius
- "Cancel" button (default focus) and "I understand, continue" button

**Stage 2 — Type-to-Confirm Dialog**
- Requires the admin to type the exact phrase **`DELETE ALL KPI DATA`** (case-sensitive) into a text input
- Confirm button stays disabled until the typed text matches exactly
- A second checkbox: *"I have taken a backup or accept full responsibility for this irreversible action"* — must be checked
- Both gates required → only then the red "Permanently Delete" button enables
- On confirm: triggers `handleClearKpiData` (unchanged)

**Additional Safeguards**
- Audit-log a `BULK_KPI_DATA_CLEARED` row attributing the action to the admin (`performed_by = auth.uid()`) before the destructive query runs, capturing the row counts deleted — so the action is forensically traceable per `POLICY.md` audit mandate.
- Disable the trigger button entirely when `isClearing` is true (already done) and add a 3-second cooldown after dialog open before the Stage-1 "continue" button activates, preventing rage-click bypass.

### Files Changed

1. **`src/pages/admin/ImportData.tsx`** — replace the single `AlertDialog` block (lines 2193–2215) with the new two-stage guard. Add a small local `useState` for `confirmText`, `ackChecked`, `stage`, and `cooldownDone`. Add a `useQuery` (or one-off `supabase.from('kpis').select('id', { count: 'exact', head: true })` etc.) to fetch the live counts when the dialog opens.
2. **New helper component** `src/components/admin/ClearAllKpiDataDialog.tsx` — encapsulates the two-stage dialog so `ImportData.tsx` stays lean (separation of concerns per workspace policy). Props: `{ open, onOpenChange, onConfirm, isClearing }`.
3. **Migration** `supabase/migrations/<ts>_audit_bulk_kpi_clear.sql` — extend the `kpi_audit_logs.action` allow-list (if constrained) to include `BULK_KPI_DATA_CLEARED` and write the audit insert from inside `handleClearKpiData` before deletes execute.
4. **`DOCUMENTATION.md`** — v2.66.7.4 entry under "Destructive Action Governance" describing the new triple-lock for KPI data wipe.
5. **`POLICY.md`** — append rule §90: *"Bulk Data Wipe Operations require type-to-confirm + acknowledgement checkbox + cooldown; single AlertDialog is insufficient."*
6. **`mem://design/destructive-action-governance`** — add note: *"Bulk wipe actions (Clear All KPI Data, Clear All Reviews, etc.) require the two-stage `ClearAllKpiDataDialog` pattern: live row counts → type-to-confirm + checkbox + 3s cooldown."*

### Risk & Impact Report

- **Data Impact**: None — the destructive query itself is unchanged. Only adds a `BULK_KPI_DATA_CLEARED` audit row before deletion.
- **Workflow Impact**: Admins now require ~5 extra seconds and a typed phrase to wipe data. Intentional friction.
- **UI/UX**: Modernized destructive flow consistent with `ConfirmDestructiveDialog` governance; component is reusable for future bulk-wipe buttons.
- **Regression Risk**: Very low — the underlying `handleClearKpiData` and its mutation chain are untouched; only the dialog wrapper changes.
- **Mitigation**: Confirm button literally cannot fire until both gates pass; cooldown blocks accidental enter-key flows.

### Out of Scope

- Refactoring `handleClearKpiData` itself.
- Adding "Restore" or "Undo" capability (genuine deletes, not soft-delete).
- Applying the same guard to other destructive admin actions (deferred — would be a follow-up sweep).

### Deliverables

- New `ClearAllKpiDataDialog.tsx` component (two-stage, type-to-confirm, checkbox, cooldown, live counts).
- Patched `ImportData.tsx` integrating the new dialog.
- Migration adding `BULK_KPI_DATA_CLEARED` audit action + audit insert in handler.
- DOCUMENTATION.md v2.66.7.4, POLICY.md §90, memory update for destructive-action-governance.

