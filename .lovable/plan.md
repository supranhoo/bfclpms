# KPI Data Ledger — per-KPI data tables with history, scoped visibility and one-time audit sign-off

## What you are asking for

Every central KPI should carry its own **data table** (like your Production and Power Gen 8MW sheets): one row per month per scope, with the columns that KPI actually needs, kept for years, visible to each employee **only for the rows that affect them**, and reviewable in full by Audit, who validates it once for everybody.

## What exists today (verified)

- `org_kpi_values` holds **one row per KPI per period per scope** — value, target, bands, remarks, evidence, plus the ADR-301 approval columns. So monthly history already exists, but only as a single number.
- `org_kpi_value_history` records old → new value changes for that row.
- `production_targets` already stores almost exactly your uploaded sheet: division / BU / department / sub-unit, month, year, `target_value`, `achieved_value`, `incentive_percent`, remarks. It is a **one-off table hardcoded for the production incentive** — nothing else can reuse it.
- There is **no** generic per-KPI detail table, no per-KPI column definition, and no employee-scoped view of underlying data.

So the capability is half-built in a KPI-specific way. The gap is a general, configurable mechanism.

## The approach: one ledger, configurable columns

Rather than a new table per KPI (unmaintainable — every new KPI would need a migration), we add **one ledger** whose *shape* is configuration:

```text
KPI definition (category + KRA + KPI)
   └── Dataset definition            <- admin: what columns this KPI's table has
         ├── Column: Month      (period, required, key)
         ├── Column: BU         (org ref, required, key)
         ├── Column: Target     (number)
         ├── Column: Achieved   (number)
         ├── Column: Ach %      (formula: Achieved / Target)
         └── Column: Incentive %(number)
   └── Ledger rows                   <- the actual data, one per period per scope
         Jul-25 | CLU | 5,156 | 5,020 | 97.37% | 3.08%
         Aug-25 | CLU | 6,249 | 5,560 | 88.98% | 0.00%
         ...
   └── Roll-up rule                  <- how rows become the KPI's headline number
         Sum(Achieved) / Sum(Target) for the period  -> 104%
```

Different KPI, different columns — Safety LTI/STI gets `Man-hours`, `LTI count`, `STI count`, `Severity rate`; Manning Norm gets `Sanctioned`, `On-roll`, `Gap`, `Adherence %`. No migration per KPI; an admin defines the columns.

## Visibility — the core requirement

Each ledger row carries a **scope** (division / BU / department / location / grade / level / employee) and an optional **impact list** for multi-department KPIs. Who sees what is decided server-side, never in the client:

| Who | Sees |
|---|---|
| Employee | Only rows whose scope covers them, or that name them in the impact list. Safety LTI is captured for the whole organisation; an employee sees their own plant's rows only. |
| Data provider (owner) | Every row for the KPIs they own, and can edit them until submission. |
| Dept / BU head, approvers | Every row inside their own org subtree, plus the rows currently awaiting their step. |
| Audit / HR PMS / Management | The whole table, all periods, all scopes — with a one-click **Validate all** for a period. |
| Admin | Everything. |

Multi-department KPIs are handled by the impact list: one row can be tagged to several departments (or "whole organisation"), and everyone in any of them sees it. Limited-impact KPIs simply carry a single scope. Both come out of the same rule — no special cases.

## Audit validation "once for all"

Audit does not tick rows one by one. They open the KPI's period, see the full table with totals and any exception flags (missing month, target zero, out-of-range achievement, late entry), and record **one validation** for the period. That validation is stamped on every row in scope, is immutable, and is what unlocks propagation into employee scorecards. If any row changes afterwards, validation for that period is automatically invalidated and must be re-done — no silent edits behind an audit sign-off.

## How it plugs into what you already have

The ledger sits **under** the central approval ladder you saw earlier, it does not replace it:

1. Provider fills the ledger rows for the month (grid, or Excel upload with a dry-run preview).
2. The roll-up rule computes the headline achieved value — the provider cannot type a number that contradicts the table (an override is possible but demands a reason and is recorded).
3. That value goes up the existing ADR-301 ladder: RM1 → BU Head → HR → Management.
4. Audit validates the period.
5. `org_kpi_finalise` propagates as it does today: same value, each employee scored against their own bands.

Employees get a new **"Data behind this KPI"** view on their scorecard showing their own slice of the table with its 12-month history, so a score is never an unexplained number.

## Historical data

Rows are never overwritten. Corrections write a new revision with the reason and actor, so the year view (Jul-25 → Jun-26, exactly like your sheets) always reconstructs what was known at any point. Old years stay queryable; the ledger is included in backups automatically through the existing coverage RPC.

## Technical design

- **New tables** (all additive, RLS-first, GRANTed, backup-covered):
  - `org_kpi_dataset_defs` — one per KPI identity: title, granularity (monthly / weekly / event), roll-up rule (`sum_ratio`, `sum`, `avg`, `weighted`, `last`), whether provider override is allowed.
  - `org_kpi_dataset_columns` — ordered column definitions: key, label, data type (number / percent / text / date / org-ref / employee-ref / select), unit, required, editable-by, formula expression for derived columns, display format.
  - `org_kpi_dataset_rows` — the data: dataset id, period + year, scope columns (division / BU / department / location / grade / level / employee), `impact_scope` JSONB for multi-department rows, `values` JSONB keyed by column key, revision number, entered/updated by, timestamps.
  - `org_kpi_dataset_row_history` — append-only revision trail (old/new values, reason, actor).
  - `org_kpi_dataset_validations` — one row per dataset + period + validator: verdict, note, timestamp; invalidated automatically by a row-change trigger.
- **RPCs only** (SECURITY DEFINER, pinned `search_path`, dry-run first), mirroring the ADR-301 pattern: `org_kpi_dataset_upsert_def`, `org_kpi_dataset_rows_read` (applies the visibility matrix in-function), `org_kpi_dataset_row_save`, `org_kpi_dataset_bulk_import`, `org_kpi_dataset_rollup` (returns the headline value + working), `org_kpi_dataset_validate`.
- **Visibility** is a single SECURITY DEFINER predicate `can_read_kpi_dataset_row(row, user)` reused by RLS and by the read RPC, so the grid and the employee view can never diverge. Reads are paginated server-side (default 100 rows) per the large-dataset rule.
- **Zero hardcoding**: column sets, roll-up rules, granularity and validation thresholds are all data. Nothing about Production, Safety or Manning Norm appears in code.
- **Frontend**: `OrgKpiDatasetGrid` (provider entry + approver read-only), `KpiDataHistoryPanel` (employee slice, 12-month trend), `DatasetSchemaDialog` (admin column designer), an Audit period view with totals and exception flags. Business logic lives in `src/services/orgKpiDataset/`; components render only.
- **Migration of what exists**: `production_targets` is left untouched and running. It gets a read-only adapter so the production KPI's ledger view shows those rows from day one; a later, separate step can move it fully once the ledger is proven.

## Risk and impact

- **Data:** purely additive — no existing table, constraint or score path is modified. No historical value is rewritten.
- **Workflow:** the ladder is unchanged; the ledger adds a pre-step and Audit adds a validation gate before propagation. Feature-flagged per KPI: a KPI with no dataset definition behaves exactly as today.
- **UI/UX:** one new panel in the KPI drawer, one new read-only panel on the employee scorecard. No navigation change.
- **Regression risk:** low, concentrated in the roll-up (a wrong rule would feed a wrong headline value). Mitigated by making the ladder value always show its working, a dry-run before every propagation, and unit tests for each roll-up rule.
- **Scale:** ~200 KPIs x 12 months x up to a few hundred scope rows is comfortably indexed; reads are paged and scoped, never a full-table client fetch.
- **Rollback:** drop the five tables and the RPCs; nothing else depends on them.

## Delivery order

1. Schema + RPCs + visibility predicate, with tests (no UI).
2. Admin column designer and provider grid; wire the roll-up into the central value, override with reason.
3. Excel round-trip import/export with dry-run preview.
4. Employee "Data behind this KPI" view.
5. Audit period view and one-shot validation, gating propagation.
6. Production-targets adapter, then ADR + POLICY + DOCUMENTATION updates.

Steps 1-2 are the meaningful milestone; each later step is independently shippable.
