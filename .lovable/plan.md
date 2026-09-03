# "Consumable cost." appears twice on Org KPI Data Entry

## What the data shows (verified)

For September 2026, category *Cost Management & Optimization*, KRA *Consumable cost*, there are **three** `kpis` rows for three different employees, and each row stores a **different legacy `kpi_name` text**:

| variant | legacy `kpi_name` | employees |
|---|---|---|
| A | `Consumable cost.:` (short, 17 chars) | 1 |
| B | `Consumable cost.: - Description: Consumable cost per KW/Hour …` (249 chars) | 1 |
| C | `Consumable cost.: - Description: Consumable cost per MW …` (221 chars) | 1 |

All three now carry **identical structured text** (`kpi_title` / `kpi_description` / `kpi_formula` / `kpi_scoring_logic` = the KW/Hour wording), because the Performance Console definition edit rewrote the structured columns.

Org KPI Data Entry groups cards on `category_id + kra_name + kpi_name` (legacy text is still the join key, per ADR-334/337/351). Three different legacy strings → three cards, each showing "1 employee". Since ADR-351 the cards *render* the structured text, so they now look byte-identical — which is exactly what you are seeing.

So: one KPI logically, three stored name variants. The console edit intentionally never rewrites `kpi_name`.

## Fix

Two parts; part 1 is the actual correction, part 2 prevents the confusion returning.

### 1. Normalise the legacy name (data, reversible)

Use the existing KPI Standardization tooling — no new mechanism:

- Pick the canonical name (recommend the short `Consumable cost.:`, since the long blob is superseded by the structured columns).
- Run the existing dry-run preview for `correct_kpis_range` over the Consumable cost variants, scoped to the affected months (Sep 2026 forward, plus earlier open months if you want them merged too).
- Review the preview: locked/approved months (Feb–Apr 2026 are `approved`) are skipped by the lock predicate; only open rows are renamed.
- Execute. The three variants collapse to one `kpi_name`, so Org KPI Data Entry renders a single card with all three employees, and Propagate targets them together.

### 2. Make the duplication visible before it bites

Add a "same KRA + same structured title, different legacy name" detector to the KPI Standardization dashboard so these split groups are listed for one-click normalisation instead of being discovered on a data-entry screen.

### Not doing

Changing the Org KPI grouping key to the structured title. That key drives propagation, history and reports; regrouping it silently would move rows between cards without an audit trail. Renaming through `correct_kpis_range` is the auditable path.

## Technical notes

- Read-only diagnostics run against `kpis` grouped by `md5(kpi_name)`; already executed for Consumable cost.
- Correction path: existing `correct_kpis_range` RPC + `kpi_standardization_actions` audit row (ADR-330/345). No schema, RLS, grant or RPC-signature change.
- Approved/locked months are excluded by the existing lock predicate (ADR-338/340) — historical scores are untouched.
- Rollback: the standardization action records the previous name per row; re-running the correction in reverse restores it.
- Docs: new ADR + DOCUMENTATION version-history entry; POLICY unchanged (§KPI-TEXT-DISPLAY-SSOT already covers this).

## Steps

1. Read-only scan across all org-level KPIs for name variants sharing KRA + structured title; report the full list (Consumable cost is unlikely to be alone).
2. Dry-run `correct_kpis_range` for Consumable cost; show you the preview counts before executing.
3. Execute, then confirm Org KPI Data Entry shows one card with 3 employees for September.
4. Add the duplicate-variant detector card to KPI Standardization + tests.
5. ADR + DOCUMENTATION + roadmap sync.
