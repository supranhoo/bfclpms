# Org KPI Data Entry shows the old KPI text (structured update not visible)

## What I verified

- The KPI row itself **was** updated by the Performance Console. In the database,
  every month from Apr-2026 onward for "Power generation from WHRB 1050 TPD"
  carries the structured fields (`kpi_title` = "Achieve 1050 TPD Power Generation target",
  plus description / formula / scoring logic), last touched 01-02 Sep 2026.
- `kpi_name` still holds the old pasted blob ("Achieve Power generation target from
  WHRB 1050 TPD .: - Formula: ... - Scoring Logic: ..."). This is **by design**:
  `kpi_name` is the join key for history, reports and Org KPI matching and the
  console never rewrites it (ADR-334 / ADR-337).
- The Org KPI Data Entry card prints the raw legacy blob:
  `OrgKpiEntryCard.tsx` line 769 renders `{data.kpiName}` directly, instead of the
  shared structured-text resolver (`KpiTitle` / `KpiTextBlocks`, ADR-269b) that the
  employee scorecard and review panel already use.
- The page's data source (`get_org_kpi_data_entry_snapshot`) does not even return
  `kpi_title`, `kpi_description`, `kpi_formula`, `kpi_scoring_logic` — its `base`
  CTE selects an explicit column list without them, so the client has nothing to
  render even if the card were fixed.

So nothing is wrong with the update itself. This is a display gap on one surface:
Org KPI Data Entry is still on the pre-ADR-269b rendering path.

## 5 Whys

1. Why does the old text show? The card renders `kpi_name` verbatim.
2. Why `kpi_name`? The card predates the structured text split and was never migrated.
3. Why wasn't it migrated? The snapshot RPC doesn't expose the structured columns,
   so migrating the card alone would have shown blanks.
4. Why weren't the columns added? ADR-269b rollout covered scorecard/review surfaces;
   the Org KPI entry surface wasn't on the audit list.
5. Why wasn't it caught? No test asserts that a structured KPI renders its
   `kpi_title` on every KPI-displaying surface.

## Fix

1. **Backend (migration):** add `kpi_title`, `kpi_description`, `kpi_formula`,
   `kpi_scoring_logic` to the `base` CTE of `get_org_kpi_data_entry_snapshot` so the
   `kpi` payload carries them. Read-only additive change; no schema, RLS or grant change.
   Grouping/dedup keys stay on `category_id + kra_name + kpi_name` — unchanged.
2. **Frontend:** in `OrgKpiEntryCard.tsx`, replace the raw `{data.kpiName}` heading
   with `<KpiTitle>` + `<KpiTextBlocks collapsible>` fed by the KPI row, exactly as the
   review panel does. Legacy rows (no `kpi_title`) keep today's rendering byte-for-byte.
   Pass the same resolved title into the child surfaces that currently receive
   `kpiName` for display only (evidence dialog headers, confirm dialogs, gap dialog);
   all matching/lookup logic keeps using raw `kpi_name`.
3. **Types/props:** extend the card's `data` shape with the four optional structured
   fields (nullable), plumbed from the snapshot hook.

## What changes visually

Org KPI Data Entry cards for structured KPIs: a one-line bold title, then labelled
Description / Formula / Scoring Logic blocks (Formula + Scoring Logic collapsed on
mobile) instead of the long pasted blob. Legacy KPIs look exactly as today. No layout,
filter, or action changes; Achieved value / Remark / Propagate untouched.

## Risk & impact

- Data: none — read-only RPC column addition.
- Workflow: none; keys, propagation and matching untouched.
- Regression risk: low, confined to one card's header; main risk is a KPI-name-keyed
  lookup accidentally switched to the title — avoided by keeping `kpiName` as the
  data prop and using the resolver only for rendering.
- Rollback: revert the component change; the extra RPC columns are inert.

## Tests

- New `src/test/orgKpiStructuredText.test.ts`: structured row resolves to `kpi_title`
  with separate blocks; legacy row (null `kpi_title`) falls back to the existing
  `kpi_name` rendering; the snapshot payload shape includes the four fields.
- Re-run existing Org KPI suites (48 tests) plus typecheck and build.

## Docs

- `docs/adr/ADR-351.md`, `DOCUMENTATION.md` version entry.
- `POLICY.md` §KPI-TEXT-DISPLAY-SSOT: any surface displaying a KPI must render through
  `resolveKpiText` (KpiTitle / KpiTextBlocks); raw `kpi_name` may be used for keys only.

## Also worth noting

If you want the *stored* legacy name itself corrected (so exports keyed on the old blob
read cleanly), that is the separate, explicit `correct_kpis_range` rename operation in
KPI Standardization — say the word and I'll scope it as a follow-up.
