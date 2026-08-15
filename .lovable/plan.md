# Splitting KPI text into Detail / Formula / Scoring Logic

## What the live data says (measured, not assumed)

Across `kpis` (20,698 rows, 1,397 distinct names):

| Signal | Count | Share |
| --- | --- | --- |
| Rows with both a Formula and a Scoring marker | 20,222 | 97.7% |
| Scoring marker only (no formula) | 388 | 1.9% |
| Formula marker only | 48 | 0.2% |
| Neither marker (plain names) | 40 | 0.2% |
| First line usable as a short title (3-120 chars) | 18,540 | 89.6% |
| First line longer than 120 chars (title needs manual trim) | 2,158 | 10.4% |

So ~97.7% split automatically into three parts with high confidence; ~10% will still need a human to shorten the title line; ~476 rows (2.3%) need manual classification.

## The constraint that decides the design

`kpi_name` is not just a label — it is a live matching key:

- `org_kpi_values` links to `kpis` by exact `kpi_name` text (1.3M matched pairs today).
- 260 rows in `kpi_name_aliases` map old text to canonical text.
- The duplicate-prevention constraint is `kra_name + kpi_name + period`.
- 926 `kpi_templates` rows and org KPI owner/history tables carry the same text.
- `kpi_definitions_master` is empty (0 rows), so it cannot be used as the anchor.

Rewriting `kpi_name` in place would silently break Org KPI linkage, alias resolution, duplicate detection and historical reports. So the split must be **additive**.

## Approach: additive split, zero change to review mechanics

1. **Add three nullable columns to `kpis`** (and mirror on `kpi_templates`): `kpi_description`, `kpi_formula`, `kpi_scoring_logic`, plus `kpi_title` for the short display name. `kpi_name` stays byte-identical forever and remains the matching key.
2. **One-time parse job (dry-run first)** writes the three parts from the existing text. It never edits `kpi_name`, never touches scores, submissions, thresholds or statuses. Every parsed row is logged to an audit table so the whole run is reversible by nulling the new columns.
3. **Display resolver (SSOT)** extends `src/lib/textFormatting.ts`: use the structured columns when present, otherwise fall back to today's `getKpiSummaryText` / `splitKpiTextSegments` parsing. Nothing in the UI breaks if a row was not parsed.
4. **Admin review queue** for the 2,158 long-title and 476 unparsed rows: an admin screen listing low-confidence rows with an inline editor for title/description/formula/scoring. No bulk auto-guessing on these.
5. **Writes stay legacy-compatible**: when an admin edits the structured fields, the system re-composes `kpi_name` only if it would be byte-identical; otherwise it leaves `kpi_name` alone and records the divergence. New KPIs created after the split write both the structured fields and a composed `kpi_name`.

## Impact assessment

- **Review workflow, scoring, final scores:** unchanged. No column read by the scoring chain is touched.
- **Org KPI linkage:** unchanged, because `kpi_name` is untouched.
- **Reports and exports:** unchanged by default; a follow-up phase can add separate Description / Formula / Scoring columns behind a flag.
- **Notifications:** already use first-line + truncation (ADR-039); they can later read `kpi_title` for a cleaner result.
- **Standardization registry / aliases:** unaffected; the registry keeps operating on `kpi_name`.
- **Regression risk:** low, since the change is additive and gated by a fallback resolver. The main risk is a bad parse writing wrong text into the new columns — mitigated by dry-run, audit log and a null-out rollback.
- **Scale:** parse runs in batches (20,698 rows); admin queue is server-paginated.

## Technical details

- Migration: additive columns + GRANTs unchanged (existing table), backfill via a `SECURITY DEFINER` RPC `kpi_split_text_dry_run(limit, offset)` and `kpi_split_text_apply(batch)`, both writing to `kpi_text_split_audit`.
- Parser lives in one place and is shared: TS in `src/lib/textFormatting.ts` for display, PL/pgSQL mirror for the backfill, with a test asserting both produce the same split on a fixture set.
- Tests: parser unit tests (all four data shapes above), a contract test that the backfill migration never updates `kpi_name`, and a fallback test that unparsed rows still render exactly as today.
- Docs: new ADR, POLICY section `§KPI-TEXT-SPLIT-ADDITIVE`, DOCUMENTATION.md version history entry.

## Suggested phasing

- Phase 1: columns + dry-run report (numbers above, per-KRA breakdown) — no writes.
- Phase 2: apply backfill for the 97.7% high-confidence rows + display resolver.
- Phase 3: admin review queue for low-confidence rows.
- Phase 4 (optional): reports/notifications adopt the structured fields.
