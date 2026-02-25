

# Fix: QualitativeSelect Not Retaining Selection in Org KPI Data Entry (v1.46.9)

## Root Cause

When qualitative options are loaded from the database JSON column (`qualitative_options`), the `rating` field may arrive as a **string** (e.g., `"5"`) instead of a **number** (`5`). After a user makes a selection, `handleScopedChange` stores the achieved value via `parseFloat()` as a proper number. On re-render, the strict equality check (`===`) fails because `"5" !== 5`, so no matching option is found, the value resolves to `null`, and the Select shows "Select..." again -- making it appear the selection was lost.

This same issue affects **three locations** where option matching happens:
1. **EmployeeRow** in `OrgKpiScopedEntryTable.tsx` (line ~288)
2. **DepartmentRow** in `OrgKpiScopedEntryTable.tsx` (line ~395)
3. **Org-scope input** in `OrgKpiEntryCard.tsx` (line ~338)

## Fix

Normalize the `rating` field to a number in all comparison sites by using `Number(o.rating)` instead of raw `o.rating`.

### Files to Change

**1. `src/components/admin/OrgKpiScopedEntryTable.tsx`**

In **EmployeeRow** (line ~288), change:
```
opts.find(o => o.rating === row.achievedValue)
```
to:
```
opts.find(o => Number(o.rating) === row.achievedValue)
```

In **DepartmentRow** (line ~395), apply the same fix.

**2. `src/components/admin/OrgKpiEntryCard.tsx`**

In the org-scope QualitativeSelect value computation (line ~338), change:
```
opts.find(o => o.rating === numVal)
```
to:
```
opts.find(o => Number(o.rating) === numVal)
```

**3. `src/components/review/QualitativeSelect.tsx`**

In `handleChange` (line ~46), normalize when finding option:
```
options.find(o => o.label === selectedLabel)
```
(This one uses label matching, so it's fine.)

In `selectedOption` lookup (line ~52), this also uses label matching -- fine.

No changes needed in `QualitativeSelect.tsx` itself since it matches by **label** (string), not by rating.

## Summary of Edits

| File | Lines | Change |
|------|-------|--------|
| `OrgKpiScopedEntryTable.tsx` | ~288, ~395 | `Number(o.rating) === row.achievedValue` |
| `OrgKpiEntryCard.tsx` | ~338 | `Number(o.rating) === numVal` |

Total: 3 one-line fixes across 2 files.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only display fix, no write changes |
| Regression | None | `Number(5)` returns `5`, so numeric values still match correctly |
| Scope | Minimal | Only affects the comparison operator in 3 spots |

