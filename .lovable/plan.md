## What's missing

The Annual Review Admin progress table is **missing the Dept Head column** (and a few related artefacts). The system supports the `dept_head` stage (status `pending_dept`, instance column `dept_head_id`, stage score key `dept_head`, label "Dept Head Review Pending"), but the admin grid pretends it doesn't exist. So an instance currently sitting at `pending_dept` shows a generic badge and you can never see the Dept Head score, even after it's submitted.

### Verified gaps in `src/pages/annual-review/AnnualReviewAdmin.tsx`

| # | Gap | Where |
|---|---|---|
| 1 | No **Dept** column header | `TableHeader` (around line 765) — order is Self / Manager / Skip / BU / HR; should be Self / Manager / Skip / **Dept** / BU / HR |
| 2 | No **Dept** cell in body rows | row map (line 794–795) |
| 3 | Empty-state `colSpan={11}` stale | line 832 — needs to become 12 |
| 4 | CSV export omits Dept score + weight | progress export builder (lines 287–301): add `'Dept Head Score'` and `'Weight Dept %'` |
| 5 | Local `STAGE_ORDER` / `STAGE_LABEL` (AnalyticsTab) skip `pending_dept` | lines 1055–1058 — analytics buckets ignore Dept-stage instances |
| 6 | Mini stage abbreviation map omits Dept | line 1531 (`self/mgr/skip/bu/hr/system/criteria`) |

(The `STATUS_LABEL` SSOT in `src/lib/annualReview/constants.ts` already includes `pending_dept` correctly, and `AnnualReviewStatusBadge` will render it — the gaps are only in admin-local maps/tables.)

## Risk & Impact Report

- **Data Impact:** None — display-only and CSV column additions; no schema change.
- **Workflow Impact:** None — engine already handles `pending_dept`.
- **UI/UX Impact:** Progress table grows one column (Self · Manager · Skip · Dept · BU · HR · Final · Rating). Existing column widths shrink slightly on narrow screens — table already scrolls horizontally inside the card, so no overflow regression.
- **Regression Risk:** Low. Two surfaces only (progress table + CSV export + the analytics tab's stage bucket order).
- **Mitigation:** Unit test asserting `STAGE_ORDER` includes `pending_dept` and CSV builder emits `Dept Head Score` column for a sample row.

## Plan

1. **Progress table header** — insert `<TableHead className="text-right">Dept</TableHead>` between Skip and BU.
2. **Progress table body** — insert `<TableCell className="text-right tabular-nums">{fmt(ss.dept_head)}</TableCell>` in the same position.
3. **Empty state** — bump `colSpan` from 11 → 12.
4. **CSV exporter** — add:
   - `'Dept Head Score': s.dept_head ?? ''`
   - `'Weight Dept %': weights.dept_head ?? ''`
   (placed after their Skip counterparts to keep column order consistent with the table.)
5. **Analytics tab** — extend the local `STAGE_ORDER` + `STAGE_LABEL` to include `pending_dept: 'Dept'` (between Skip and BU). This restores Dept-stage instances in the stage-distribution chart.
6. **Mini stage-key map** (line 1531) — add `dept_head: 'Dept'` so any export/long-format sheet that uses it labels Dept rows.
7. **Tests** — add a Vitest case in `src/test/annualReview/` that:
   - imports the progress export builder (or, if private, exercises it via a small extracted helper) and asserts the row keys include both `Dept Head Score` and `Weight Dept %`;
   - asserts the local `STAGE_ORDER` constant contains `pending_dept`.
8. **Docs / Policy** —
   - `DOCUMENTATION.md` → "Annual Review Admin > Progress grid" — list all six stage columns explicitly (Self/Manager/Skip/Dept/BU/HR).
   - `POLICY.md` → reaffirm: every enabled stage must have a column in admin views and in the CSV snapshot, in canonical order.

## Technical Details

- Only `src/pages/annual-review/AnnualReviewAdmin.tsx` changes (plus a small test file). No new components, no new hooks.
- `ss.dept_head` is already populated by `useInstanceStageScores` (the SQL/RPC behind it groups responses by `reviewer_role` and Dept is one of them) — no fetch change needed.
- `weights` object already has `dept_head` (it's part of `STAGE_WEIGHT_KEYS`).

## Rollback

- Pure UI change. Reverting the file restores the current 5-stage table. No data or schema to undo.
