

# Fix: Custom KRA Name Blocks KPI Name Entry

## Root Cause

In `AdminKpiCreateDialog.tsx`, line 569, the KPI Name combobox has:

```typescript
disabled={!kraName || isCustomKra}
```

When the admin clicks "+ Enter custom KRA name" and types a custom KRA name, `isCustomKra` is `true`. This **disables the KPI dropdown entirely**, so the user can never proceed to enter a KPI name. Without a KPI name, the form's submit validation on line 253 (`!kpiName`) blocks saving.

The intent was to disable the KPI dropdown when no KRA is selected, but the `isCustomKra` condition incorrectly gates it even when a custom KRA name has been typed.

## Fix

### File: `src/components/admin/AdminKpiCreateDialog.tsx`

**Line 569**: Change the disabled condition from:
```typescript
disabled={!kraName || isCustomKra}
```
to:
```typescript
disabled={!kraName}
```

This way:
- When using the KRA combobox (dropdown selection), `kraName` is set on selection -- KPI dropdown enables. (No change.)
- When using custom KRA entry, `kraName` is set as the user types -- KPI dropdown enables once they type something. (Previously broken, now fixed.)
- If no KRA name is entered yet, the KPI dropdown remains disabled. (Correct.)

Additionally, when `isCustomKra` is true and a custom KRA name is entered, the KPI dropdown will show no existing templates (since `filteredKpiTemplates` filters by `kraName` match, which won't match anything for a brand-new KRA). The user will see "No KPI templates found" and can click "+ Enter custom KPI name" to type their own. This is the correct UX flow.

### File: `DOCUMENTATION.md`

Document the bug fix.

## Files to Change

| File | Change |
|---|---|
| `src/components/admin/AdminKpiCreateDialog.tsx` | Remove `isCustomKra` from KPI disabled condition (line 569) |
| `DOCUMENTATION.md` | Document fix |

