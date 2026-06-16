# Add "Save as Draft" to Bulk Sign-off

Today the Bulk Sign-off dialog (`/review/bulk-scoring` → "Sign off N cells") only exposes a single terminal action that calls `public.bulk_write_stage_scores(...)`, which **always writes the stage score and advances the workflow** to the next pending stage. There is no way for a reviewer to persist their typed Achvd / N/A / remark / evidence for later review without committing the sign-off.

The single-row scorecard (`UnifiedScorecard`, `AuditScorecard`) already supports a **"Save Draft"** that writes the reviewer's own `<prefix>_achieved_value`, `<prefix>_score`, `<prefix>_remarks`, `<prefix>_evidence_urls` fields **without** changing `review_submissions.*_status` or `kpis.status`. We'll bring the same primitive into bulk.

## Assumptions

- Draft applies only to **active-stage reviewers** (Manager, Skip-Level, HR PMS, Auditor). Management / Final approve and Admin Override remain "commit-only" — drafts there are out of scope (you can revisit; see §Out of scope).
- Draft is **per-row + per-stage**, hydrates back into the single-row scorecard via the existing `reviewerDraftHydration` path (no new hydration logic).
- Draft does **not** advance workflow, does **not** stamp `final_score`, does **not** create audit-log "approval" rows. It DOES create a `BULK_DRAFT_SAVED` audit row per cell for traceability (POLICY §111.7.a SSOT for bulk actions).
- Draft writes are **idempotent** — saving again overwrites the previous draft for the same `(submission_id, stage)`.
- Remark / evidence rules in draft mode: remark optional (no 10-char minimum), evidence optional. Both are persisted only when provided.

## Risk & Impact Report

| Dimension | Impact |
|---|---|
| Data | Writes the reviewer's `<prefix>_*` columns on `review_submissions`. NO change to `*_status`, `kpis.status`, `final_score`, `final_rating`. No schema change. |
| Workflow | None — status/stage progression untouched. Reviewer must still click Sign off to advance. |
| RLS | Reuses existing per-stage RLS on `review_submissions` (same policy that lets the reviewer save a draft from the single-row picker). |
| Audit | New canonical audit type `BULK_DRAFT_SAVED` (one row per cell) — surfaced in KPI timeline as "Draft saved (bulk)". No final-score audit. |
| UI/UX | Adds a secondary "Save as Draft" button in `BulkApproveDialog` footer, left of "Sign off N cells". Disabled when nothing to draft (no Achvd/N/A/remark/evidence touched on ANY row). Mobile: stacks above primary. |
| Regression | Low. Primary "Sign off" path unchanged. New RPC is separate (`bulk_save_stage_drafts`) so the audited `bulk_write_stage_scores` path keeps its exact contract — no behavioural drift for the four reviewer roles already supported. |
| Scalability | Same batch size limits as sign-off (cells × stage). Single RPC, single transaction, indexed by submission_id. |
| Backup | New audit type rows land in `kpi_audit_logs` (already in the dynamic backup allowlist via `public.get_backup_table_order()`). No new tables. |

Mitigation: feature behind the same `is_bulk_review_enabled()` flag; new RPC has its own unit tests; UI guarded by existing `isRowEditable` so draft can only touch rows the reviewer can already act on.

## Plan

### 1. Backend — new RPC `public.bulk_save_stage_drafts`

New migration. Signature mirrors `bulk_write_stage_scores` but trimmed to draft semantics:

```text
bulk_save_stage_drafts(
  p_stage            text,        -- 'manager' | 'skip_level' | 'hr_pms' | 'auditor'
  p_cells            jsonb,       -- [{ submission_id, expected_version, achieved?, score?, is_na?, remark? }]
  p_attachment_urls  jsonb DEFAULT '[]'::jsonb,  -- shared evidence
  p_batch_reason     text DEFAULT NULL           -- optional shared remark
) RETURNS jsonb -- { batch_id, applied, skipped:[{submission_id, reason}] }
```

Behaviour per cell:
- Validate the reviewer is allowed to act on the row at `p_stage` (reuse same gates the live RPC uses: `is_active`, not-final, prior-stage filled, row-version match).
- UPDATE `review_submissions` SET `<prefix>_achieved_value`, `<prefix>_score`, `<prefix>_is_na`, `<prefix>_remarks`, `<prefix>_evidence_urls`, `<prefix>_drafted_at = now()`, `<prefix>_drafted_by = auth.uid()`.
- Do NOT touch `<prefix>_status`, `kpis.status`, `final_*`.
- Insert one `kpi_audit_logs` row with `event_type = 'BULK_DRAFT_SAVED'`, `performed_by = auth.uid()`, payload `{ stage, batch_id, cell_count, has_evidence }`.
- Skip rows the reviewer can't touch with explicit reason (`row_version_conflict`, `prior_stage_pending`, `already_signed_off`, etc.) — same skip vocabulary as `bulk_write_stage_scores` for UI parity.

`GRANT EXECUTE … TO authenticated`. RLS-equivalent gates inside the function (SECURITY DEFINER, fixed `search_path`).

### 2. Frontend — wire draft action

**`src/components/review/BulkApproveDialog.tsx`**
- Add optional `onSaveDraft?: (payload) => void` and `isSavingDraft?: boolean` props.
- Render a secondary `Save as Draft` button in the footer for `mode='signoff'` only. Hidden when `onSaveDraft` is absent (so `approve` mode stays binary).
- Drop the 10-char remark requirement for the draft path; keep it for sign-off.
- Disabled state: when no row has a typed Achvd / N/A / remark / evidence beyond what's already persisted.

**`src/pages/review/BulkReviewDashboard.tsx`**
- Add `useBulkSaveStageDrafts` mutation hook (new file `src/hooks/useBulkSaveStageDrafts.ts`) that calls the new RPC.
- Wire `onSaveDraft` on the dialog → mutation → toast "Draft saved for N cells. Reviewers can resume from the KPI scorecard."
- Invalidate the same query keys as sign-off success so the grid badges refresh ("Draft" pill appears on rows that now have a reviewer draft).

**`src/components/review/BulkSignoffPreview.tsx`**
- Add a small "Draft" badge to the Source column when `cell.has<Stage>Draft === true` so reviewers see which rows already carry their saved-but-not-signed values. (Source data comes from the existing preview RPC; small additive column.)

### 3. Hydration & resume

No new hydration logic — `reviewerDraftHydration.ts` already returns `source: 'reviewer-draft'` when `<prefix>_score` / `<prefix>_achieved_value` are set. Reopening the row in the single scorecard or in the next Bulk Sign-off dialog naturally pre-fills the saved values.

### 4. Audit & SSOT

- Add `BULK_DRAFT_SAVED` to the canonical audit-type enum / mapping in `src/lib/auditTypes.ts` (or wherever the type catalog lives — discover during build) with label "Draft saved (bulk)" and rendered timeline copy.
- DOCUMENTATION.md: new §"Bulk Save as Draft" under "Bulk Review".
- POLICY.md §111.7.a: add subsection `.8` describing draft semantics, who can draft (Manager / Skip-Level / HR PMS / Auditor only), and that draft never advances workflow nor stamps Final.

### 5. Tests (mandatory)

- `supabase/tests/bulk_save_stage_drafts.sql` (or equivalent vitest harness already used for SQL):
  - Happy path: 3 cells drafted → `<prefix>_*` populated, status untouched, 3 audit rows.
  - Skip path: prior-stage pending → cell skipped with `prior_stage_pending`.
  - Idempotency: drafting same row twice overwrites cleanly.
  - RBAC: non-active-stage user can't draft.
- `src/test/bulkReview/bulkSaveAsDraft.test.tsx`:
  - Dialog renders "Save as Draft" only in sign-off mode and only when reviewer has touched ≥1 row.
  - Draft button bypasses the 10-char remark minimum.
  - Draft button hidden in `approve` mode (Final).
  - `approve` mode + non-admin still has no draft path (regression for §88).
- Extend `src/test/bulkApproveDialogSignoffMode.test.tsx` with a fixture showing the "Draft" source badge in the preview when `hasDraft` is true.

### 6. Rollback

- Migration is additive (new RPC + new audit enum value). Rollback = `DROP FUNCTION public.bulk_save_stage_drafts(...)` and remove the audit enum label (label can stay; harmless).
- UI rollback = revert the two React files + remove the hook + remove the new test files. The existing sign-off path is untouched, so reverting carries zero data risk.

## UI changes (explicit)

- **Location:** `BulkApproveDialog` footer, sign-off mode only.
- **Visual:** `[Cancel]            [Save as Draft] [Sign off N cells]` on desktop; stacked on mobile (`Save as Draft` above primary).
- **Source badge:** small "Draft" pill in the Source column of the per-cell preview table for rows that already have a reviewer draft for the acted stage.
- **Toasts:** success → "Draft saved for N cells"; partial → "Draft saved for X cells, Y skipped" with a "View details" affordance reusing the existing skip-reason renderer.
- **Disabled rule:** Save-as-Draft button stays disabled until at least one row has a fresh edit OR a new remark/evidence is added.
- **Responsive:** dialog footer already wraps; no new breakpoints needed.

## Out of scope (separate tickets)

- Drafting at Management / Final approve stage (would need policy decision on partial Finals).
- Admin Override drafts (override is by definition an immediate re-stamp; drafting it would defeat the audit purpose).
- Functional Manager bulk (already out of scope per the previous plan — same blocker on the live sign-off RPC).
- Inline draft directly from the bulk grid without opening the dialog.

## Decision notes

- **Why a new RPC instead of a `p_mode='draft'` flag on `bulk_write_stage_scores`?** That RPC is large, audited, and protected by the workflow-advancement contract. Forking it via a flag risks branching logic in a 500-line function and silently weakening invariants (status writes, final-score stamping, override paths). A sibling RPC keeps each call site doing one thing.
- **Why reuse `<prefix>_*` columns instead of a new `*_draft_*` set?** The single-row picker already hydrates from those columns; reusing them gives free resume-from-scorecard and avoids a parallel storage model.
- **Why a `BULK_DRAFT_SAVED` audit event?** Per project knowledge §4 (Audit Trail) every change to sensitive review data must be traceable. The single-row Save Draft already logs `DRAFT_SAVED`; bulk parity keeps the timeline complete.
