# KPI text split — forward-only, effective July 2026

Scope change: nothing in FY 2025-26 or earlier is touched. The structured
split applies to the new assessment year (July 2026 onward, FY 2026-27+).

## What the live data says (measured)

Rows in the new assessment year (Jul 2026 → Jun 2027) already in `kpis`: **6,070**
(1,020 distinct KPI names).

| Signal (FY 2026-27 rows only) | Count | Share |
| --- | --- | --- |
| Text carries both a Formula and a Scoring marker → splits cleanly | 5,906 | 97.3% |
| Partial / no markers → needs a human decision | 164 | 2.7% |
| First line already usable as a short title (≤120 chars) | 5,372 | 88.5% |
| First line too long, title needs trimming | 698 | 11.5% |

Legacy rows left untouched: 14,628 (FY 2025-26 and earlier).

## Design: additive columns + a fiscal cutover, no legacy rewrite

`kpi_name` is a live matching key — `org_kpi_values` links to `kpis` by exact
`kpi_name` text, `kpi_name_aliases` holds 260 alias rows, and duplicate
prevention is `kra_name + kpi_name + period`. So `kpi_name` is never rewritten,
in any year.

1. **New nullable columns on `kpis` and `kpi_templates`:** `kpi_title`,
   `kpi_description`, `kpi_formula`, `kpi_scoring_logic`.
2. **Cutover rule (single SSOT helper):** a KPI is "structured" when its fiscal
   cycle starts July 2026 or later — resolved through the existing
   `fiscalYearForMonth` / `fiscal_year_for_month` helpers, never a hardcoded
   date in a component.
3. **Backfill limited to the cutover window:** the parse job only ever selects
   rows in FY 2026-27+. Dry-run first, audit row per change, rollback = null out
   the four new columns. Legacy rows are excluded by the query itself, so they
   cannot be touched even by a mis-click.
4. **Display resolver:** `src/lib/textFormatting.ts` gains
   `resolveKpiText(kpi)` — returns the structured parts when present, otherwise
   falls back to today's `getKpiSummaryText` / `splitKpiTextSegments` parsing.
   Legacy KPIs therefore render exactly as they do now, byte-for-byte.
5. **Authoring from July 2026 onward:** the KPI editor / template editor show
   four separate fields (Title, Description, Formula, Scoring Logic). On save
   the system composes `kpi_name` from those parts in the existing text format,
   so every downstream name-match keeps working unchanged. For legacy periods
   the editor keeps the single free-text field.
6. **Low-confidence queue:** the 164 unparsed + 698 long-title rows land in an
   admin list with an inline editor. No auto-guessing.

## Impact

- **Existing assessment year:** zero change — no column, no row, no rendering
  path for FY 2025-26 and earlier is modified.
- **Review workflow / scoring / final scores:** unchanged; the split touches
  descriptive text only, never thresholds, weightage, status or scores.
- **Org KPI linkage, aliases, duplicate constraint, standardization registry:**
  unchanged, because `kpi_name` stays the composed canonical text.
- **Reports / exports:** unchanged by default. A follow-up can add separate
  Description / Formula / Scoring columns that fall back to the parser for
  legacy rows so a mixed-year report still renders fully.
- **Regression risk:** low — additive schema, fiscal-gated writes, resolver
  fallback, and a rollback that is a single UPDATE to NULL.
- **Scale:** backfill batched over ~6k rows; admin queue server-paginated.

## Technical details

- Migration: four nullable text columns on `kpis` and `kpi_templates` (no new
  table, so no new GRANT surface), plus
  `kpi_split_dry_run(p_limit, p_offset)` and `kpi_split_apply(p_ids[])`
  SECURITY DEFINER RPCs that hard-filter to FY ≥ 2026-27 via
  `public.fiscal_year_for_month(review_period, review_year) >= 2026`.
- Audit: `kpi_text_split_audit` (kpi_id, before/after parts, actor, run id)
  with GRANTs and admin-only RLS.
- Parser shared: TS in `src/lib/textFormatting.ts`, PL/pgSQL mirror for the
  backfill, with a fixture test asserting both produce identical splits.
- Compose-on-save helper `composeKpiName(parts)` with a test proving
  `compose(parse(name)) === name` for the 5,906 clean rows' shapes.
- Tests: parser/compose round-trip, a contract test that the migration and RPCs
  never write `kpi_name` and never select rows below the cutover, and a render
  test that a legacy KPI is unaffected.
- Docs: new ADR, `POLICY §KPI-TEXT-SPLIT-FORWARD-ONLY`, DOCUMENTATION.md
  version-history entry.

## Phasing

1. Columns + audit table + dry-run report (counts above, per-KRA breakdown) — no writes.
2. Apply backfill to the 97.3% clean FY 2026-27 rows + display resolver.
3. Structured authoring fields in the KPI/template editors, fiscal-gated.
4. Low-confidence admin queue.
5. Optional: reports and notifications adopt the structured fields.
