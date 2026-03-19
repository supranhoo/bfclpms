

## Inline Expandable Observations per Employee Row

### Problem
Observation details live in a separate "Employee Observations" collapsible at the bottom of the card. Users must scroll between two places — the employee row (which shows count badges) and the bottom panel — to correlate data with observations.

### Solution
Make the observation count badges on each employee row clickable. Clicking expands a detail sub-row directly beneath that employee, showing the full observation cards (type, status, ticket, raiser, title, description, date). This keeps context co-located with the data entry row.

The bottom `OrgKpiObservationsSummary` section will be removed since its content is now inline.

### Plan

| # | File | Change |
|---|-------|--------|
| 1 | `OrgKpiScopedEntryTable.tsx` | Pass full observation list (not just counts) per employee. Add an expandable sub-row beneath each `EmployeeRow` that renders observation details when the badges are clicked. Uses a `colspan=7` row with the same observation card layout currently in `OrgKpiObservationsSummary`. |
| 2 | `OrgKpiScopedEntryTable.tsx` (interface) | Change `observationCounts` prop from `Map<string, ObservationCounts>` to `Map<string, KpiObservation[]>` (the full observation objects per employee). Keep deriving counts internally. |
| 3 | `OrgKpiEntryCard.tsx` | Replace the `employeeObservationCounts` memo with an `employeeObservations` memo that groups full `KpiObservation[]` by `employee_id`. Pass this to `OrgKpiScopedEntryTable` instead of counts. Remove the `<OrgKpiObservationsSummary>` component usage. |

### UI Behavior
- Badges remain as-is visually (Positive: N, Concern: N) but become clickable (cursor-pointer, slight hover effect)
- Clicking toggles a detail sub-row directly below the employee row
- Sub-row shows each observation: type badge, status badge, ticket number, raiser, title, description (truncated), date
- Multiple employee rows can be expanded simultaneously
- No impact on other pages — `OrgKpiObservationsSummary` component file stays (may be used elsewhere), just removed from this card

### Technical Detail
```
EmployeeRow
├── TableRow (existing data entry row)
│   └── Badges now wrapped in a clickable div with onClick toggle
└── TableRow (new, conditionally rendered)
    └── TableCell colspan=7
        └── Observation detail cards (same format as OrgKpiObservationsSummary)
```

The `EmployeeRow` component gains local `useState<boolean>` for expanded state. The `observationCounts` prop becomes `observations?: KpiObservation[]`, with counts derived via `.filter()`.

