# Two-decimal display for /5 scores (dashboards + report tables)

## What changes
Every score shown **out of 5** in the on-screen UI renders with exactly two decimals: `4.75`, `4.80`, `0.00` — instead of the current single-decimal `4.8`. Percentages, day counts, file sizes, variance-% and monetary values are untouched.

## Where it changes (visual locations)
- Employee selector grid — the round score badge next to each employee (the `4.8` in your screenshot).
- Mobile KPI card and KPI Tracker modal score badges.
- Direct Reportees Monitor score chips (Management dashboard).
- Cumulative Summary card "Avg score".
- Bulk review surfaces: matrix grid cells, virtual grid cells and row variance, signoff preview stage/criterion scores, bulk cell drawer variance badge.
- Unified Scorecard total weighted score.
- Annual Review admin grid `<Stage> /5` columns and Employee Results view stage values.
- Admin dialogs that compare KPI scores: propagation summary, Org KPI impact sheet, Org KPI audit card, scoring simulator / health check (score fields only).
- Report tables that print a /5 score: KPI Detail Report score columns, Employee Performance Summary score / out-of columns, TNI Report score column, Annual Review Comprehensive tab KRA points.

No layout, column or interaction change — only the rendered digits. Columns are already `tabular-nums` / right-aligned, so widths absorb the extra character; the narrow badges gain ~6px of text, which fits the existing pill padding.

## How
Single formatter, no per-file `toFixed` literals:
- Reuse the existing `fmt2()` in `src/lib/utils.ts` (already returns `'—'` for null/empty/NaN and preserves `0.00`).
- Replace each `<score>.toFixed(1)` **score** call site with `fmt2(score)`, dropping now-redundant `?? '—'` fallbacks where `fmt2` already handles them.
- Leave `toFixed(1)` in place where the value is a percentage, day count, MB/KB size, or increment-slab % (backup, image compression, inbox insights, incentive, deviation tables, completion-rate cards, chart tooltips in %).

## Verification
1. Unit test for `fmt2`: 4.75, 4.8 → `4.80`, 0 → `0.00`, null/NaN → `—`.
2. Run the existing vitest suite; update any assertion that pins a one-decimal score string.
3. Preview smoke: open the reviewer grid and the Annual Review admin grid and confirm badges read `4.75` / `4.80`.

## Risk & impact
- Data impact: none — presentation only, no schema/RPC/RLS change, no stored value touched.
- Workflow impact: none.
- Regression risk: low; the real risk is mis-classifying a percentage as a score. Mitigated by changing only call sites whose value is a 0–5 score, listed above, and leaving every `%`-suffixed expression alone.
- Scalability: none (pure formatting).
- Rollback: revert the change; `fmt2` already exists and is used elsewhere.

## Docs
`DOCUMENTATION.md` version-history entry and a POLICY §UI-SCORE-PRECISION rule: "All out-of-5 scores display with two decimals via `fmt2()`; never hand-rolled `toFixed`."

## Out of scope (per your answers)
Excel/PDF/CSV exports keep their current precision.