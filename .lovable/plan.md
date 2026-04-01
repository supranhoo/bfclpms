

## Plan: Fix Category Chart Bars Not Rendering

### Root Cause
The previous change switched `CardContent` from `style={{ height: ... }}` to `style={{ minHeight: ... }}`. Recharts' `ResponsiveContainer` requires a parent with a **computed height** — `minHeight` alone doesn't give `h-full` a resolved pixel value, so the chart collapses to 0px and no bars render.

### Fix

**`src/components/review/UnifiedScorecard.tsx`** (line 1405)
- Change `minHeight` back to `height` on the `CardContent` style prop
- This restores the explicit height that `ResponsiveContainer` needs to render bars
- To prevent excessive blank space with few categories, keep the dynamic calculation but use `height` not `minHeight`

```typescript
// Before (broken):
<CardContent style={{ minHeight: Math.max(180, scoreData.categoryScores.length * 36) }}>

// After (fixed):
<CardContent style={{ height: Math.max(180, scoreData.categoryScores.length * 36) }}>
```

**`DOCUMENTATION.md`** — v2.15.56 patch note

### Files Modified

| File | Change |
|------|--------|
| `src/components/review/UnifiedScorecard.tsx` | Restore `height` on category chart container |
| `DOCUMENTATION.md` | v2.15.56 |

### Risk
- None — single-line revert to working behavior

