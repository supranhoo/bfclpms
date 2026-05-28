## Goal

Bring the Bulk Scoring cell drawer (`/review/bulk-scoring` → Edit cell) to full parity with single-cell Team / HR PMS Review:

- N/A toggle (with reason)
- Achieved value (already present)
- Manual rating 0–5 (already present)
- Remarks (already present)
- **Attachments / Evidence upload** (currently missing)

Today the drawer already shows Achieved value + Manual rating + Remarks, but there is no way to mark a cell N/A or attach reviewer evidence — both of which exist on the standard scorecard.

## Risk & Impact Report

- **Data**: Additive only. No schema changes — we reuse the existing per-stage `*_evidence_urls` and `is_na` / `na_marked_by_role` / `na_reason` columns on `review_submissions`. RPC signature is extended with optional params (defaults preserve old behavior). POLICY §88 immutability untouched — frozen final scores still skip writes.
- **Workflow**: Same stage permissions as before. N/A propagates through the workflow exactly as it does from the single-cell scorecard.
- **UI**: Drawer only. Bulk grid, snapshot RPC, virtualization, performance budgets unchanged.
- **Regression**: Existing single-cell save flow and current bulk-batch flow keep working — new params are nullable.
- **Mitigation**: Extend RPC with NULL defaults; add unit tests for the new fields; keep batch-level `p_attachment_urls` untouched for bulk callers that already use it.

## UI Changes

Location: `src/components/review/BulkCellDrawer.tsx` — within the existing "Write as &lt;Stage&gt;" section, between the score inputs and the Remarks textarea.

1. **N/A toggle row** (top of the writer block)
   - Reuse `<NaConfirmationCard>` exactly like `UnifiedScorecard.tsx` does.
   - When toggled on:
     - Hide `AchievedValueScoreInput` and the manual 0–5 input.
     - Force-disable "Use manual rating" link.
     - Remarks textarea relabels to "N/A reason (required, min 10 chars)".
     - Save button text becomes "Mark N/A as &lt;Stage&gt;".
   - When toggled off → existing scoring UI re-appears.

2. **Evidence / Attachments**
   - Add `<EvidenceUpload>` component (same one used in UnifiedScorecard) directly above the Remarks textarea.
   - Seeds from `submission?.[<stage>_evidence_urls]` so previously uploaded files show.
   - Multi-file, same storage bucket and naming as single-cell review (already governed by Multi-File Evidence Storage memory).

3. **Save button enable rules**
   - Non-NA: score present AND remarks ≥ min length (unchanged) — evidence optional.
   - NA: NA reason ≥ 10 chars; score not required; evidence optional.

4. Re-open block and final-score revisions panel: unchanged.

No new colors, fonts, or layout primitives — uses existing semantic tokens (`text-muted-foreground`, `border-border`, shadcn components) per BFCL UI standards.

## Implementation

### 1. DB migration — extend `bulk_write_stage_scores` (additive, backward-compatible)

Add three optional JSONB args, defaulted to NULL:

```text
p_evidence_urls jsonb   -- { submission_id: ["url1","url2"] }
p_is_na          jsonb   -- { submission_id: true }
p_na_reasons     jsonb   -- { submission_id: "reason text" }
```

Inside the RPC loop per cell:

- If `p_is_na->>submission_id = 'true'`:
  - Set `is_na=true`, `na_marked_by_role=<stage>`, `na_reason=<from json>`, clear `<stage>_score`, `<stage>_rating`, `<stage>_remarks`.
  - Still write `<stage>_evidence_urls` if provided.
  - Skip score / variance / propagation checks; stamp `inherited_from='na'`.
  - Audit row tagged `bulk_na_mark`.
- Else (existing behaviour):
  - Write score + remarks (unchanged).
  - Additionally write `<stage>_evidence_urls` when JSON entry exists.
- POLICY §88 frozen-final guard still runs first and skips NA writes too.

GRANT EXECUTE re-asserted to `authenticated`. No new tables → no GRANT block needed beyond the function permissions.

### 2. `src/hooks/useBulkReview.ts`

Extend `useBulkWriteStageScores` args:

```ts
evidence_urls?: Record<string, string[]>;
is_na?: Record<string, boolean>;
na_reasons?: Record<string, string>;
```

Pass them straight through as `p_evidence_urls`, `p_is_na`, `p_na_reasons`. Existing callers (full bulk save) keep working — args are optional.

### 3. `src/components/review/BulkCellDrawer.tsx`

- Add local state: `isNa`, `naReason`, `reviewerEvidenceUrls`.
- Seed on open from `submission` (same pattern as `achieved`).
- Render `NaConfirmationCard` + `EvidenceUpload` (existing components — no UI invention).
- Adjust `handleWrite` to build the single-cell payload:
  - `cells: [{ submission_id, score: isNa ? null : effectiveScore, remarks: trimmed, expected_row_version }]`
  - `evidence_urls: { [submission_id]: reviewerEvidenceUrls }`
  - `is_na`/`na_reasons` only when NA toggled.
- Update enable/disable logic and button label as described above.

### 4. Tests (`src/test/`)

- `bulkCellDrawerRemarks.test.ts` — extend with NA-reason min-length case.
- New `bulkWriteStageScores.na.test.ts` — pure unit test for the args→RPC mapping (hook layer mocked).
- Update existing `BulkCellDrawer` interaction expectations (NA toggle hides score input; Save button enabled only when NA reason valid).

### 5. Documentation

- `DOCUMENTATION.md` → "Bulk Scoring" section: list the four parity controls.
- `POLICY.md` → §111 (Bulk write semantics): add NA and per-cell evidence to the allowed payload; reiterate §88 immutability still wins.
- Memory: append a one-liner to `mem://features/review/group-based-scoring.md` noting NA + per-cell evidence are first-class drawer fields (no auto-propagation policy change).

## Out of Scope

- Bulk NA marking across the grid (drawer only for now).
- Per-stage attachment requirements (still optional, matching single-cell behaviour).
- Self-review parity (drawer is reviewer-only).

## Verification

1. Open `/review/bulk-scoring`, click any non-final cell → drawer shows NA toggle + Evidence upload.
2. Mark NA + enter ≥10-char reason → Save → cell shows `N/A` badge in grid; row in `review_submissions` has `is_na=true`, score columns cleared, `na_marked_by_role` = stage.
3. Without NA, upload 2 files + score + remarks → Save → `<stage>_evidence_urls` contains the URLs; score saved as before.
4. Frozen-final cell still blocks both flows with the existing POLICY §88 alert.
5. Existing full-grid bulk save (no NA/evidence params) regression-tested via existing unit tests.
