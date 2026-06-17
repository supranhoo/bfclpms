## Remove "Per-employee impact (Dashboard parity)" rollup from Bulk Sign-off Preview

### Scope
Remove the `EmployeeRollupTable` sub-component and its call site from `src/components/review/BulkSignoffPreview.tsx`. This eliminates the entire "Per-employee impact (Dashboard parity)" panel that the user considers irrelevant noise in the bulk sign-off/approve flow.

### Changes

1. **Delete the render block** (lines 250–258) that wraps the table title + `<EmployeeRollupTable>`.
2. **Delete the `EmployeeRollupTable` component** (lines 627–699).
3. **Clean up unused destructuring** on line 121 — remove `perEmployee`.
4. **Clean up unused imports**:
   - Remove `ArrowUp, ArrowDown` from the `lucide-react` import.
   - Remove `EmployeeRollup` from the `@/lib/bulkSignoffImpact` type import.

### No other files touched
The `EmployeeRollup` type and `perEmployee` computation remain in `src/lib/bulkSignoffImpact.ts` (they are part of the library contract; other consumers may still use them). Only the presentational usage in `BulkSignoffPreview.tsx` is removed.

### Verification
- Build passes without TypeScript errors.
- No unused-variable warnings in the modified file.