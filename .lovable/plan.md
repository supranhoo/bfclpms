

## Plan: Reduce Table Width in Org KPI Audit Review

### Problem
The employee table inside each audit card uses `w-full` and spreads across the entire card width, making it feel overly wide — especially on larger screens (see uploaded screenshot).

### Changes (single file)

**`src/components/admin/OrgKpiAuditCard.tsx`**

1. Replace `<table className="w-full text-sm">` with `<table className="text-sm">` (remove `w-full` so the table shrinks to content width).
2. Constrain the Employee name column: reduce `max-w-[160px]` to `max-w-[140px]`.
3. Reduce padding on all cells from `px-2` to `px-1.5` and score columns from `px-1` to `px-0.5`.
4. Shrink the Remarks input/text column by adding `max-w-[150px]` and the Auditor Score input width from `w-16` to `w-14`.

### Before vs After

```text
BEFORE (current — table stretches full card width):
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Employee              │ Code    │ Self │ Manager │ Auditor Score │ Remarks          │ Status  │ Action         │
│ ──────────────────────┼─────────┼──────┼─────────┼───────────────┼──────────────────┼─────────┼────────────────│
│ V.A.V.S.S. Ganapathi  │ 200271  │ 4.0  │  4.0    │    [____]     │ [______________] │ Pending │ [Save][Approve]│
│                        spread across entire card width ~1040px                                                │
└──────────────────────────────────────────────────────────────────────────────────┘

AFTER (compact — table auto-sizes to content):
┌──────────────────────────────────────────────────────────────────┐
│ Employee           │ Code   │Self│Mgr│Auditor│ Remarks    │St │Action      │
│ ───────────────────┼────────┼────┼───┼───────┼────────────┼───┼────────────│
│ V.A.V.S.S. Ganap…  │ 200271 │4.0 │4.0│[___]  │ [________] │ ● │[Save][Apr] │
│                  fits content, no wasted horizontal space                  │
└──────────────────────────────────────────────────────────────────┘
```

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiAuditCard.tsx` | Remove `w-full` from table, tighten padding and max-widths |
| `DOCUMENTATION.md` | v2.15.26 |

### Risk Assessment
- **Regression**: Zero — CSS-only change, no logic affected
- **UI**: Table auto-sizes to content; horizontal scroll still available if needed on small screens

