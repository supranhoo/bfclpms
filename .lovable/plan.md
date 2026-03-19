

## Fix: Excel Export Crash

**Root Cause**: The dynamic `import('xlsx')` destructures `{ default: XLSX }`, but `xlsx` uses CommonJS (`module.exports`), so `default` is `undefined`. This causes `XLSX.utils` to throw.

**Fix** (single file, 2-line change):

**File: `src/pages/reports/KpiJourneyReport.tsx`** (line 115)

Change the destructuring from:
```typescript
const [{ default: XLSX }, allRows] = await Promise.all([
```
to:
```typescript
const [XLSX, allRows] = await Promise.all([
```

The dynamic import of a CJS module returns the module object directly (with `utils`, `writeFile`, etc. as properties). No `default` wrapper needed.

Also fix the `DurationBadge` forwardRef warning from the console — it's a function component receiving refs. Wrap it with `React.forwardRef` or remove the ref passing (the `Badge` inside it is likely forwarding a ref through).

| File | Change |
|------|--------|
| `src/pages/reports/KpiJourneyReport.tsx` | Fix xlsx destructuring; fix DurationBadge ref warning |

