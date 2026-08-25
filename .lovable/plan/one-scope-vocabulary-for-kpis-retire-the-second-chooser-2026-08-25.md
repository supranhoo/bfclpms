# One scope vocabulary for KPIs (retire the second chooser)

## You are right — it is the same concept, named twice

The "Individual / Shared value / Department event" cards in **New KPI for this scope** are not a new
system. They are a friendly wrapper that the create RPC translates straight back into the *existing*
scope fields:

| Card in the dialog | What actually gets written |
|---|---|
| Individual | `is_org_level = false`, `org_level_scope = 'organization'` (meaningless leftover) |
| Shared value | `is_org_level = true`, `org_level_scope = 'organization'` |
| Department event | `is_org_level = true`, `org_level_scope = 'department'` |

The existing scope picker (Organization / Department / Employee, with Division, Business Unit,
Location, PMS Grade, Level marked "Soon") drives the same `org_level_scope` column. Live data
confirms it: every KPI carries `org_level_scope` of `organization`, `department` or `employee`, and
the third column the create RPC also sets (`kpi_group_type`) is `individual` on all 20,718 rows — it
adds nothing.

So: two names, three columns, one idea. Worth collapsing before more scopes ship.

## What changes

1. **The create dialog stops inventing words.** The three cards are replaced by the same scope
   language used everywhere else:
   - *Each person has their own number* → Individual (no scope)
   - *One shared value* → Organization scope
   - *One event per department* → Department scope
   Employee scope stays available where it already applies, and the not-yet-built scopes
   (Division, BU, Location, PMS Grade, Level) appear disabled with the same "Soon" treatment as the
   existing menu, so both surfaces read identically.

2. **One source of truth in code.** A single `kpiScope.ts` model holds the scope list, labels,
   hints, icons and the mapping to `is_org_level` / `org_level_scope`. Both the create dialog and
   the scope-change menu import it, so a new scope is added in exactly one place.

3. **The server stops writing a third vocabulary.** `bu_console_kpi_create` accepts a scope
   (`individual | organization | department | employee`) — still accepting the old `kind` values so
   nothing in flight breaks — and writes `is_org_level` / `org_level_scope` only. `kpi_group_type`
   is left untouched (deprecated, not dropped: it is additive-safe and reversible).

4. **Individual KPIs stop getting a phantom scope.** New individual KPIs write
   `org_level_scope = NULL` instead of `'organization'`. No back-fill of existing rows — reads
   already ignore the field when `is_org_level = false`.

## What does not change

- No historical data is rewritten; no column is dropped.
- Scoring, propagation, the data ledger and the exception (LTI/STI) release flow are untouched —
  they already read `org_level_scope`.
- The "Soon" scopes remain disabled; this is vocabulary unification, not new scope capability.

## Risk and impact

- **Data:** additive only. New rows differ solely by `org_level_scope = NULL` for individual KPIs.
  Rollback = revert the RPC body; no data repair needed.
- **Workflow:** none. Same three behaviours, renamed.
- **UI:** the create dialog's top row of three cards is relabelled and gains the disabled future
  scopes; layout and dialog width unchanged.
- **Regression risk:** low-medium — anything reading `kpi_group_type`. A code sweep runs first; if
  a live reader exists, the RPC keeps writing it and only the UI is unified.
- **Scalability:** no new queries.

## Technical notes

- New: `src/lib/review/kpiScope.ts` (scope enum, labels, hints, `toKpiColumns()`), with unit tests
  covering every scope → column mapping and the legacy `kind` aliases.
- Edited: `ConsoleKpiCreateDialog.tsx` (cards from the shared model), `OrgKpiEntryCard.tsx` (scope
  menu from the shared model), `useBuConsole.ts` (`ConsoleKpiKind` → `KpiScope`, alias kept).
- Migration: `CREATE OR REPLACE FUNCTION bu_console_kpi_create` — signature unchanged, reads
  `p_kpi->>'scope'` with `kind` fallback.
- Docs: ADR-319, `POLICY §KPI-SCOPE-SINGLE-VOCABULARY`, DOCUMENTATION.md version history.
