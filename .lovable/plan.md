

# Fix: Data Owner Page Width Overflow from Long KPI Names

## Problem

In the "Data Owners" tab, each KPI row uses `truncate` on the KPI name, but the parent flex container still allows long text to push the card wider than the viewport.

## Fix

### File: `src/components/admin/OrgKpiOwnerManagement.tsx`

1. **KPI name (line 171)**: Change from `truncate` to `whitespace-pre-wrap break-words` so long KPI names wrap to multiple lines instead of overflowing
2. **KRA name (line 172)**: Same change -- wrap instead of truncate
3. **Row container (line 169)**: Add `min-w-0 overflow-hidden` to the flex row to enforce width constraints
4. **Card root**: Add `min-w-0 overflow-hidden` to the Card component to prevent children from expanding it

### File: `src/components/admin/OrgKpiOwnerDialog.tsx`

Apply the same `break-words` treatment to the KPI info section inside the dialog (line ~75) so the dialog content doesn't overflow either.

### File: `DOCUMENTATION.md`

Update to note the multi-line text wrapping pattern on the Data Owner management UI.

## Technical Details

| File | Change |
|---|---|
| `src/components/admin/OrgKpiOwnerManagement.tsx` | Replace `truncate` with `whitespace-pre-wrap break-words` on KPI/KRA text; add `min-w-0 overflow-hidden` to Card and row containers |
| `src/components/admin/OrgKpiOwnerDialog.tsx` | Add `break-words` to KPI info text |
| `DOCUMENTATION.md` | Update docs |

CSS-only changes -- no logic or data modifications.

