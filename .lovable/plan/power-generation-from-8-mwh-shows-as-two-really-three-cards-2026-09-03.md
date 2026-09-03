# "Power generation from 8 MWh" shows as two (really three) cards

## Why this happens — verified in the database

Org KPI Data Entry groups cards on `category_id + kra_name + kpi_name`. The
Performance Console edits the *structured* fields (`kpi_title`, description,
formula, scoring logic) but never rewrites the legacy `kpi_name` join key — by
design (ADR-334/337), because that string is the matching key for history,
org KPI values and reports. Since ADR-351 the cards render the structured text,
so rows that carry the same edited definition under different legacy names now
look byte-identical on screen.

For September 2026 the KPI exists as three groups, all open (`kra_set`), all
carrying the same structured title:

| category | legacy `kpi_name` | employees |
|---|---|---|
| Production & Operations | `Power generation from 8 MWh` (27 chars) | 14 |
| Production & Operations | `Power generation from 8 MWh (incentive %)(Aug-Sep,…)` (225 chars) | 3 |
| Production | same text, 232 chars (trailing variance) | 2 |

Same picture for July (12 + 3), August (16 + 3 + 2) and October (14 + 3 + 2).
So there is no data corruption and nothing about yesterday's rollback is wrong:
it is one definition stored under three legacy names, two of them in a second
category ("Production" vs "Production & Operations").

## Fix

1. **Normalise the legacy names.** Run the existing reversible
   `correct_kpis_range` engine to rename the 225-char and 232-char variants to
   the canonical `Power generation from 8 MWh` for the open months
   (Jul 2026 → Jun 2027). Locked/approved and pre-May-2026 rows are skipped by
   the engine's guard (POLICY §88I). One `rename_kpis_range` audit row per run,
   fully undoable.
2. **Consolidate the category.** The 2 employees sitting under the "Production"
   category are moved to "Production & Operations" so the KPI collapses to a
   single card; without this they stay a separate card even after the rename.
   Done as a scoped, audited update with a before-image, same as step 1.
   (Say the word if those two should instead stay under "Production" — then we
   leave two cards, correctly labelled by category.)
3. **Verify** on `/admin/org-kpi-data` for Jul–Oct 2026: one card,
   19 employees, previous entries and evidence intact.

## Preventing the repeat

- The "Same KPI, Several Legacy Names" detector (ADR-352a) already exists on
  KPI Standardization → Health but only groups within a category; extend it to
  also report the same `kpi_title` split across categories, so this shape is
  visible and one-click normalisable.
- Add a post-save hint in the Performance Console group edit: when the edited
  definition spans more than one legacy `kpi_name`, show "this KPI is stored
  under N legacy names — normalise" linking to the Health card.

## Risk & impact

- Data: text/category only. No score, target, weightage, evidence or workflow
  write. Employee assignments unchanged.
- Regression: low; renames go through the engine already used since ADR-330.
- Rollback: each run stores the per-row previous value and can be reversed.

## Tests & docs

- Extend `src/test/splitKpiNameVariants.test.ts` for the cross-category case.
- ADR-354, `DOCUMENTATION.md` version entry, `POLICY.md` §KPI-NAME-CANONICALISATION,
  `roadmap.md`.
