## Goal
Add an Admin-only **Clear Entry** button on Org KPI cards in `Organization KPI Data Entry`, so admins can remove entered values (and their supporting data: remarks, evidence, N/A flag) for KPIs in the **"Value Entered"** state — without needing the heavier rollback flow.

## Where it fits in the existing UI

On `/admin/org-kpi-data`, each KPI card (`OrgKpiEntryCard`) already has an admin action row containing **Unlock**, **Rollback**, **Bulk Rollback**, and **Remove from Org KPIs**. These work only in specific states:
- **Unlock / Rollback** → only when `status === 'propagated'`
- **Remove from Org KPIs** → only when `status !== 'propagated'`

**Gap today:** when a KPI is in the **"Value Entered"** state (data saved but not propagated), an admin can edit the number but cannot wipe the entry back to **Pending** in one click. Editing the input to empty does not reliably reset remarks, evidence, or N/A. This plan fills that gap.

## What "Clear Entry" does

For the selected KPI in the current period/year, when clicked by an Admin:

1. **Organization scope** — delete the single `org_kpi_values` row for `(category, kra, kpi, period, year, department=null, employee=null)`.
2. **Department scope** — delete all `org_kpi_values` rows for that definition + period where `department_id IS NOT NULL`.
3. **Employee scope** — delete all `org_kpi_values` rows for that definition + period where `employee_id IS NOT NULL`.
4. Reset associated UI state on the card: achieved value, remarks, evidence URL, N/A flag, sub-factors.
5. Write an audit log entry (`action: 'cleared'`, performed_by = current admin) so the action is traceable.
6. Invalidate React Query caches (`org-kpi-values`, `org-kpi-value`) so the card returns to **Pending** immediately.

**Does NOT touch** child employee `kpis` rows or `kpi_data` — because in the "Value Entered" state nothing has been propagated yet. (For propagated KPIs, the existing Rollback flow remains the correct tool.)

## Visibility & guardrails

- Button appears **only** when:
  - `isAdmin === true`
  - `status === 'entered'` (i.e. value exists but not propagated/approved)
  - period is **not** governance-locked
- For `propagated` / `approved` → the existing **Unlock** + **Rollback** buttons remain the path; Clear Entry is hidden.
- For `pending` → no entry exists, button is hidden.
- Confirmation via `AlertDialog` (same pattern as Remove from Org KPIs / Rollback) listing exactly how many rows will be cleared and warning the action is irreversible.

## Technical Implementation

**1. New hook `useClearOrgKpiEntry` in `src/hooks/useOrgKpiValues.ts`**
- Input: `{ categoryId, kraName, kpiName, reviewPeriod, reviewYear, scope }`
- Builds a Supabase `.delete()` query on `org_kpi_values` filtered by the 5 identity columns; for `department`/`employee` scope, returns deleted count.
- On success → invalidate `['org-kpi-values']`, `['org-kpi-value']`, `['org-level-kpis-with-employees']`.
- On error → toast (reuse existing pattern in `useDeleteOrgKpiValue`).

**2. Wire prop into `OrgKpiEntryCard`** (`src/components/admin/OrgKpiEntryCard.tsx`)
- Add optional `onClearEntry?: () => Promise<void>` prop.
- Render a new button between **Unlock** and **Remove from Org KPIs** in the admin action row (~line 614–760), gated by `isAdmin && data.status === 'entered' && !governanceLocked`.
- Use `Eraser` icon from `lucide-react`, label **"Clear Entry"**, wrapped in `AlertDialog` with body:
  > "This will permanently remove the entered value, remarks, evidence and N/A flag for this KPI in {period} {year}. The KPI returns to Pending. This action cannot be undone."
- On confirm → call `onClearEntry`, then locally reset `achievedValue`, `remarks`, `evidenceUrl`, `isNa`, `scopedValues` to empty.

**3. Wire handler in `OrgKpiDataEntry.tsx`** (~line 1499 area, alongside `onRemoveFromOrg`)
- Call the new hook; on success, also write a row via `insertAuditLogs` with `action: 'cleared'` (matching the existing `unlocked` audit pattern at line 1456–1465) and show toast `"Entry cleared — KPI back to Pending"`.

**4. RLS / security**
- Existing RLS on `org_kpi_values` already gates DELETE to admins / owners; no policy changes needed. Confirm by reading the table policy before merging.

**5. Audit + Documentation**
- Update `DOCUMENTATION.md` Org KPI section + version-history entry: "Admin Clear Entry on Org KPI Data Entry cards (state: entered)".
- No `POLICY.md` change — this is an admin-recovery action, not a policy shift.

## Risk & Impact Report

- **Data Impact:** Deletes rows in `org_kpi_values` only for non-propagated entries. No FK cascades into `kpis`/`kpi_data`. Audit log preserves the deletion.
- **Workflow Impact:** None for end users — only the admin's reset path changes. Propagated/approved flows untouched.
- **UI/UX:** Adds one button to an already-existing admin button row; matches existing destructive-action dialog pattern (per the `Destructive Action Governance` memory).
- **Regression Risk:** Low. New hook is isolated; visibility guard prevents accidental use on propagated rows. Card local-state reset prevents stale optimistic UI.
- **Mitigation:** AlertDialog confirmation + status-gated visibility + audit log + governance-lock check.

## Out of scope (for future)

- Per-row Clear inside the scoped employee/department table (would require row-level delete UI in `OrgKpiScopedEntryTable`).
- Bulk Clear across multiple KPIs at once.

Reply **approve** to switch to build mode and implement.