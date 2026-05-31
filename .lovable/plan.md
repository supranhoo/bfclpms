## Scope
Run Calculation → Calculated / Run Details table: display formatting only.
- **PMS Score** → 2 decimals (e.g., `4.6167` → `4.62`)
- **Eligible %** → 2 decimals (e.g., `15.3867%` → `15.39%`)
- **Increment Amount** → **rounded DOWN (floor)** to 2 decimals (e.g., `3077.349` → `3077.34`, `3077.999` → `3077.99`, never rounds up)

Storage, computation, edge function, and Excel export remain unchanged — purely a display change in the table cells.

## Assumptions
- Floor-to-2-decimals applies only to Increment Amount display. PMS Score and Eligible % use standard `.toFixed(2)`.
- Null/missing values continue to show `—`.
- Same formatting applied in both the Run-specific ResultsTable and the Latest Calculations table (single shared render → consistent).
- Excel export keeps raw numeric values so downstream math/audit isn't affected.
- Edit dialog still accepts/saves the raw underlying value (no floor on input).

## UI Changes
**Location:** `src/pages/incentive/IncrementInputs.tsx` → `ResultsTable` cells (lines 475, 496, 498).

**Before → After (Vivek's row as example):**

| Column | Before | After |
|---|---|---|
| PMS Score | `4.6167` | `4.62` |
| Eligible % | `15.3867%` | `15.39%` |
| Increment Amount | `3077.349` (raw) | `3077.34` (floored) |

```text
EMPLOYEE        | EMP CODE | PMS SCORE | RATING BAND | SLAB % | … | ELIGIBLE % | CURRENT SAL | INCREMENT AMT | REVISED SAL | …
Vivek Kumar D.  | 101784   |   4.62    |    4.5-5    |   20%  | … |   15.39%   |   20000     |    3077.34    |   23077.34  | …
```

No column changes, no layout changes, no pagination/edit/delete/export changes.

## Implementation
1. Add two helpers in `src/lib/utils.ts` (reusable, testable):
   ```ts
   export const fmt2 = (v: number | string | null | undefined) =>
     v == null || v === '' ? '—' : Number(v).toFixed(2);

   export const fmtFloor2 = (v: number | string | null | undefined) => {
     if (v == null || v === '') return '—';
     const n = Number(v);
     if (isNaN(n)) return '—';
     return (Math.floor(n * 100) / 100).toFixed(2);
   };
   ```
2. In `IncrementInputs.tsx` ResultsTable, replace 3 cells:
   - `{r.pms_score ?? '—'}` → `{fmt2(r.pms_score)}`
   - `{r.eligible_percent ?? '—'}%` → `{r.eligible_percent == null ? '—' : `${fmt2(r.eligible_percent)}%`}`
   - `{r.increment_amount ?? '—'}` → `{fmtFloor2(r.increment_amount)}`

## Tests
Add `src/lib/__tests__/incrementFormat.test.ts`:
- `fmt2(4.6167) === '4.62'`
- `fmt2(0) === '0.00'` (zero not treated as missing)
- `fmt2(null) === '—'`, `fmt2('') === '—'`
- `fmtFloor2(3077.349) === '3077.34'` (does NOT round up)
- `fmtFloor2(3077.999) === '3077.99'`
- `fmtFloor2(3077) === '3077.00'`
- `fmtFloor2(null) === '—'`

## Not Applicable
DB schema, RLS, edge function `compute-increment`, policy semantics, Excel export, edit/delete flows, pagination — none change.

## Rollback
Revert the 3 cell substitutions in `IncrementInputs.tsx` and delete the two helpers + their test file.
