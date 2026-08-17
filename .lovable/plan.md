# Performance Console — remove the duplicity, add one KPI creation path

## What the screenshot shows

Inside a single KRA the same four KPIs are printed twice:

1. the **definition list** (name, org-level tag, not-due badge, employees, weightage, avg score, Open)
2. the **worksheet's sticky KPI column** right below it (same four names, "5 people", a tuning icon)

That happened because ADR-294 appended the review worksheet under the definition list instead of
replacing it. The panel now stacks two lists of the same rows, plus a second Refresh button, plus a
second set of counts — three duplications in one panel.

## Principle for this pass

One row per KPI, everywhere. A KPI row is a **thing you read** and a **thing you act on** at the
same time; it must never be printed twice on one screen.

## 1. Collapse the KRA panel into one list

Expanding a KRA shows **one** KPI list. Each row:

```text
02  Power generation from 45 MWh/AFBC        19 people   6 values   —      [ open ]
    Incentive %   Shared value   Not due · Bi-Monthly (Jul-Aug)
```

- The definition facts (name, sub-line, tags, employees, weightage, avg score) stay exactly where
  they are today.
- The worksheet's per-employee cells become the **expansion of that KPI row**, not a second list:
  click a row → the employee cells for that one KPI slide open underneath it. So the drill is
  Category → KRA → KPI → people, one level at a time, and only one KPI's cells load.
- The worksheet's KPI column and its own Refresh disappear. The run bar
  (`Review · Manager · n pending · n scored`) moves to the KRA header line as plain counts, next to
  `4 mapped KPIs · 54 employees`.
- The tuning (sliders) icon moves onto the single KPI row, next to `Open`.
- Selection, batch preview/commit, the sticky action bar and `bu_console_kpi_advance` are unchanged
  — they just operate on the cells of the open KPI.

Net effect on the screenshot: two boxed lists become one, and the panel loses roughly half its
height.

## 2. One stage control, one refresh, one scope line

- Stage rail stays the single stage picker; the worksheet no longer restates the stage.
- One Refresh in the console header. The per-KRA Refresh is removed.
- The scope line is printed once (header). The breadcrumb keeps only Category → KRA → KPI.

## 3. Adding a KPI from the console

Today the console can only edit what already exists; creating a KPI means leaving for the
per-employee Assign KRA dialog. Add **New KPI** as the primary action on the console header (admins
and, once out of KRA Set, the write tiers already defined in ADR-284/285 — auditor keeps read-only
on data it does not own).

The dialog asks three things, in this order:

1. **Where** — category and KRA (pre-filled from whatever is open).
2. **What kind** — this is the tag that decides everything downstream:
   - **Individual** — each person carries their own target and value.
   - **Shared value** (production target vs actual): one value is entered once and lands on every
     mapped person. Backed by the existing `is_org_level` + `org_level_scope = organization`
     primitive and `propagate_org_kpi_value`.
   - **Department event** (LTI / safety incident): one occurrence marks the whole department it
     hits. Same primitive with `org_level_scope = department`.
3. **Who** — pick people by department / manager / BU multi-select (the console's own cascading
   filters), or individual employees. The dialog shows the resulting head count before it writes.

Definition fields (target, UoM, weightage, frequency + cycle anchor, threshold mode, qualitative
options) reuse the group-edit whitelist already validated by `bu_console_editable_fields()`, so
creation and group edit stay one contract. The "apply to current + future months" control from
ADR-291 is offered on creation too.

## 4. What each role sees

Same page for everyone, different verbs — no separate screens:

| Role | Scope | Can do |
|---|---|---|
| Admin | everything | read, create, group edit, tune, advance |
| Management | everything | read, create/edit/advance once the KPI has left KRA Set |
| Auditor | everything, filtered | read everywhere; act only within assignment, never population-wide |
| Manager / skip / functional | own chain | read own people; act at their own stage |

This is what the server already enforces; the change is that the UI stops showing controls that the
server will refuse.

## Technical notes

- `BuConsoleTree.tsx` — the KRA disclosure renders one KPI list; each KPI row gains an inline
  "people" expansion slot. `kraPanelPlacement="append"` is dropped.
- `KraWorksheet.tsx` — split: the grid body becomes `KpiPeopleStrip` (one KPI's employee cells,
  virtualized columns, same `reviewRunModel` selection helpers and same
  `bu_console_run_snapshot` call with the KPI filter); the KRA-level counters move up into the
  header. No RPC signature change.
- New `ConsoleKpiCreateDialog.tsx` + a `bu_console_kpi_create(scope, definition, employee_ids[])`
  SECURITY DEFINER RPC that reuses the existing insert path and writes one
  `bu_console_edit_runs` row so creation is undoable like any other run. Grants and access checks
  follow `bu_console_can_write` / `bu_console_kpi_actionable`.
- Existing per-employee `AdminKpiCreateDialog` stays; the console dialog is the many-people path.
- Tests: `consoleLayout.test.tsx` extended to assert a KRA panel renders each KPI name exactly once;
  new `kpiCreateModel.test.ts` for the type → `is_org_level`/`org_level_scope` mapping and the
  head-count preview.
- Docs: ADR-297, POLICY §CONSOLE-SINGLE-KPI-ROW and §CONSOLE-KPI-CREATE; DOCUMENTATION.md updated in
  the same change.
- Rollback: the layout half is presentation-only (one revert). The create RPC is additive.

## One decision for you

For a **Department event (LTI)** — when it is logged against a department, should it score every
person in that department the same, or only the people the KPI is mapped to? I lean "only the mapped
people", so the department is the trigger, not an automatic blanket write.
