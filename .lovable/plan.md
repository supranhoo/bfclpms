## Goal
Move **General Eligibility** and **Increment Slabs** from standalone sidebar pages into **System Settings → Increment** as two new tabs, placed to the right of **Increment Method**. Keep **Increment Inputs** as a sidebar item (it's a data-entry/run page, not config).

## Risk & Impact
- **Data**: None. Schema unchanged; same hooks/tables reused.
- **Workflow**: Admin/HR PMS configuration now centralized under System Settings (matches existing Eligibility Criteria + Increment Method pattern).
- **UI/UX**: Sidebar simplified (2 fewer items). Existing deep links to `/increment/general-eligibility` and `/increment/increment-slabs` redirect to `/admin/system-settings?section=increment&tab=<slug>`.
- **Regression**: Low. Refactor page bodies into reusable section components; thin route wrappers remain for backwards compatibility.

## UI After Change

**Sidebar (Administration group)** — only this stays:
```text
⚙  System Settings
↳  Increment Inputs          ← kept (data entry + run)
```
Removed: `General Eligibility`, `Increment Slabs`.

**System Settings → Increment** — tab bar gains two tabs on the right:
```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Eligibility Criteria │ Increment Method │ General Eligibility │ Increment Slabs │
└──────────────────────────────────────────────────────────────────────────┘
```
Tab contents reuse the existing UI verbatim (AY selector, Copy Previous Year, version history, slab grid, etc.) — no visual redesign.

## Implementation Steps

1. **Extract section components** (presentation move only, no logic change):
   - `src/components/admin/scoring/GeneralEligibilitySection.tsx` — body of `src/pages/increment/GeneralEligibility.tsx` minus the outer `PageHeader`.
   - `src/components/admin/scoring/IncrementSlabsSection.tsx` — body of `src/pages/increment/IncrementSlabs.tsx` minus the outer `PageHeader`.

2. **Wire tabs into System Settings** (`src/pages/admin/SystemSettings.tsx`, ~L629):
   - Add `<TabsTrigger value="general-eligibility">General Eligibility</TabsTrigger>` and `<TabsTrigger value="increment-slabs">Increment Slabs</TabsTrigger>` after "Increment Method".
   - Add matching `<TabsContent>` rendering the two new sections.
   - Honor `?tab=` query param so deep links land on the right tab.

3. **Sidebar cleanup** (`src/components/layout/AppSidebar.tsx`):
   - Remove the `General Eligibility` and `Increment Slabs` entries. Keep `Increment Inputs`.

4. **Route redirects** (`src/App.tsx`):
   - Replace `/increment/general-eligibility` → `<Navigate to="/admin/system-settings?section=increment&tab=general-eligibility" replace />`
   - Replace `/increment/increment-slabs` → `<Navigate to="/admin/system-settings?section=increment&tab=increment-slabs" replace />`
   - Delete the now-unused page files `src/pages/increment/GeneralEligibility.tsx` and `src/pages/increment/IncrementSlabs.tsx`.

5. **Verify** existing tests for the underlying hooks still pass; add a small smoke check that the new tabs render.

## SSOT Updates
- `DOCUMENTATION.md`: update Increment module location (now fully under System Settings → Increment).
- `POLICY.md`: no policy change — only UI surface relocation.
- Memory note appended to `mem/features/admin/increment-eligibility-exclusions` clarifying the new tab home.

## Not Applicable
- Schema / RLS / backup changes.
- New business logic.