## Assumptions
- Every System KPI already has `scoring_rules` (direction + bands) in the KPI Library, and the template factory copies those bands + `weight_pct` onto each `system_scores[]` entry (verified in `templateFactory.buildSystemScoresSection`). So the "band → rating" data is already there for every form — we just aren't using it at input time.
- Today, `SystemScoresPanel` and the bulk uploader treat the value as *already-scaled points* (0..weight). That is why HR has to hand-compute per-form and per-weight numbers.
- You want: **admin uploads one raw value per employee per measurement** (e.g. `UA/UC/NM = 3`, `5S = 82%`, `LTI = 0`), and the system converts it to that employee's `weight_pct`-scaled contribution using the template's bands. Different weights per user then have zero manual math.

## Risk & Impact Report
- **Data**: Additive only. New JSONB key `system_scores_raw` on `annual_review_instances` (no schema change — already `jsonb`). `system_scores` keeps its current meaning (scaled points) so composition, exports, HR sheet, tests, and the server-side weighted-score function stay untouched.
- **Workflow**: No stage/role change. Same stage guard (`not_started / pending_self / pending_manager`) applies.
- **UI/UX**: `SystemScoresPanel` gains a raw-input column when `scoring_rules.bands` is non-empty; the scaled points cell becomes read-only and shows `raw → band rating × (weight / scale) = points`. Templates without bands (e.g. `carry_kra`, empty rules) keep today's direct-points behavior.
- **Regression**: Low. All existing rows keep working because `system_scores` is still the persisted, weighted number. Anything that reads `system_scores` (composition, PDF, HR sheet, exports) needs no change.
- **Scalability**: Pure client-side math, O(bands) per cell. No new queries.

## Design

### 1. New pure scorer — `src/lib/annualReview/systemKpiScoring.ts`
```
scoreFromRaw(raw: number, rules: ScoringRules, weight_pct: number, scale = 5)
  → { rating: number; points: number }
```
- Sort bands descending by `score` (already done by `parseScoringRules`).
- `higher_better`: pick the highest band whose `threshold <= raw`.
- `lower_better`: pick the highest band whose `threshold >= raw`.
- `rating` = band.score (0..scale), fallback 0 when no band matches.
- `points` = `rating / scale * weight_pct` — this is what lands in `system_scores[id]`.

Unit tests cover: exact threshold hits, above-top / below-bottom, both directions, `weight_pct = 0` (returns 0), missing bands (falls back to `raw` clamped — preserves today's behavior for `carry_kra` and manual entries).

### 2. Instance shape (no migration)
- New JSONB slot: `annual_review_instances.system_scores_raw: Record<slot_id, number>` — the raw sheet value HR keyed in.
- `system_scores[slot_id]` continues to hold the scaled points that composition already consumes.
- Whenever a raw value is written, `system_scores[slot_id]` is recomputed via `scoreFromRaw` in the same `updateInstance` call. If a slot has no bands, raw = scaled (current behavior).

### 3. Bulk uploader — `cycleBulkDataUpload.ts`
- Sheet columns stay the same (one canonical column per shared measurement). Values are now interpreted as raw.
- For each row, per instance slot: run `scoreFromRaw(raw, slot.scoring_rules, slot.weight_pct)` and write both `system_scores_raw[id] = raw` and `system_scores[id] = points`.
- Dry-run preview gains two columns per changed cell: **Raw → Rating (/5) → Points**, so HR sees exactly what will be booked before commit.
- Stage guard, 500-row chunking, and audit log entry are unchanged. Audit payload records raw + points before/after.

### 4. `SystemScoresPanel` — inline UI
- When `s.scoring_rules?.bands?.length` is present:
  - Show a **Raw value** input (units from `uom_type`) instead of the current points input.
  - Show a small read-only badge: `Band X/5 · Y.YY pts of Z`.
- Otherwise behave exactly as today (points input, `carry_kra` card, etc).
- Employee/read-only surface: display raw + rating + points, no editing.

### 5. Template Editor
- The bands are managed in the **System KPI Library** panel (already exists). No editor change needed — templates inherit bands via the factory. Add one-line helper text under each `system_scores` row: *"Scoring bands come from the KPI Library. Edit them there to change how raw values become points."*

### 6. Docs & Policy
- `DOCUMENTATION.md` → *Annual Review › System KPI scoring*: document the raw → rating → points pipeline, the two JSONB slots, and the "no bands = direct points" fallback.
- `POLICY.md` → new rule `AR-SYSTEM-KPI-RAW-INPUT`: "Raw values are the source of truth for System KPIs. `system_scores` is always the scaled contribution. Bulk uploads and manual edits must write both."

## Files to touch (build phase)
- `src/lib/annualReview/systemKpiScoring.ts` — new scorer + tests.
- `src/services/annualReview/cycleBulkDataUpload.ts` — apply scorer, write both slots, extend dry-run.
- `src/components/annual-review/CycleBulkDataUploadDialog.tsx` — extra preview columns.
- `src/components/annual-review/SystemScoresPanel.tsx` — raw input + badge when bands exist.
- `src/types/annualReview.ts` — add `system_scores_raw?: Record<string, number>` on the instance type.
- Tests: `systemKpiScoring.test.ts`, extend `cycleBulkDataUpload.test.ts` for raw→points, direction, per-user weight parity.
- `DOCUMENTATION.md` + `POLICY.md`.

## Rollback
Revert the six files. Rows written under the new flow keep working: `system_scores` still holds the correct scaled points; `system_scores_raw` becomes an ignored JSON key.

## Open question (please confirm)
For slots with `source = 'carry_kra'` (already auto-computed from monthly KRAs), the raw input UI should stay hidden and continue to auto-fill points — correct? My default: yes, `carry_kra` is unaffected.