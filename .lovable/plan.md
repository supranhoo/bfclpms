

# Add Observer Name Next to Ticket Number in Observations Summary

## What Changes

In the **Employee Observations** panel on the Org KPI Data Entry page, each observation row currently shows: Type badge, Status badge, Ticket number. The observer's name (who created the observation) will be added right after the ticket number.

## Technical Details

### File: `src/components/admin/OrgKpiObservationsSummary.tsx`

In the observation row's header badges area (around line 75-85), after the ticket number span, add a new span displaying `obs.created_by_profile?.full_name` (or email as fallback).

Current display:
```
[Positive] [Open] OBS-00040
```

Updated display:
```
[Positive] [Open] OBS-00040 · Subhransu Sekhar Nayak
```

The name will use the same muted styling as other metadata text, separated by a dot for visual clarity.

### File: `DOCUMENTATION.md`
- Minor changelog entry for the UI enhancement.

No database, RLS, or hook changes needed -- the `created_by_profile` data (with `full_name` and `email`) is already fetched by the `useObservationsByKpis` hook.
