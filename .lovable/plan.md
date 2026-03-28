

## Fix: Show Unassigned KPIs in Auditor Workload Bar

### Problem
The "Pending Audit" stat card shows 293, but the Auditor Workload cards only total ~31. The difference (~262 KPIs) belongs to employees **not assigned to any auditor**. The current workload bar has no visibility into this gap.

### Solution
Add an **"Unassigned"** card at the end of the Auditor Workload bar showing how many pending/in-audit KPIs belong to employees with no auditor assignment. This makes the numbers reconcile and highlights assignment gaps.

### UI (reference: your screenshot)

```text
Auditor Workload (4)
┌─────────────┐ ┌──────────────────┐ ┌──────────────────┐ ... ┌──────────────────┐
│ All Auditors│ │ Auditor002       │ │ Auditor001       │     │ ⚠ Unassigned     │
│             │ │ 9 emp            │ │ 11 emp           │     │ 34 emp           │
│             │ │ 7 pending 2 audit│ │ 7 pending 2 audit│     │ 262 pending      │
└─────────────┘ └──────────────────┘ └──────────────────┘     └──────────────────┘
```

- The **Unassigned** card has an amber/warning style to draw attention
- Clicking it filters the grid to show only unassigned employees (so admin can then assign them)
- The card appears only when there are unassigned KPIs (count > 0)

### Implementation

**File: `src/components/review/EmployeeSelectorGrid.tsx`**

1. **Compute unassigned stats** — In the `auditorWorkloadStats` useMemo, after computing per-auditor stats, also compute an "unassigned" bucket: filter `periodKpis` for employees NOT in any auditor's `employeeIds` set, count their pending/in-audit/forwarded KPIs.

2. **Render Unassigned card** — After the auditor cards in the workload bar, add an amber-styled card for unassigned KPIs (if count > 0).

3. **Filter support** — When `auditorFilter` is set to `'__unassigned__'`, filter `displayMembers` to employees not in any auditor's assignment set.

### Files Changed
| File | Action |
|------|--------|
| `src/components/review/EmployeeSelectorGrid.tsx` | Update — add unassigned computation + card + filter |

### Risk Assessment
- **Regression**: Zero — purely additive logic within the existing audit-only conditional block
- **Data**: Read-only, no schema changes
- **Accuracy**: Uses the same `periodKpis` + workflow resolution as the main stat cards, ensuring numbers reconcile

