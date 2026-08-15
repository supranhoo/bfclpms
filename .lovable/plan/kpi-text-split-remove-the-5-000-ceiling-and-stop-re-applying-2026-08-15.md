# KPI Text Split — remove the 5,000 ceiling and stop re-applying done rows

## What I confirmed in the live system

- The apply RPC hard-caps every run: `LIMIT greatest(1, least(coalesce(p_limit,1000), 5000))`. The UI asks for 5,000, so one click can never do more than 5,000 rows. That is why the toast said "Split applied to 5000 KPIs" while 5,339 rows are clean.
- The apply target list does **not** exclude rows that are already structured. It orders by `review_year, kra_name, kpi_name` and takes the first 5,000 matches — the same 5,000 every time. So clicking again re-writes the identical rows and the remaining ~339 are never reached.
- The preview (`kpi_split_dry_run`) also returns already-structured rows; it only tags them with `already_split`. That is why rows you already split keep appearing in the list with a "Structured" badge.

Nothing is corrupted — `kpi_name` was not modified, and re-applying writes the same values. It is a paging/idempotency gap, not data loss.

## Fix

1. **Skip already-done rows in apply.** Add `AND k.kpi_title IS NULL` to the target set (unless explicit `p_ids` are passed, so manual re-splits still work). Each run then advances to genuinely pending rows.
2. **Raise the per-call ceiling** from 5,000 to 20,000 and keep it as a safety valve, not a business limit.
3. **Loop until done in the UI.** "Apply clean splits" runs batches back to back, showing "Applied 5,000 of 5,339…" progress, and stops when a batch returns 0. No dataset size can silently truncate the operation (matches the no-silent-ceiling directive from the BU Console work).
4. **Preview clarity.** Add a "Pending only / Already structured / All" state filter next to the confidence filter, defaulting to Pending, so the list stops showing work you have already completed. Server-side filter and count, so pagination totals stay correct.
5. **Summary parity.** `already_split` and the clean-split count are computed from the same predicate the apply uses, so "5,339 clean split / 5,016 already structured" reconciles exactly.

## UI changes

- Text Split tab, action row: the Apply button shows a live batch progress label while looping; the counter beside it reads "N pending" instead of "N already structured".
- Preview header: new state dropdown (Pending / Structured / All), default Pending. Row count text follows the filter.
- No layout or navigation change elsewhere.

## Technical details

- Migration replaces `kpi_split_apply` (add pending predicate, raise cap), `kpi_split_dry_run` (add `p_state` filter), and `kpi_split_summary` (add `pending` count). Signatures stay additive with defaults so existing callers keep working; no new table, no GRANT change.
- `useKpiTextSplit.ts`: `useApplyKpiSplit` gains a batch-loop mutation returning per-batch counts; `useKpiSplitPreview` passes `p_state`.
- `TextSplitTab.tsx`: progress label, state filter.
- Rollback: unchanged — `kpi_split_rollback(run_id)` nulls the four columns per run. Batched runs record one run id each; the UI's "Undo last run" will undo the most recent batch, and I will list the batch run ids so a full undo is possible.
- Tests: apply-idempotency (second run on a fully split set returns 0), pending-predicate contract, and a guard asserting no code path writes `kpi_name`.
- Docs: ADR-269 addendum, POLICY §KPI-TEXT-SPLIT-FORWARD-ONLY updated with the no-ceiling rule, DOCUMENTATION.md version history.
