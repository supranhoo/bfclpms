# Bulk Sign-off — Achieved Value entry, Manual Rating, Admin Override & Badge Fix

## Answering your three questions

**1. "There's no option to rate employees — rating needs an Achieved Value to calculate"**
Correct. Today the dialog only reads existing achievement from the DB; it cannot collect one. We will add an **inline "Achieved" input** in the per-cell preview. As soon as the reviewer types a value, the row's rating is auto-computed via the same `calculateRating()` engine used everywhere else (per-employee R0–R5, Higher/Lower-is-Better, %/absolute, binary/tiered). The reviewer also gets an optional **"Manual Score"** field next to it for cases where they want to bypass the formula (e.g. qualitative judgement). Either input alone is enough; if both are present, the Manual Score wins (and is logged as such).

**2. "Why does 'skip' show +0.25 impact?"**
Labelling bug. The badge text `skip` is currently overloaded:
- `skip_level` carried source (Skip-Level Manager's score carried forward → score 5 × 5 % wt = **+0.25**, correct).
- `none` / row-skipped (no data, no write).

Fix: rename the carried-source badge to **"skip-lvl"** (secondary tone) and keep **"no data"** (destructive, with ⚠ icon). No math change.

**3. "What if I don't want to skip an already-given score and want to override as admin?"**
Add an **Override toggle** (admin-only). When ON, every row becomes editable (Achieved + Manual Score) regardless of its carried source. The override value is sent to the RPC and the audit row stamps `inherited_from = 'admin_override'` with the previous carried value captured in the reason payload. Non-admins never see the toggle.

---

## UI / UX changes (per-cell preview table)

```text
┌─ Per-cell preview (4) ─────────────────────────────────────────────────────────────┐
│ Employee   KPI                Wt%  Achieved   Manual    Score   Source     Impact │
│ Ankit      Cost Centre Verif…  4%  [      ] %  [   ]    —       no data ●  —      │
│ Deepak     Cost Centre Verif…  5%  [   95 ] %  [   ]    4.0 ⚙   computed   +0.20  │
│ Rahul      Cost Centre Verif…  5%  [      ] %  [ 3 ]    3.0     manual     +0.15  │
│ Sourav     Cost Centre Verif…  5%      —        —       5.0     skip-lvl   +0.25  │
│                                                                                    │
│ Legend: self · manager · skip-lvl · hr_pms · computed (⚙) · manual · override · no data │
│ [ ☐ Override carried scores (admin only) ]                                         │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Row interaction matrix:

| Row state                                | Achieved input | Manual input | Score column                       |
|------------------------------------------|----------------|--------------|------------------------------------|
| Has carried score, Override OFF          | hidden         | hidden       | read-only (carried value)          |
| Has carried score, Override ON (admin)   | editable       | editable     | live recompute / manual            |
| `source = 'none'` (no data, no prior)    | editable ●     | editable ●   | required to enable CTA             |
| Has live `achieved_value` already in DB  | pre-filled, editable | empty   | live recompute                     |

Visual rules:
- **Achieved input**: numeric, shows the KPI's UoM suffix (`%`, `Nos`, `MT` …) read from the per-employee `kpis` row. For binary/tiered KPIs, becomes a dropdown of the configured options.
- **Manual input**: numeric 0–5 step 0.5. When filled, it overrides whatever Achieved would have computed and the badge flips to `manual`.
- **Score column**: read-only display of the resolved rating. Shows a ⚙ icon when the value came from a live Achieved entry, no icon when carried, "M" pill when manual, "—" when no data.
- **Required dot ●**: red dot on rows that block the CTA. Tooltip lists which rows are still blank.
- **Per-employee Projected** column updates live as inputs change (Dashboard-parity math, per-employee weightages & formulas).
- **CTA**: "Sign off N cells" where N counts only resolvable rows (carried + filled Achieved + Manual + Override). Disabled with tooltip until required rows are filled.
- **Mobile (< md)**: the row card grows two extra lines `Achieved: [input] [uom]` and `Manual: [input]`. Same dot/legend logic.
- Override checkbox sits below the table, secondary outline, with helper text "Lets you replace carried scores — every override is audit-logged."

No other dialog chrome changes (remark, evidence uploader, headers, buttons all untouched besides the CTA label).

---

## Implementation outline (technical)

Frontend
- `src/lib/carriedScoreResolver.ts` — extend `CarriedSource` union with `'manual' | 'override'`. Add `resolveWithInputs({ stage, submission, kpi, achievedOverride, manualScore, isOverride })` that:
  1. If `manualScore != null` → `{ score: manualScore, source: 'manual' | 'override' }`.
  2. Else if `achievedOverride != null` → compute via `calculateRating()`; source `'computed' | 'override'`.
  3. Else if `isOverride` → returns `{ score: null, source: 'override' }` (forces required-dot).
  4. Else falls back to existing 5-rung cascade.
- `src/lib/bulkSignoffImpact.ts` — accept `Map<submission_id, { achieved?: number|string; manual?: number }>` and `isOverride` flag, pipe into resolver; recompute cells + rollups.
- `src/components/review/BulkSignoffPreview.tsx` — add **Achieved** and **Manual** columns, controlled inputs with `onCellInputChange`, dropdown variant for binary/tiered, legend strip, required-dot marker, expose `requiredUnfilledCount`. Badge map: `skip_level → "skip-lvl"`, plus `'manual'` (secondary) and `'override'` (warning amber).
- `src/components/review/BulkApproveDialog.tsx` — own `inputsBySubmissionId` and `isOverride` state, admin-only checkbox (visible when `isAdmin` prop true), forward to preview, disable CTA on unfilled required rows, include payload `{ manual_scores, achieved_values, is_override }` in `onConfirm`.
- `src/pages/review/BulkReviewDashboard.tsx` — pass `isAdmin`; on confirm pipe payload into the RPC call site; persist Achieved entries to `review_submissions.achieved_value` alongside the bulk write (so the grid shows it after the action).
- `src/hooks/useBulkSignoffPreviewData.ts` — already batches per-row rule + achievement; no signature change.

Database (additive migration)
- Extend `public.bulk_write_stage_scores(... , p_manual_scores jsonb DEFAULT NULL, p_achieved_values jsonb DEFAULT NULL, p_is_override boolean DEFAULT false)`.
  - If `p_achieved_values[sid]` present → UPDATE `review_submissions.achieved_value` first, then re-run `fn_compute_rating_from_achievement`.
  - If `p_manual_scores[sid]` present → use it directly, skip the cascade.
  - On override → stamp `bulk_signoff_audit.inherited_from = 'admin_override'` and capture prior carried value in `reason_payload->'prev'`.
- Backward compatible: default NULL params keep old behaviour.

Tests
- `carriedScoreResolver.test.ts` — manual beats computed; override flag forces dot on empty row; UoM-aware computation works for tiered/binary.
- `bulkSignoffImpact.test.ts` — Achieved entry recomputes rating per the row's own R0–R5; mixed batch (carried + computed + manual) rolls up correctly.
- `BulkApproveDialog` test — CTA disabled until required rows filled; admin checkbox unlocks all rows; payload contains `manual_scores`/`achieved_values`/`is_override`.
- RPC unit (insert harness) — override path writes audit row with `inherited_from='admin_override'`; achieved-value path updates `review_submissions.achieved_value` then writes computed rating.

SSOT
- `POLICY.md` §111.7.a.3 — Achieved/Manual/Override contract + badge legend.
- `DOCUMENTATION.md` v2.66.13.10 — UI + RPC signature delta.
- `mem://features/review/bulk-review-dashboard` — append Achieved/Manual/Override notes.

## Risk & Impact

- **Data**: additive RPC params, additive audit `inherited_from` value, and a write to `review_submissions.achieved_value` only when the reviewer explicitly enters one. No schema change. Rollback = drop new params.
- **Workflow**: non-admins gain the ability to enter Achieved/Manual for "no data" rows only. Admin override is gated behind explicit checkbox.
- **UI**: dialog grows ~80 px vertically (two extra columns + legend + checkbox).
- **Regression risk**: low — math layer is isolated and unit-tested; default path (no inputs, no override) is identical to today.

## Out of scope
- Grid-cell inline editing (dialog-only).
- Auditor/Management stage manual entry — covered by existing Admin Data Entry tool.
- Bulk CSV upload of Achieved/Score values.
