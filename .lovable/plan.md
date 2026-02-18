
# Enhancement: "Issue KRAs — Confirmation" Dialog — Better Column Widths & Readability

## What the User Sees (Problem)

From the screenshot, the dialog already uses `max-w-5xl` but the table content is **still heavily truncated**:

- **Category** badge: `max-w-[100px]` — "Cost Managem", "Vendor & Contr" — cut off
- **KRA** column: `max-w-[150px]` truncate — "Adherence to Mo...", "Compliance to C..." — cut off
- **KPI** column: `max-w-[150px]` truncate — same truncation
- **Table area height** is short — only ~5-6 rows visible, forcing constant scrolling on 24 KPIs
- The overall dialog height `max-h-[90vh]` wastes vertical space on the summary card

## Root Cause in Code

In `KraIssuanceConfirmDialog.tsx`:
- Line 248: `max-w-5xl max-h-[90vh]` — width is fine but height could be tighter
- Line 376: `max-w-[100px] truncate` on Category badge — too narrow
- Line 380: `max-w-[150px] truncate` on KRA cell — too narrow
- Line 381: `max-w-[150px] truncate` on KPI cell — too narrow
- Line 332: The table container is `flex-1 min-h-0 overflow-y-auto` which depends on parent height

## Solution

### 1. Increase Dialog Height & Tighten Summary Card
- Change `max-h-[90vh]` to `max-h-[95vh]` to use more vertical space
- Shrink the summary card (`py-4` → `py-3`) to give more room to the table

### 2. Expand Table Column Widths for KRA and KPI
The table has 9 columns: `[ ]`, `#`, `Category`, `KRA`, `KPI`, `UOM`, `Target`, `Weightage`, `Frequency`

The right-side columns (UOM, Target, Weightage, Frequency) are short values and don't need much space. The fix is to give more relative width to KRA and KPI:

| Column | Current | Proposed |
|---|---|---|
| Checkbox | `w-10` | `w-10` (unchanged) |
| # | `w-10` | `w-10` (unchanged) |
| Category | `max-w-[100px]` | `min-w-[120px]` — badge shows full name |
| KRA | `max-w-[150px] truncate` | `min-w-[200px]` with `whitespace-normal` — wraps gracefully |
| KPI | `max-w-[150px] truncate` | `min-w-[200px]` with `whitespace-normal` — wraps gracefully |
| UOM | text-center | `w-20` fixed |
| Target | text-center | `w-20` fixed |
| Weightage | text-center | `w-28` fixed |
| Frequency | text-center | `w-24` fixed |

Switching from `max-w + truncate` to `min-w + whitespace-normal` means long KRA/KPI names will **wrap to a second line** rather than being cut off — much better for review.

### 3. Table Rows — Allow Wrapping + Vertical Alignment
- Add `align-top` to table cells containing wrapped text (KRA, KPI)
- Add `leading-snug text-sm` for comfortable multi-line reading

### 4. Category Badge — Remove Truncation
- Remove `max-w-[100px] truncate` from the badge
- Allow full category name to show (may wrap within min-w constraint)

### 5. Compact Table Header
- Add `sticky top-0 bg-background z-10` to `<TableHeader>` so column headers stay visible when scrolling through 24+ KPIs

## Files to Change

| File | Lines | Change |
|---|---|---|
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 248 | `max-h-[90vh]` → `max-h-[95vh]` |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 276 | `py-4` → `py-3` on summary card |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 347 (TableHeader) | Add `sticky top-0 bg-background z-10` |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 355 | `<TableHead>` for # — add `w-8` |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 356 | Category `<TableHead>` — add `min-w-[130px]` |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 357 | KRA `<TableHead>` — add `min-w-[200px]` |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 358 | KPI `<TableHead>` — add `min-w-[200px]` |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 359-362 | UOM/Target/Weightage/Frequency heads — add fixed widths |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 376 | Category badge — remove `max-w-[100px] truncate`, use `shrink-0` |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 380 | KRA cell — remove `max-w-[150px] truncate`, add `align-top whitespace-normal leading-snug` |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | 381 | KPI cell — remove `max-w-[150px] truncate`, add `align-top whitespace-normal leading-snug text-muted-foreground` |
| `DOCUMENTATION.md` | — | Version bump + note |

## Before vs After

```text
BEFORE (truncated):
┌────────────┬────────────────┬────────────────┬──────┬────────┐
│ Category   │ KRA            │ KPI            │ UOM  │Target  │
├────────────┼────────────────┼────────────────┼──────┼────────┤
│ Cost Manag…│ Adherence to… │ Adherence to … │  %   │  90    │
│ Vendor & C…│ Compliance to…│ Contract work… │ Num  │   0    │
└────────────┴────────────────┴────────────────┴──────┴────────┘

AFTER (readable, wrapping):
┌──────────────────┬───────────────────────────┬───────────────────────────┬──────┬────────┐
│ Category         │ KRA                       │ KPI                       │ UOM  │ Target │
├──────────────────┼───────────────────────────┼───────────────────────────┼──────┼────────┤
│ Cost Management  │ Adherence to Monthly      │ Adherence to Material     │  %   │  90    │
│                  │ Budget                    │ Consumption Targets       │      │        │
├──────────────────┼───────────────────────────┼───────────────────────────┼──────┼────────┤
│ Vendor & Contract│ Compliance to Contract    │ Contract work order       │ Num  │   0    │
└──────────────────┴───────────────────────────┴───────────────────────────┴──────┴────────┘
```

## Impact
- No logic changes — purely presentational
- The table becomes horizontally scrollable when the viewport is narrow (already handled by `overflow-x-auto` on line 332)
- Sticky header keeps column labels visible while scrolling through all 24+ KPIs
