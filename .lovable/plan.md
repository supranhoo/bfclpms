# RCA — 100870 "Annual Production Target vs Actual: 90%" scored 0

## Root cause (confirmed)

The KPI Library row for `annual_production` has these bands (higher_better):

| score | threshold |
|-------|-----------|
| 5     | 100       |
| 4     | 95        |
| 3     | 90        |
| 2     | 85        |
| 1     | 80        |
| 0     | < 80      |

Thresholds are expressed as **whole-number percent** (0–100). `uom_type = 'percent'`.

In the uploaded XLSX the "90%" cell is formatted as an Excel **percent number**, so `sheet_to_json` returns the underlying value `0.9`, not `90`. `parseAndDryRun` (`src/services/annualReview/cycleBulkDataUpload.ts:434`) does:

```ts
const afterRaw = Number(raw); // 0.9
…
const result = scoreFromRaw(afterRaw, rules, weight);
```

`pickBand` (higher_better) walks bands sorted 5→0 looking for `threshold <= 0.9`. None of 100/95/90/85/80 satisfy that, so it falls through to `bands[bands.length-1]` — the worst band (score 0). Points = 0. That is exactly what HR sees.

Same trap applies to any percent-typed system slot (Annual Preventive Maintenance, Departmental 5S, Fugitive PM10, etc.) whenever the source cell is percent-formatted.

Secondary symptom: if the cell is text (`"90%"`), `Number("90%") = NaN` → the current cell-skip branch fires with "non-numeric value". Not this employee's case, but same root class.

## Fix

Normalise percent inputs at the parse boundary — the scorer stays untouched (its contract is "raw is in the same unit as thresholds").

1. **`cycleBulkDataUpload.ts`** — thread the slot's `uom_type` through `slotByCanonical` (already fetched by `hydrateSystemScoringRules`) and, before calling `scoreFromRaw`:
   - if `uom_type === 'percent'` and `Number.isFinite(afterRaw)` and `afterRaw <= 1` and `afterRaw >= 0` → multiply by 100 (Excel percent cell).
   - if `raw` is a string ending in `%` → strip the sign, then parse; treat the numeric part as whole-percent.
   - Emit a `warnings[]` entry ("interpreted 0.9 as 90%") so the dry-run row shows the coercion — no silent magic.
2. **`SystemScoresPanel.tsx`** manual entry — apply the same normalisation on paste/blur so the two entry paths agree.
3. **Docs / Policy**
   - `DOCUMENTATION.md` v2.66.98 — RCA entry for BUG "annual production 90% → 0".
   - `POLICY.md §AR-SYSTEM-KPI-RAW-INPUT` — new sub-clause: "Percent-typed slots: Excel percent-formatted cells (0..1) MUST be normalised to whole-percent (0..100) before scoring; coercion MUST be surfaced in the dry-run warnings."

## Tests

New `src/test/annualReview/cycleBulkDataUploadPercentCoercion.test.ts`:

- Excel percent cell 0.9 on `annual_production` (uom=percent) → rating 3 (T3), points = `3/5 * weight`.
- Whole-number 90 on the same slot → rating 3 (parity check — no double-scaling).
- String `"90%"` → rating 3, warnings include coercion note.
- Non-percent slot (e.g. LTI, uom=number) with raw 0.9 → unchanged behaviour (still falls through band lookup).
- Row with only percent coercion is still `verdict: 'apply'` when the resulting points differ from `beforePoints`.

## Risk & Impact

- **Data:** No schema, no RLS, no historic backfill. Purely a parse-time coercion.
- **Workflow:** Percent-typed system slots begin scoring correctly for percent-formatted uploads that previously landed 0. Whole-number uploads unchanged (values 0..1 for a percent KPI are ambiguous but overwhelmingly indicate Excel percent formatting — the coercion range is inclusive of 0 and 1 to preserve edge cases; guarded by warning).
- **UI:** Extra warning chip in the dry-run row when coercion fires.
- **Regression:** Low — one new branch inside the `system_scores` cell path, covered by tests. Non-percent slots untouched.
- **Rollback:** Revert the one service file + test.
