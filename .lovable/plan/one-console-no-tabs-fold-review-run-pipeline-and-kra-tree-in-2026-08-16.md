# One console, no tabs — fold Review Run, Pipeline and KRA Tree into the console surface

## What went wrong

The goal was a single place to run the show. What exists today is five tabs on one page —
Console, Review Run, Pipeline, KRA Tree, KPI Library — each with its own scope handling and its
own way of showing the same KPIs and the same people. That is the duplicity you did not want.
The capability built for Review Run (worksheet + batch advance) is right; putting it behind a
separate tab is what is wrong.

## The single surface

The console stays what it already is: scope bar, stat band, Category → KRA → KPI drill.
Everything else becomes a state of that surface, not a sibling tab.

```text
Performance Console          [ Configure | Review ]   <- one mode switch, not tabs
Scope: August 2026 · all BUs · all departments
Stat band: KPIs · Employees · Pending · Avg score
-----------------------------------------------------
Production & Operations
  v Power generation (KRA)
      Power generation 45 MWh      54 people   pending 21
      Dust emission                50 people   pending 8
        ^ in Review mode the KPI x employee worksheet renders here, inline
```

- **Configure mode** = today's console behaviour (definitions, tuning, group edits, targets).
- **Review mode** = the same tree, but each KRA/KPI row is actionable: value entry, cell scores,
  select rows or people, advance a stage. No new page, no second scope.

### What happens to each tab

- **Review Run** — removed as a tab. Expanding a KRA in Review mode renders the KPI x employee
  worksheet inline under that KRA (same grid, same `bu_console_run_snapshot`, same batch
  advance), scoped to that KRA. That also dissolves the 25,000-cell cap problem: only one KRA
  block loads at a time.
- **Pipeline** — removed as a tab. Its numbers become (a) a Pending column on every
  category / KRA / KPI row and (b) a stage filter in the scope bar ("show only what waits at
  Manager check"). The employee list it used to show is the worksheet's column set.
- **KRA Tree** — removed as a tab. Goal alignment becomes an optional "Alignment" toggle on the
  same tree; goal create/edit stays a dialog off the KRA row.
- **KPI Library / merge proposals** — maintenance, not running the review. It moves out of the
  console into a dialog behind an overflow menu, or into KPI Standardization where the rest of
  that work already lives.

### Employee-first path

The employee drawer stays, opened by clicking a person anywhere on the surface (worksheet column
header or pending list): one person, whole scorecard, one audited approve. It is a drawer over
the console, not a tab.

## Result

One scope. One tree. One mode switch. Configure a KPI, enter a group value, advance a stage,
approve a person — all on the same surface.

## Technical notes

- `src/pages/admin/BuConsole.tsx`: drop `Tabs`/`TabsList`; add `mode: 'configure' | 'review'`
  and a `stageFilter` in `ScopeToolbar`.
- `BuConsoleTree.tsx`: the KRA disclosure (ADR-278) gains a second body — review mode renders
  `<KraWorksheet kraKey scope stage />`; configure mode keeps the KPI list.
- New `KraWorksheet.tsx` extracted from `ReviewRunTab.tsx` — same grid and selection model,
  props-scoped to one KRA. `reviewRunModel.ts` and its tests are reused unchanged.
- `PipelineTab.tsx` removed; the `bu_console_pipeline` RPC is kept and called once per scope to
  fill the Pending column and the stage-filter counts. No schema change.
- `GoalsTab.tsx` / `KraTree.tsx` demoted to an alignment overlay plus dialog; `bu_goal_upsert`
  unchanged. `MergeProposalsTab.tsx` moves behind an overflow-menu dialog.
- No RPC, RLS, grant or table change. Access tiers (ADR-284/285) and final-score immutability
  (POLICY §88) apply exactly as now — the mode switch never widens what the server allows.
- Docs: ADR-289 (console consolidation, supersedes the tab layout in ADR-284/286),
  DOCUMENTATION.md and POLICY §CONSOLE-SINGLE-SURFACE updated in the same change.
- Tests: `consoleLayout.test.tsx` extended for mode switching and inline worksheet mounting;
  `reviewRunModel`, `pipelineStages`, `kraTree` tests kept.
- Rollback: one revert restores the tabs; no data migration involved.

## Two decisions

1. **Mode switch or always-on?** A Configure/Review toggle keeps each mode uncluttered; the
   alternative is one always-actionable tree where scoring controls are simply visible to whoever
   may use them. I lean toggle.
2. **KPI Library** — dialog inside the console, or moved under KPI Standardization where the
   duplicate/merge work already lives? I lean moving it out entirely.