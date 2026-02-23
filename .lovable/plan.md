

# Enhanced Workflow Bottleneck Report v2

## What's Changing

The current report provides a flat list of pending KPIs. This enhancement adds **three new analytical dimensions** to make the report truly actionable:

1. **Urgency Distribution Panel** -- visual breakdown of how many KPIs are in Green/Amber/Red zones
2. **Top Bottleneck Holders Table** -- aggregated view showing which specific people (managers, employees) are responsible for the most pending items, sorted by severity
3. **Expanded Summary Cards** -- break out Skip-Level and HR PMS counts; add clickable stage filtering from cards
4. **Stage Click-to-Filter** -- clicking a summary card or chart segment auto-filters the detail table
5. **Issued vs Not-Issued distinction** -- separate "KRA Not Issued" from "KRA Set (Awaiting Self Review)" so admins know what needs issuance vs what's genuinely stuck

## Report Layout (Enhanced)

### Row 1: Summary Cards (7 cards instead of 5)
- Total Pending | Self Review | Manager | Skip-Level | HR PMS | Audit/Mgmt | Avg Days
- Each card is **clickable** to filter the table below to that stage

### Row 2: Side-by-side panels
- **Left**: Urgency Distribution (donut/pie chart showing Green/Amber/Red counts)
- **Right**: Existing department stacked bar chart (unchanged)

### Row 3: Top Bottleneck Holders (NEW)
A compact table showing:
| Responsible Person | Role | Pending KPIs | Critical (15+d) | Avg Days |
Sorted by Critical count descending. Shows top 10 by default with "Show All" toggle.

### Row 4: Filters + Detail Table (existing, improved)
- Filters remain the same
- Table adds a subtle row highlight: red-tinted background for 15+d rows

## Technical Plan

### 1. Modify `src/hooks/useBottleneckReport.ts`
- Add `urgencyStats` computation: `{ green: number, amber: number, red: number }`
- Add `topHolders` computation: aggregate by `responsiblePerson`, compute per-person `totalPending`, `criticalCount` (15+d), and `avgDays`
- Add `activeStageFilter` state that summary cards can set (replaces manual stage dropdown when clicked)

### 2. Modify `src/pages/reports/BottleneckReport.tsx`
- Expand summary cards row to 7 cards (add Skip-Level, HR PMS)
- Make each card clickable to set stage filter
- Add urgency donut chart (Recharts PieChart) in a 2-column layout alongside existing bar chart
- Add "Top Bottleneck Holders" card with a compact table
- Add subtle red background tint for critical rows in the detail table
- Add "Not Issued" badge variant for KPIs where `is_issued === false`

### 3. Documentation
- Bump version to **1.45.85**
- Update bottleneck report section in `DOCUMENTATION.md`

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/useBottleneckReport.ts` | **Modify** -- add urgency stats, top holders, card-click filter |
| `src/pages/reports/BottleneckReport.tsx` | **Modify** -- enhanced layout with new sections |
| `DOCUMENTATION.md` | **Modify** -- version bump + updated docs |

## Risk Assessment

| Aspect | Detail |
|--------|--------|
| Data impact | None -- read-only report, no schema changes |
| DB changes | None |
| Regression risk | Low -- modifying only the bottleneck report files |
| UI/UX consistency | Follows existing card + table + chart patterns used across all reports |

