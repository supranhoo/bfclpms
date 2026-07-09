## Diagnosis

Ali Ahmad's `annual_review_instances.system_scores` map has **no key** for `sys_3jsce5p` (the Annual Production slot on his override template `DRI - M - QC`). That's why the card renders `0.00 / 25`. The v2.66.98 percent-coercion fix is code-only — it only takes effect the next time the sheet is parsed and committed.

The good news:
- Library entry `annual_production` has `uom_type = percent` and correct bands (100/95/90/85/80).
- v2.66.97 iterator fix now hydrates manual slots that carry a `library_key` (source=`manual`, library_key=`annual_production`) — so the slot picks up bands + `uom_type=percent` at plan time.
- v2.66.98 `coercePercentRaw` will then translate Excel `0.9` → `90` before `scoreFromRaw`.

## Plan

No code changes. Guided re-upload + verification.

1. **Re-upload the same cycle bulk-upload sheet** on the Annual Review cycle page.
2. **In the dry-run panel, confirm** for employee 100870:
   - Column: `Annual Production Target Vs Actual`
   - `before = ""`, `after = 90`, `rating = 3`, `afterPoints = 15` (25 × 3/5)
   - Row `warnings[]` includes an "interpreted 0.9 as 90%" (or "90%") note if the cell is percent-formatted / string.
3. **Commit** the dry-run.
4. **Verify on the team review page** the tile now reads `15.00 / 25` with rating 3.
5. If step 2 shows `after = 0.9` or `rating = 0`, that means the slot's bands/uom didn't hydrate for this template — I'll then investigate the manual + library_key hydration path (no code changes until we see that signal).

## Fallback (only if re-upload is impractical for many rows)

Write a one-shot repair script that, for each instance:
- Reads `system_scores_raw[slot.id]` for any slot whose library-resolved `uom_type = percent`.
- Applies `coercePercentRaw` + `scoreFromRaw` with library bands.
- Writes back `system_scores[slot.id]` (never touches `final_score` — POLICY §88 immutability).
- Emits an audit log row per repair.

Not started unless the guided re-upload doesn't cover the affected population.

## Risk & Impact

- **Data**: Additive write via the existing bulk-upload commit path; stage-safe guard (`pending_self`/`pending_manager`/`not_started`) protects finalized rows.
- **Regression**: None — no code changes in this step.
- **Docs**: No new entry needed; v2.66.98 already documents the fix.
