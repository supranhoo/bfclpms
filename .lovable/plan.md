
## Goal

Make BU Head assignment a first-class column on the **Business Units** tab (no separate detour), and let admins pick **any active employee** as a BU head — not just employees whose department lives inside that BU.

## Assumptions

- The existing RPCs (`set_bu_head`, `recalculate_bu_head`) and audit logging stay as-is. `set_bu_head` does not server-validate that the picked user belongs to the BU, so widening the picker is purely a UI change — no DB migration needed.
- `recalculate_bu_head` still re-derives from the BU's own hierarchy (top of the reporting chain among active employees in that BU). That auto-derivation logic is **unchanged**.
- The HR Finalization card (HR business unit + HR head) keeps its current behaviour and home.

## Risk & Impact Report

- **Data Impact**: None. Same tables, same RPCs, same audit trail (`org_heads.bu_head_set`). `head_source` still flips to `'manual'` on override and back to `'auto'` on recalc.
- **Workflow Impact**: Annual Review reviewer chain keeps reading `business_units.head_user_id`. No change there.
- **UI/UX**: The dedicated "Org Heads" tab is retired for BU heads. The Business Units tab gains a "Head" column and inline actions. HR Finalization moves to its own slimmed tab.
- **Regression Risk**: Low. Existing imports of `OrgHeadsTab` come from `Organization.tsx` only; the component is split, not deleted, so other callers (if any) stay safe.
- **Mitigation**: Keep all writes routed through the existing service (`setBuHead`, `recalculateBuHead`). Reuse the same confirmation dialog and audit trail. Search/select widget is virtualised-friendly (capped at 200 visible results) to keep large employee directories snappy.

## UI Changes

### 1. Business Units tab — new layout

````text
┌ Business Units ──────────────────────────────────────────────────────────┐
│ Name        Code   Division   Departments   Employees   Head           ⋯ │
│ Furnace     FUR    Ops         4             82          Ravi K. [Auto] ✎│
│ HR          HR     Corp        2             15          —      [Auto] ✎│
└──────────────────────────────────────────────────────────────────────────┘
````

- Insert **"Head"** column between *Employees* and *Actions*.
- Cell shows: head name + employee code, plus `Auto`/`Manual` badge. `—` (with subtle ShieldAlert icon) when unset.
- New row-level menu/buttons (compact):
  - `Recalculate` — calls `recalculateBuHead(bu.id)`.
  - `Change…` — opens the head-picker dialog.

### 2. Head-picker dialog — broadened scope

- Source list is now **all active employees** (company-scoped via `activeCompanyId` when available), not just employees inside that BU.
- Search by name / employee code (existing behaviour).
- Each row in the dropdown shows: `Full Name (EMP_CODE) — Department · BU` so admins can see where the candidate sits.
- Optional helper line: *"Tip: usually the BU's own top manager. Pick outside the BU only for special structures (e.g., matrix reporting)."*
- Reason field stays mandatory (min 3 chars). Save still calls `setBuHead`.

### 3. Tabs cleanup

- Rename `"Org Heads"` tab → `"HR Finalization"` and render only the HR card there.
- Remove BU-heads card from that tab (now lives inside Business Units).
- Update `ORG_TAB_DEFS` label + count badge (HR tab no longer mirrors BU count).

## Technical Plan

1. **Refactor `src/components/admin/OrgHeadsTab.tsx`** into two small components in the same folder:
   - `BuHeadCell.tsx` — read-only cell renderer (name + Auto/Manual badge) reused by the new column.
   - `BuHeadActions.tsx` — Recalculate + Change buttons wired to `recalculateBuHead` / opens the picker dialog.
   - `BuHeadPickerDialog.tsx` — extracted dialog. Accepts `bu`, `allEmployees`, `onClose`. Source pool = active profiles filtered by `activeCompanyId` (no BU restriction); displays dept + BU context.
   - `HrFinalizationCard.tsx` — extracted from current OrgHeadsTab (HR section only).
2. **`src/pages/admin/Organization.tsx`**
   - Add a `head` lookup map (`buId → BuHeadRow`) from `listBuHeads` query (already used inside OrgHeadsTab).
   - Add `Head` column to the Business Units `<Table>` using `BuHeadCell` and `BuHeadActions`.
   - Replace `<OrgHeadsTab>` render under `org-heads` with `<HrFinalizationCard companyId={activeCompanyId} />`.
   - Rename tab label `'Org Heads' → 'HR Finalization'`; drop `org-heads` count override.
3. **Picker data source**: build an `allActiveProfiles` list from existing `useProfiles()` (already loaded on the page) joined with `departments` + `businessUnits` for the context label. No new query.
4. **No DB / RLS / migration changes.** No edge-function changes.

## Tests & Mock Data

- Unit test (`src/components/admin/__tests__/BuHeadPickerDialog.test.tsx`): renders with mock profiles spanning multiple BUs, asserts (a) all active employees appear, (b) inactive employees are filtered out, (c) Save is disabled until both a user and a ≥3-char reason are provided, (d) Save calls `setBuHead` with the right args.
- Extend `src/test/orgHeadsSeederIntegration.test.ts` with a case where `business_units.head_user_id` points to a user **outside** that BU — the reviewer-chain resolver must still honour it (proves cross-BU assignments don't break Annual Review seeding).
- Mock data: 3 BUs, 2 active + 1 inactive employee in each, plus 1 active employee in a different BU used as a cross-BU head.

## Documentation & Policy Updates

- **DOCUMENTATION.md** → "Org Heads" section: note new placement (BU tab) and that the picker accepts any active employee.
- **POLICY.md** → BU Head policy: "BU Head defaults to the top of the BU's own reporting hierarchy. Admin/HR PMS may override with any active employee (cross-BU allowed) with a reason; override is audit-logged and flips source to Manual until Recalculate is run."
- **`mem/features/admin/org-heads.md`** → update UI section to reflect new home and broadened picker.

## Rollback

Pure UI/component refactor. Reverting the component changes and restoring the old `<OrgHeadsTab>` import in `Organization.tsx` fully restores prior behaviour. No data migration to undo.
