
# Clickable Stat Tiles for Pending KPI Filtering

## What Changes

Make the stat cards (Pending Review, Pending Audit, etc.) on the Team Review, Audit, and Management dashboards clickable. Clicking a tile filters the employee list to show only employees with KPIs at that specific status.

## How It Works

- Clicking "Pending Review" (Team) filters to employees with `self_review` KPIs
- Clicking "Pending Audit" (Audit) filters to employees with `manager_check` KPIs  
- Clicking "Pending Review" (Management) filters to employees with `management_review` KPIs
- Clicking the same tile again clears the filter (toggle behavior)
- Active tile gets a highlighted ring/border to indicate the active filter
- "Total Employees" tile resets to show all (clears filter)

## Technical Details

### File: `src/components/review/EmployeeSelectorGrid.tsx`

**1. Update `StatCard` component** to accept an optional `onClick` handler and `active` boolean:

```typescript
interface StatCardProps {
  // ...existing props
  onClick?: () => void;
  active?: boolean;
}
```

Add cursor-pointer styling, hover effect, and active ring when clickable.

**2. Update `renderStatsCards()`** to pass `onClick` handlers that set `statusFilter`:

| View Level | Tile | Sets `statusFilter` to |
|---|---|---|
| Team | Open KPIs | (no action or reset) |
| Team | Pending Review | `pending` |
| Team | Reviewed | `reviewed` |
| Audit | Pending Audit | `pending` |
| Audit | In Audit | `in_audit` |
| Audit | Forwarded | `forwarded` |
| Management | Pending Review | `pending` |
| Management | Approved | `approved` |

Each tile toggles: clicking the active filter clears it back to `all`.

**3. Update `StatCard` UI** to show visual feedback:
- `cursor-pointer` and `hover:shadow-md` when clickable
- `ring-2 ring-primary` border when active

### File: `DOCUMENTATION.md`
- Document the clickable stat tile behavior

## File Summary

| File | Action |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Add onClick + active state to StatCard, wire up filter handlers |
| `DOCUMENTATION.md` | Update docs |
