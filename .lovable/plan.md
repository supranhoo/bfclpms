

## Root Cause: Propagated KPIs Showing as "Entered"

### Problem
In **March 2026**, Sandeep has 4 KPI groups where some scoped `org_kpi_values` rows were individually advanced to `'approved'` status (e.g., after employee KPIs reached final approval). The UI's `getKpiStatus` function uses:

```typescript
matching.every(([, v]) => v.status === 'propagated') ? 'propagated' : 'entered'
```

This `every()` check fails when any row has `status = 'approved'` instead of `'propagated'`, causing the card to incorrectly show **"Value Entered"** instead of **"Propagated"**.

**Affected data (March 2026):**
| KRA | Total | Propagated | Approved | UI Shows |
|-----|-------|-----------|----------|----------|
| Control dust emission (×2 groups) | 33 each | 31 | 2 | ❌ Entered |
| Green Belt Enhancement | 15 | 14 | 1 | ❌ Entered |
| Spillage Control | 6 | 0 | 6 | ❌ Entered |

### Fix — 1 file: `src/pages/admin/OrgKpiDataEntry.tsx`

**Change the `getKpiStatus` function** (line 184) and all equivalent status-resolution checks (lines 296-297, 843, 864, 887) to treat `'approved'` as equivalent to `'propagated'`:

```typescript
// Before:
matching.every(([, v]) => v.status === 'propagated') ? 'propagated' : 'entered'

// After:
matching.every(([, v]) => v.status === 'propagated' || v.status === 'approved') ? 'propagated' : 'entered'
```

Same fix for organization-scope checks (line 175, 288):
```typescript
// Before:
val?.status === 'propagated' ? 'propagated' : 'entered'

// After:
(val?.status === 'propagated' || val?.status === 'approved') ? 'propagated' : 'entered'
```

**5 locations** in the file need this change — all in `OrgKpiDataEntry.tsx`.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Treat `'approved'` as equivalent to `'propagated'` in all 5 status resolution checks |
| `DOCUMENTATION.md` | Version bump with fix note |

### Risk Assessment
- **No risk**: Pure display logic fix. No data changes, no schema changes.
- `'approved'` is a later stage than `'propagated'`, so treating it as "propagated or better" is semantically correct.

