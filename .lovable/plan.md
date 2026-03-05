

# Fix Bell Curve Axis Order

## Problem
The X-axis currently runs **Below → Outstanding** (left to right). The user wants it flipped to match their original specification: **Outstanding (5–4.5) on the left → Below (<3) on the right**.

## Change

### File: `src/components/management/RatingBellCurve.tsx`

Reverse the `BAND_ORDER` array so it reads highest-to-lowest:

```typescript
const BAND_ORDER = [
  'Outstanding (5–4.5)',
  'Exceeds Expectations (4.5–4)',
  'Meets Expectations (4–3.5)',
  'Needs Improvement (3.5–3)',
  'Below Expectations (<3)',
];
```

Also update `BAND_MIDPOINTS` indices accordingly and the `getMeanBandIndex` function to match the reversed order.

## Risk
- Purely visual — no data or schema impact.

