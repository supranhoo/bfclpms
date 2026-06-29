
## RCA — Auditor card shows Value 2.5 (stale) after bulk Auditor override to 5

Case (KPI `dcc8b7b7…`, employee Jitendra Kumar Dwivedi, May 2026, "Power generation from 45 MWh/AFBC"):

| Column                     | Value                                |
| -------------------------- | ------------------------------------ |
| `achieved_value` (top)     | **5.00**  ← written by bulk override |
| `auditor_score`            | 2 (recomputed from 5 vs r2=5%)       |
| `auditor_rating`           | red                                  |
| `auditor_remarks`          | "As per approval by Management"      |
| `auditor_achieved_value`   | **2.5**  ← STALE (old auditor draft) |
| `self_achieved_value`      | 2.5                                  |

Audit-log trail confirms the write: `action = BULK_STAGE_SIGNOFF_AUDITOR`, `new_value.achieved_in = 5`, `inherited_from = admin_override`, `is_override = true`, `batch_id = 739fb444…`.

The Review Journey "Auditor" card reads **`auditor_achieved_value`** (per-stage column), not the shared `achieved_value` (POLICY §88 hardening — reviewer cards must read their own frozen per-stage snapshot, not the mutable shared column). The card therefore renders **Value 2.5 / Rating 2**, even though the override stamped achievement **5**.

### Root cause (code)

`public.bulk_write_stage_scores(...)` updates the top-level `achieved_value` (lines 281–286) and the per-stage `<stage>_score / _rating / _remarks / _evidence_urls`, but **never writes `<stage>_achieved_value`** for any of the five reviewer stages (manager / functional_manager / skip_level / hr_pms / auditor). The per-stage achieved column keeps whatever the prior draft saved (or stays NULL), so the card de-syncs from the score/rating the same RPC just wrote.

`bulk_management_approve` (management bulk approve / admin override) does mirror onto the highest completed reviewer stage's `<stage>_achieved_value` (per ADR-067 / §88.1 — see lines 142–189 of that function). The reviewer-stage sibling `bulk_write_stage_scores` was missed when that mirror policy was introduced — this is the gap.

## CAPA

### 1. DB fix — `bulk_write_stage_scores` (single migration, `CREATE OR REPLACE`)

In each of the five reviewer-stage `UPDATE public.review_submissions` blocks (auditor, hr_pms, skip_level, functional_manager, manager), add the mirror column:

```
<stage>_achieved_value = COALESCE(v_achieved_num, v_cur.achieved_value)
```

Gating: only when the score itself is being written this turn (i.e. we're inside the existing UPDATE — same condition as the score write). `v_achieved_num` is whatever the bulk-review UI supplied; if the cell carried no achievement input but an existing top-level `achieved_value` is present (e.g. inheritance path), we mirror that instead so the per-stage card never diverges from the rating just computed.

For the manual-score path (`v_manual IS NOT NULL` with no `v_achieved_num`) we still mirror `v_cur.achieved_value` — the per-stage card then reflects the achievement the manual rating was applied against, matching POLICY §88.1.a (per-stage snapshot integrity).

No other branches touched: N/A branch already nulls the per-stage achieved (implicitly OK; explicitly add `<stage>_achieved_value = NULL` in N/A UPDATE for parity), relock / force-approve / non-terminal column-only paths are unaffected.

Audit log: append `mirrored_achieved_value: v_achieved_num/v_cur.achieved_value` into the existing per-stage `BULK_STAGE_SIGNOFF_<STAGE>` log `new_value` so future RCAs see the mirror happened.

### 2. One-off repair migration

Back-fill rows where the bug already landed:

```sql
UPDATE review_submissions
   SET auditor_achieved_value = achieved_value
 WHERE auditor_score IS NOT NULL
   AND auditor_achieved_value IS DISTINCT FROM achieved_value
   AND group_write_batch_id IS NOT NULL          -- only bulk-stamped rows
   AND final_score IS NULL;                      -- never touch frozen finals
```

Repeat for the other four reviewer stages, gated on `<stage>_score IS NOT NULL`. Each row gets one `OKV_BULK_STAGE_MIRROR_BACKFILL_<STAGE>` audit row (`performed_by = NULL`, system attribution, `policy = '§88.1 / ADR-098'`). Skips `final_score IS NOT NULL` to honour POLICY §88 immutability for already-frozen finals — those will be visually corrected only after a fresh override.

### 3. Tests

- `src/test/bulkWriteStageScoresAchievedMirror.test.ts` — SQL-source guard: greps the latest `bulk_write_stage_scores` definition and asserts that each of the five reviewer-stage UPDATE blocks contains `<stage>_achieved_value =`. Fails the build if a future edit drops the mirror.
- Extend `src/test/bulkManagementApproveEnumGuard.test.ts`-style regression with one case per stage: simulate `{achieved: 5}` write, assert `auditor_achieved_value = 5` and `auditor_score` recomputed correctly.

### 4. Docs / policy

- `POLICY.md` §88.1.d — "Reviewer bulk sign-off MUST mirror the achievement onto `<stage>_achieved_value`. Per-stage card columns are the source of truth for that stage's display value (§88 frozen snapshot)."
- `DOCUMENTATION.md` — v2.66.67 changelog entry.
- `docs/adr/ADR-098.md` — full RCA + CAPA + backfill.
- `mem/features/review/self-snapshot-display.md` — append Part 4 noting the reviewer-stage mirror parity (so future agents don't try to "fix" the card by reading `achieved_value`).

## Risk & Impact

- **Data impact:** Repair UPDATE only touches rows where the per-stage column is already out of sync with the score the RPC itself stamped — i.e. corrects a known drift, no new information invented. Skips frozen finals.
- **Workflow impact:** None. Status enums, kpi_status, final_score, propagation paths untouched.
- **UI impact:** Auditor / Manager / Skip-Level / HR-PMS / Functional-Manager cards now show the value that was actually approved. No layout change.
- **Regression risk:** Low. Mirror is additive to existing UPDATE; no branch deleted. SQL-source guard prevents silent regression.
- **Out of scope:** `bulk_management_approve` already mirrors correctly (ADR-067) — no change. Per-cell (single-cell) auditor save path is a separate review and not changed here unless the same bug is reproduced there.

## Files

- `supabase/migrations/<ts>_bulk_write_stage_scores_mirror_achieved.sql`
- `supabase/migrations/<ts>_backfill_per_stage_achieved_value.sql`
- `src/test/bulkWriteStageScoresAchievedMirror.test.ts`
- `POLICY.md`, `DOCUMENTATION.md`, `docs/adr/ADR-098.md`, `mem/features/review/self-snapshot-display.md`, `mem/index.md`
