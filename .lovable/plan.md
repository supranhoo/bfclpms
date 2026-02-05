

# Plan: Implement Direct Threshold Comparison for Percentage (%) UOM

## Summary

Add special handling for **Percentage UOM KPIs** that bypasses the ratio calculation and compares the achieved value **directly** against thresholds. This matches how `Date` UOM already works and aligns with your authoritative rule.

---

## Current vs. Required Behavior

| UOM Type | Current Logic | Required Logic |
|----------|---------------|----------------|
| **%** | `achieved / target` → compare ratio | ❌ **Compare achieved directly** |
| Numeric | `achieved / target` → compare ratio | ✅ No change |
| Date | Direct comparison (lower = better) | ✅ No change |
| Binary/Tiered | Option-based | ✅ No change |

---

## Technical Analysis

### Current Flow (WRONG for %)

```typescript
// Lines 196-202 in calculateRating()
if (isLowerBetter) {
  achievedWeight = achieved !== 0 ? targetVal / achieved : 0;  // ❌ For %
} else {
  achievedWeight = targetVal !== 0 ? achieved / targetVal : 0;  // ❌ For %
}
// Then compares ratio against thresholds
```

### Required Flow (NEW for %)

```typescript
// Add early exit for percentage UOM - similar to Date handling
if (uom === '%' || uom?.toLowerCase() === 'percentage') {
  return calculatePercentageRating(achievedValue, thresholds, criteria, weightage);
}
```

---

## Implementation Changes

### 1. New Function: `calculatePercentageRating()`

Add a dedicated function (similar to `calculateDateRating()`) that:
- Takes the achieved value as-is (e.g., 99.5, 100.4, 101)
- Compares directly against thresholds (R5, R4, R3, R2, R1)
- Supports both **Higher is Better** and **Lower is Better** criteria
- Returns `percentage: 0` (not applicable for this UOM type)

```typescript
/**
 * Calculate rating for Percentage (%) UOM KPIs
 * 
 * For % UOM, the achieved value is already a normalized percentage.
 * Compare directly against thresholds WITHOUT dividing by target.
 * 
 * Lower is Better: lower achieved = higher rating (e.g., error rate)
 * Higher is Better: higher achieved = higher rating (e.g., success rate)
 */
function calculatePercentageRating(
  achievedValue: number | string | null | undefined,
  thresholds: RatingThresholds,
  criteria: string,
  weightage: number
): RatingResult {
  // Early return for empty values
  if (achievedValue === null || achievedValue === undefined || achievedValue === '') {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  const achieved = typeof achievedValue === 'number' 
    ? achievedValue 
    : parseFloat(String(achievedValue));
    
  if (isNaN(achieved)) {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  // Parse thresholds as absolute values (not ratios)
  const r5 = parseThreshold(thresholds.r5, false);
  const r4 = parseThreshold(thresholds.r4, false);
  const r3 = parseThreshold(thresholds.r3, false);
  const r2 = parseThreshold(thresholds.r2, false);
  const r1 = parseThreshold(thresholds.r1, false);

  const isLowerBetter = criteria?.toLowerCase().includes('lower');
  let rating = 0;

  if (isLowerBetter) {
    // Lower is Better: lower value = higher rating
    // Example: Error rate - 99% is better than 101%
    if (r5 !== null && achieved <= r5) rating = 5;
    else if (r4 !== null && achieved <= r4) rating = 4;
    else if (r3 !== null && achieved <= r3) rating = 3;
    else if (r2 !== null && achieved <= r2) rating = 2;
    else if (r1 !== null && achieved <= r1) rating = 1;
  } else {
    // Higher is Better: higher value = higher rating
    // Example: Success rate - 101% is better than 99%
    if (r5 !== null && achieved >= r5) rating = 5;
    else if (r4 !== null && achieved >= r4) rating = 4;
    else if (r3 !== null && achieved >= r3) rating = 3;
    else if (r2 !== null && achieved >= r2) rating = 2;
    else if (r1 !== null && achieved >= r1) rating = 1;
  }

  return {
    rating,
    ratingLevel: ratingToLevel(rating),
    weightedScore: weightage * rating,
    percentage: 0,  // Not applicable - value IS a percentage
    achievedWeight: 0,  // Not applicable - no ratio calculation
  };
}
```

### 2. Update `calculateRating()` Main Function

Add the percentage check early in the function, right after the Date check:

```typescript
export function calculateRating(
  achievedValue: number | string | null | undefined,
  target: number | null | undefined,
  thresholds: RatingThresholds,
  criteria: string = 'Higher is Better',
  weightage: number = 0,
  uomType: UomType = 'numeric',
  qualitativeOptions?: QualitativeOption[] | null,
  uom?: string | null
): RatingResult {
  // Handle Date UOM specially - compare day values directly against thresholds
  if (uom === 'Date') {
    return calculateDateRating(achievedValue, thresholds, weightage);
  }

  // NEW: Handle Percentage UOM specially - compare value directly against thresholds
  if (uom === '%' || uom?.toLowerCase() === 'percentage') {
    return calculatePercentageRating(achievedValue, thresholds, criteria, weightage);
  }

  // ... rest of existing logic unchanged
}
```

---

## File Changes

| File | Change |
|------|--------|
| `src/lib/ratingCalculation.ts` | Add `calculatePercentageRating()` function + early exit in `calculateRating()` |
| `src/lib/ratingCalculation.test.ts` | Add comprehensive test suite for % UOM |
| `DOCUMENTATION.md` | Document percentage UOM behavior |

---

## Test Cases to Add

```typescript
describe("calculateRating with Percentage (%) UOM", () => {
  describe("Lower is Better", () => {
    const thresholds: RatingThresholds = {
      r5: "99",     // ≤ 99% = Rating 5
      r4: "99.5",   // ≤ 99.5% = Rating 4
      r3: "100",    // ≤ 100% = Rating 3
      r2: "100.5",  // ≤ 100.5% = Rating 2
      r1: "101",    // ≤ 101% = Rating 1
      r0: null,
    };

    it("returns rating 5 when achieved ≤ R5 threshold", () => {
      const result = calculateRating(98.5, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(5);
    });

    it("returns rating 4 when achieved between R5 and R4", () => {
      const result = calculateRating(99.3, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(4);
    });

    it("returns rating 3 when achieved between R4 and R3", () => {
      const result = calculateRating(99.8, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(3);
    });

    it("returns rating 2 when achieved between R3 and R2", () => {
      const result = calculateRating(100.4, 95, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(2);
      // Target (95) is IGNORED - only achieved value matters
    });

    it("returns rating 1 when achieved between R2 and R1", () => {
      const result = calculateRating(100.8, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(1);
    });

    it("returns rating 0 when achieved > R1 threshold", () => {
      const result = calculateRating(102, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(0);
    });

    it("ignores target value completely", () => {
      // Target should NOT affect the calculation
      const result1 = calculateRating(99, null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      const result2 = calculateRating(99, 50, thresholds, "Lower is Better", 10, "numeric", null, "%");
      const result3 = calculateRating(99, 200, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result1.rating).toBe(result2.rating);
      expect(result2.rating).toBe(result3.rating);
      expect(result1.rating).toBe(5);
    });
  });

  describe("Higher is Better", () => {
    const thresholds: RatingThresholds = {
      r5: "101",    // ≥ 101% = Rating 5
      r4: "100.5",  // ≥ 100.5% = Rating 4
      r3: "100",    // ≥ 100% = Rating 3
      r2: "99.5",   // ≥ 99.5% = Rating 2
      r1: "99",     // ≥ 99% = Rating 1
      r0: null,
    };

    it("returns rating 5 when achieved ≥ R5 threshold", () => {
      const result = calculateRating(102, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(5);
    });

    it("returns rating 4 when achieved between R5 and R4", () => {
      const result = calculateRating(100.7, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(4);
    });

    it("returns rating 3 when achieved between R4 and R3", () => {
      const result = calculateRating(100.2, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(3);
    });

    it("returns rating 2 when achieved between R3 and R2", () => {
      const result = calculateRating(99.7, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(2);
    });

    it("returns rating 1 when achieved between R2 and R1", () => {
      const result = calculateRating(99.2, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(1);
    });

    it("returns rating 0 when achieved < R1 threshold", () => {
      const result = calculateRating(98, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("calculates weighted score correctly", () => {
      const thresholds: RatingThresholds = { r5: "99", r4: "100", r3: "101", r2: "102", r1: "103" };
      const result = calculateRating(98, null, thresholds, "Lower is Better", 20, "numeric", null, "%");
      expect(result.rating).toBe(5);
      expect(result.weightedScore).toBe(100); // 20 * 5
    });

    it("returns percentage as 0 for % UOM", () => {
      const thresholds: RatingThresholds = { r5: "99", r4: "100", r3: "101", r2: "102", r1: "103" };
      const result = calculateRating(98, null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.percentage).toBe(0);
      expect(result.achievedWeight).toBe(0);
    });

    it("handles string achieved values", () => {
      const thresholds: RatingThresholds = { r5: "99", r4: "100", r3: "101", r2: "102", r1: "103" };
      const result = calculateRating("98.5", null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(5);
    });

    it("handles threshold values with % sign", () => {
      const thresholds: RatingThresholds = { r5: "99%", r4: "100%", r3: "101%", r2: "102%", r1: "103%" };
      const result = calculateRating(98, null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(5);
    });

    it("handles boundary values exactly", () => {
      const thresholds: RatingThresholds = { r5: "99", r4: "100", r3: "101", r2: "102", r1: "103" };
      
      // Exactly at boundary - Lower is Better uses <=
      expect(calculateRating(99, null, thresholds, "Lower is Better", 10, "numeric", null, "%").rating).toBe(5);
      expect(calculateRating(100, null, thresholds, "Lower is Better", 10, "numeric", null, "%").rating).toBe(4);
      
      // Higher is Better uses >=
      expect(calculateRating(101, null, thresholds, "Higher is Better", 10, "numeric", null, "%").rating).toBe(3);
    });

    it("returns zero for null achieved value", () => {
      const thresholds: RatingThresholds = { r5: "99", r4: "100", r3: "101", r2: "102", r1: "103" };
      const result = calculateRating(null, null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(0);
      expect(result.ratingLevel).toBe("red");
    });

    it("recognizes 'percentage' as alias for %", () => {
      const thresholds: RatingThresholds = { r5: "99", r4: "100", r3: "101", r2: "102", r1: "103" };
      const result = calculateRating(98, null, thresholds, "Lower is Better", 10, "numeric", null, "percentage");
      expect(result.rating).toBe(5);
    });
  });
});
```

---

## System-Wide Impact

All areas automatically fixed (single source of truth):

| Component | Auto-Fixed |
|-----------|------------|
| My KPIs | ✅ |
| Self Review | ✅ |
| Manager / Auditor / Management Review | ✅ |
| KPI Logic Modal | ✅ |
| Scoring Simulator | ✅ |
| Org KPI Propagation | ✅ |
| Excel Import | ✅ |
| PDF Export | ✅ |
| Dashboards & Reports | ✅ |

---

## Final Truth Table

| UOM | Uses Target? | Uses Ratio? | Uses Input Value Directly? |
|-----|--------------|-------------|---------------------------|
| **%** | ❌ No | ❌ No | ✅ Yes |
| Numeric | ✅ Yes | ✅ Yes | ❌ No |
| Binary | ❌ No | ❌ No | Option-based |
| Tiered | ❌ No | ❌ No | Option-based |
| Date | ❌ No | ❌ No | ✅ Yes (day) |

---

## Validation Checklist

After implementation:
- [ ] % KPIs with "Lower is Better" score correctly (lower value = higher rating)
- [ ] % KPIs with "Higher is Better" score correctly (higher value = higher rating)
- [ ] Target value is completely ignored for % UOM
- [ ] Existing numeric KPIs continue working with ratio-based logic
- [ ] Scoring Simulator shows correct results for % KPIs
- [ ] All 70+ unit tests pass (existing + new)

