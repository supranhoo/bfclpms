# ADR-352a — One KPI, several legacy names: duplicate cards on Org KPI Data Entry

Date: 2026-09-03 · Status: Accepted · Related: ADR-330, ADR-334, ADR-337, ADR-351

## Context

Reported 3 Sep 2026: *Cost Management & Optimization → Consumable cost* rendered
as two (in fact three) identical "Consumable cost.:" cards on
`/admin/org-kpi-data`, each showing "1 employee".

Verified in the database — for September 2026 that KRA held three org-level rows
under three different legacy `kpi_name` strings:

| variant | `kpi_name` | employees |
|---|---|---|
| A | `Consumable cost.:` (17 chars) | 1 |
| B | `Consumable cost.: - Description: … per KW/Hour …` (249 chars) | 1 |
| C | `Consumable cost.: - Description: … per MW …` (221 chars) | 1 |

All three carried **identical** structured text (`kpi_title` / `kpi_description` /
`kpi_formula` / `kpi_scoring_logic`), written by a Performance Console definition
edit. The console never rewrites `kpi_name` by design (ADR-334/337), and Org KPI
Data Entry groups cards on `category_id + kra_name + kpi_name`. Since ADR-351 the
cards render the *structured* text, so the three groups became visually
indistinguishable — one KPI, three cards.

## Decision

1. **Correction (data, reversible).** The open rows (Aug + Sep 2026; earlier
   months are `approved`/locked) were renamed to the canonical
   `Consumable cost.:`, mirroring `correct_kpis_range` semantics, with a
   `kpi_standardization_actions` row of type `rename_kpis_range` carrying the
   per-row before-state. Locked and pre-May-2026 rows were untouched
   (POLICY §88I).
2. **Detector.** New read-only `public.list_split_kpi_name_variants()` lists
   every May-2026+ group where one `kpi_title` is stored under multiple
   `kpi_name` values and at least one row is still open. Surfaced as the
   "Same KPI, Several Legacy Names" card on KPI Standardization → Health, with a
   per-group **Normalise** action that runs the existing reversible
   `correct_kpis_range` engine against the non-canonical variants only
   (canonical = shortest stored name).

Not done: regrouping Org KPI Data Entry on `kpi_title`. That key drives
propagation, history and reports; moving rows between cards silently would leave
no audit trail. Renaming through the standardization engine is the auditable path.

## Consequences

- Consumable cost now renders as one card with all three employees for Aug/Sep 2026.
- The scan showed ~24 other split groups (SOP/SMP Creation 13 variants, Proactive
  Safety Reporting 8, …) — all now visible and one-click normalisable.
- No schema change, no RLS change, no scoring or workflow write.

Rollback: the standardization action stores each row's previous `kpi_name`;
re-applying it in reverse restores the split. `list_split_kpi_name_variants()`
can be dropped without affecting anything else.

Tests: `src/test/splitKpiNameVariants.test.ts` (3).
