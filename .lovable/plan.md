

## RCA: All Entity Validation Falsely Reports "Does Not Exist"

### Root Cause
**Stale closure in `useCallback`** — Line 749 of `ImportData.tsx`:

```javascript
const handleEmployeeFileUpload = useCallback((event) => {
  // ... uses departments, divisions, businessUnits, designations, profiles, allowUpdateExisting
}, [toast]);  // ← BUG: missing all data dependencies
```

The dependency array only includes `toast`. When the user uploads a file, the callback captures the **initial render values** of `departments`, `divisions`, `businessUnits`, `designations`, and `profiles` — which are `undefined` (still loading from the database). So `(divisions || []).map(...)` produces an **empty Set**, and every single entity lookup fails.

**DRI exists in the system** (confirmed by screenshot), but the validation Set is empty, so it reports "does not exist".

The same bug affects the duplicate-code check (`existingCodes`) and `allowUpdateExisting` toggle — they also use stale values.

### Fix
Add the missing dependencies to the `useCallback` dependency array:

```javascript
}, [toast, departments, divisions, businessUnits, designations, profiles, allowUpdateExisting]);
```

This is a one-line fix on line 749 of `src/pages/admin/ImportData.tsx`.

Additionally, the same issue exists in the re-validation block around line 1893-1900 (the `allowUpdateExisting` toggle handler) — but that block reads the data inline at toggle time, so it should work correctly. Will verify and fix if needed.

### Files Changed
| File | Action |
|------|--------|
| `src/pages/admin/ImportData.tsx` | Add missing dependencies to `useCallback` on line 749 |

### Risk Assessment
- **Regression**: Zero — this only corrects the closure to use current data
- **Data**: No schema changes
- **Security**: No change

