

# Plan: Redesign Admin KPI Editor for Compact, Structured Layout

## Current Problems
- Single-column vertical scroll with excessive `space-y-6` gaps (~1006 lines of form)
- KRA Name and KPI Name each take a full row unnecessarily
- Source of Data takes a full row for a single input
- Rating thresholds (R5-R0) use a 6-column grid that's sparse
- Org-Level, Resubmission, and Binary/Tiered panels are full-width blocks with heavy padding
- Review Period / Status / Year row is fine but sits far down the scroll
- Overall: too much vertical space, admin must scroll extensively

## Redesign Approach

Reorganize into **visually grouped sections** using a denser multi-column layout with section headers, reducing vertical scroll by ~40%.

### Section Layout

```text
┌─────────────────────────────────────────────────────────┐
│ IDENTITY (2-col)                                        │
│  [Employee ▼]  [Category ▼]                             │
│  [KRA Name___________]  [Source of Data_______]         │
│  [KPI Name (textarea, 2 rows)___________________]      │
├─────────────────────────────────────────────────────────┤
│ MEASUREMENT (3-col for numeric, 2-col otherwise)        │
│  [UOM Type ○○○]                                         │
│  [Target] [UOM ▼] [Weightage]   (numeric)               │
│  [Frequency ▼] [Criteria ▼] [Cycle Start ▼]            │
│  [Threshold Mode ▼]  [R5][R4][R3][R2][R1][R0]          │
│  --- or Binary/Tiered panel inline ---                  │
├─────────────────────────────────────────────────────────┤
│ SETTINGS (inline toggles, single row each)              │
│  [⊞ Org-Level KPI ── toggle] [Scope ▼] (inline)        │
│  [Day Count ▼] (if Daily)                               │
│  [Resubmit Reason ── toggle]                            │
├─────────────────────────────────────────────────────────┤
│ PERIOD & STATUS (3-col)                                 │
│  [Period ▼] [Year] [Status ▼]                           │
│  [Apply Scope ○ this ○ future ○ all] (horizontal)       │
├─────────────────────────────────────────────────────────┤
│ [Copy to Months ▸]  (collapsible, same as today)        │
│ [Reason textarea]                                       │
│                              [Cancel] [Save Changes]    │
└─────────────────────────────────────────────────────────┘
```

### Key Changes in `AdminKpiEditorForm.tsx`

1. **Reduce spacing**: `space-y-6` → `space-y-4` at root; `space-y-2` → `space-y-1.5` for field labels
2. **Identity section**: Move KRA Name + Source of Data into a single 2-col row; KPI Name stays full-width but with `rows={1}` auto-expanding
3. **Measurement section**: Add a subtle section header (`text-xs font-semibold uppercase text-muted-foreground`). Keep existing grid logic but tighten gaps from `gap-4` → `gap-3`
4. **Settings section**: Collapse Org-Level and Resubmission toggles into compact single-line rows (label + switch inline, no separate panel padding). Reduce `p-4` → `p-3` on setting panels
5. **Apply Scope**: Convert vertical RadioGroup to horizontal inline pills on one line
6. **Rating thresholds**: Keep 6-col grid, reduce label size, merge with threshold mode selector into one block
7. **Section dividers**: Use `border-t pt-3 mt-3` lightweight separators instead of heavy card-style panels

### File Changes

| File | Change |
|------|--------|
| `src/components/admin/AdminKpiEditorForm.tsx` | Restructure JSX layout as described above |

No logic changes — only layout/spacing/grouping restructure. All form state, handlers, and submission logic remain identical.

