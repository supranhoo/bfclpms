# Performance Console — show which KPIs are actually due this month

## What you asked for
Bi-monthly, quarterly, half-yearly and yearly KPIs still appear in the console for every month of their cycle, with no sign that they are not open for data submission this month. You want a visible marker plus a toggle to show/hide them, so anyone looking at the console knows exactly which KPIs are logged for the selected month.

## Current state (verified)
- The console tree RPC (`bu_console_tree`) does not read `frequency` or `frequency_cycle_start` at all — the KPI nodes it returns carry title, target, UOM, counts and scores only. So today the console cannot tell a due KPI from a dormant one.
- The rule for "is this month open for this KPI" already exists and is used elsewhere in the app: `isKpiLockedForPeriod(frequency, month, year, frequency_cycle_start)` in `src/lib/frequencyUtils.ts`, with the cycle anchor per KPI. This stays the single source of truth — no new rule is invented.
- The per-employee worksheet rows already carry `frequency` and `frequency_cycle_start`, so the row level needs no backend change.

## What will be built

1. **Due / Not due status on every KPI in the console**
   - Each KPI row in the tree gets a small badge: nothing when it is due this month, and a muted "Not due · Quarterly (Apr-Jun)" style chip when the selected month is inside the cycle but not the submission month. The chip names the frequency and the cycle window so the reason is explicit.
   - The KRA row shows a compact count, e.g. "6 KPIs · 2 not due this month".
   - Inside the review worksheet, employee rows for a not-due KPI are shown read-only with the same reason, instead of looking like a missed entry.

2. **Toggle in the scope toolbar: "Due this month only"**
   - Default: OFF — everything is visible, not-due KPIs clearly marked. Turning it ON hides them, so the console shows only what can actually be submitted for the month.
   - The choice persists per user (same pattern the console already uses for its view state) and is reflected in the header line, so a filtered console never looks like the full picture.

3. **Scope counters stay honest**
   - The stat strip gains a "due this month" figure next to the KPI count. With the toggle ON, KPI/KRA/category counts describe the filtered set; the full totals stay visible as secondary text so nobody misreads a smaller number as data loss.

## Technical notes
- `bu_console_tree`: additively return, per KPI node, the distinct `frequency` values and `frequency_cycle_start` values behind that title group (arrays, since a group can span variants). No signature change, no filtering server-side.
- `BuConsoleKpiNode` in `src/hooks/useBuConsole.ts` gains `frequencies: string[]` and `frequency_cycle_starts: string[]`.
- New pure helper `src/lib/review/kpiDueForPeriod.ts` wrapping `isKpiLockedForPeriod` for a group: due when at least one row in the group is open for the period; label built with `getCycleLabel` / `buildCycleScopeLabel`. Unit tested for monthly, bi-monthly, quarterly, half-yearly, yearly and mixed groups, plus unknown/blank frequency (treated as due — never hide data on missing config).
- Toggle state lives with the other `ScopeToolbar` filters; filtering is client-side over the already-loaded tree, so no extra round-trip.
- Tests: extend `consoleLayout.test.tsx` (badge renders, toggle hides only not-due nodes, counts follow the filter) and add `kpiDueForPeriod.test.ts`.
- Docs: ADR-294 plus POLICY §CONSOLE-DUE-THIS-MONTH — the console never silently hides a KPI; dormant cycles are labelled, and hiding is an explicit, visible user choice.

## Risk and impact
- **Data:** none. Read-only change plus two extra columns in an existing read RPC.
- **Workflow:** no change to who can submit or score; the badge reports existing lock behaviour, it does not create it.
- **Regression:** low — the tree payload grows by two array fields; all filtering is additive and defaults to today's behaviour.
- **Rollback:** revert the RPC to its previous body and the frontend commit; no schema migration to undo.
