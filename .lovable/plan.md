
# Plan: Fix Threshold Parsing for Comparison Operators

## Problem Summary

The KPI **"5ka dum / naye style k KPI Scores dalenge hum yaha"** has threshold values with comparison operators that the system cannot parse:

| Threshold | Value | Current Parse Result | Should Be |
|-----------|-------|---------------------|-----------|
| R5 | `>98` | `null` (NaN) | `98` |
| R4 | `97` | `97` | `97` |
| R3 | `96` | `96` | `96` |
| R2 | `95` | `95` | `95` |
| R1 | `94` | `94` | `94` |
| R0 | `<94` | `null` (NaN) | `94` |

Because `R5 = null`, the scoring logic skips it entirely, causing incorrect ratings.

---

## Root Cause

The `parseThreshold()` function in `src/lib/ratingCalculation.ts` does not handle comparison operators (`>`, `<`, `>=`, `<=`):

```typescript
// Current code (line 46-48)
const cleanValue = raw.replace('%', '').replace(',', '.').trim();
const parsed = parseFloat(cleanValue);
if (isNaN(parsed)) return null;  // ">98" fails here
```

When `parseFloat(">98")` is called, it returns `NaN` because of the `>` prefix.

---

## Solution

Update `parseThreshold()` to strip comparison operators before parsing the numeric value:

```typescript
export function parseThreshold(value: string | number | null | undefined, asRatio: boolean = true): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  const raw = String(value).trim();
  const hasPercent = raw.includes('%');

  // Strip comparison operators (>, <, >=, <=) and % sign
  const cleanValue = raw
    .replace(/^[><]=?/, '')  // NEW: Remove leading >, <, >=, <=
    .replace('%', '')
    .replace(',', '.')
    .trim();
  
  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed)) return null;

  // ... rest of function unchanged
}
```

---

## File Changes

| File | Change |
|------|--------|
| `src/lib/ratingCalculation.ts` | Update `parseThreshold()` to strip comparison operators |
| `src/lib/ratingCalculation.test.ts` | Add tests for operator-prefixed thresholds |
| `DOCUMENTATION.md` | Document that thresholds can include operators |

---

## Test Cases to Add

```typescript
describe("parseThreshold with comparison operators", () => {
  it("parses '>98' as 98", () => {
    expect(parseThreshold(">98", false)).toBe(98);
  });

  it("parses '<94' as 94", () => {
    expect(parseThreshold("<94", false)).toBe(94);
  });

  it("parses '>=100' as 100", () => {
    expect(parseThreshold(">=100", false)).toBe(100);
  });

  it("parses '<=50%' as 50 (absolute mode)", () => {
    expect(parseThreshold("<=50%", false)).toBe(50);
  });

  it("parses '>98%' as 0.98 (ratio mode)", () => {
    expect(parseThreshold(">98%", true)).toBe(0.98);
  });
});
```

---

## Expected Result After Fix

For the problematic KPI with:
- **Criteria**: Higher is Better
- **R5**: `>98` → parsed as `98`
- **Achieved**: e.g., `99`

**Scoring Logic:**
```
if (achieved >= r5) → if (99 >= 98) → TRUE → Rating 5 ✅
```

---

## Validation Checklist

After implementation:
- [ ] KPI "5ka dum" scores correctly with R5 = `>98`
- [ ] Other KPIs with `>`, `<`, `>=`, `<=` prefixes work
- [ ] Normal numeric thresholds still work (no regression)
- [ ] All existing tests pass
- [ ] New tests for operator parsing pass
