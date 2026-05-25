## Goal

Remove the **Manual** score input from the Bulk Sign-off preview dialog. Reviewers should only ever type an **Achieved** value; the score must be computed from that (or carried forward from the resolver chain / admin override). Manual 0–5 bypass entry has no place in this UI.

## Risk & Impact Report

- **Data Impact:** None. The DB RPC `bulk_write_stage_scores` still accepts `p_manual_scores` (kept for backward compatibility); we simply stop sending it from this dialog. No schema change.
- **Workflow Impact:** Reviewers lose the ability to type a 0–5 manual score directly in the bulk dialog. The Achieved → computed-rating path covers every UoM (numeric, binary, tiered, %). Admin Override still works because it unlocks Achieved on every row and the resolver flags those edits as `override`.
- **UI/UX Impact:** Removes one table column (desktop) and one stacked row (mobile) from `Per-cell preview`. Header badge "4 manual/override" becomes "4 override" (or hidden when 0).
- **Regression Risk:** Low. `carriedScoreResolver` still honors `manualScore` if ever passed — we just stop feeding it. Tests for the resolver remain green.
- **Mitigation:** Update existing `BulkApproveDialog` test for the override-rollup count; update preview snapshot expectations.

## Plan (Frontend only — POLICY §111.7.a.6)

1. **`src/components/review/BulkSignoffPreview.tsx`**
   - Remove `renderManualInput`, `onManual`, the `Manual` `<th>`/`<td>` (desktop) and the Manual stacked row (mobile).
   - Update the legend line to drop the "or a Manual 0-5 score to bypass the formula" clause.
   - Keep `SourceBadge` rendering of `manual`/`override` (historical rows may still carry that source from the resolver).

2. **`src/components/review/BulkApproveDialog.tsx`**
   - Stop building/sending `manualScores`. Drop the `manualScores` field from the submit payload and the `onConfirm` arg type.
   - Adjust the "needs input" guard so a row counts as needing input only when `achievedOverride` is empty (manualScore branch removed).
   - Update the chip count label from `"… manual/override"` to `"… override"` (admin-override rows only).

3. **`src/hooks/useBulkReview.ts`**
   - Remove the `manual_scores` arg from the call site only (RPC param kept on the server). Type stays for back-compat callers.

4. **`src/lib/carriedScoreResolver.ts`**
   - Leave `manualScore` field intact (no breaking change). Update the doc-comment to note the bulk dialog no longer feeds it.

5. **Tests**
   - `BulkApproveDialog` test: assert payload no longer contains `manualScores` even when achieved values are typed.
   - `BulkSignoffPreview` test (if present): assert no `Manual` header is rendered.
   - `carriedScoreResolver` tests: unchanged (still validate manual/override precedence for any future caller).

6. **SSOT updates**
   - `POLICY.md` §111.7.a.6 (v2.66.13.13): "Bulk Sign-off preview exposes only the Achieved column; Manual 0–5 bypass entry is removed. Computed rating is the only auto-fill path; Admin Override remains."
   - `DOCUMENTATION.md` v2.66.13.13 changelog entry.

## Out of Scope

- The single-cell scoring dialog and Manager/HR PMS standalone screens (untouched).
- Any DB function changes — `bulk_write_stage_scores` keeps `p_manual_scores` for compatibility.

## Rollback

Revert the component diff; resolver/RPC are unchanged so no migration is needed.
