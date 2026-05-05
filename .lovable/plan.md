
## Issue
When Piyush Bansal clicked **Submit Self Review** (no evidence files attached, score Yes / R5), the button got stuck on "Saving…" and a red toast appeared:

> Upload failed — The connection to the database timed out

The submission was never persisted.

## RCA — what is actually happening

Despite the wording "Upload failed", **no file upload is involved** here (Evidence Attachments = 0/5). The toast is the standard supabase-js error from `useSubmitSelfReview` being re-titled as "Upload failed" by the calling sheet's catch block. The real underlying error from Postgres is a **statement timeout** on the `review_submissions` upsert.

Live Postgres logs (last ~30 min) confirm a system-wide timeout storm, not an app bug in isolation:

| Count | Error |
|------:|-------|
| 30 | `canceling statement due to statement timeout` |
| 9  | `the database system is not accepting connections` |
| 4  | `invalid input syntax for type uuid: "null"` |
| 2  | `record "v_src" is not assigned yet` (already fixed in last turn) |
| 1  | RLS violation on `kpi_mention_access` |
| 1  | duplicate key on `org_kpi_data_owners_…_key` |

### Why Submit Self Review specifically times out

`useSubmitSelfReview` (src/hooks/useKpis.ts:636) does an `upsert` on `review_submissions` and then an `update` on `kpis.status`. That single upsert fans out into a heavy trigger cascade on `review_submissions`:

```
review_submissions UPSERT
  ├─ BEFORE: prevent_locked_submission_updates
  │           └─ check_review_period_permission   (5-tier scan of review_period_locks)
  ├─ BEFORE: auto_compute_rating_and_clamp_scores
  ├─ BEFORE: enforce_on_behalf_score_or_na
  ├─ BEFORE: sync_kpi_status_from_submission     → UPDATE kpis (re-entrant)
  │           └─ kpis triggers fire (15+):
  │                 notify_on_kpi_status_change
  │                 log_kpi_status_transition
  │                 percolate_multimonth_score    (writes siblings + audit rows)
  │                 fn_sync_org_status_to_future_open_periods
  │                 trg_clear_send_back_marker_on_advance
  │                 trg_expire_rollback_on_status_change
  │                 trg_sync_submission_on_kra_set
  │                 …etc
  ├─ AFTER:  enqueue_pms_compression_jobs        (6× EXECUTE format() per row, even if URL arrays empty)
  ├─ AFTER:  log_untracked_submission_changes
  ├─ AFTER:  trg_repercolate_on_submission_update
  └─ AFTER:  update_review_submissions_updated_at
```

Combined with the Cloud DB already being **flooded** by other concurrent timed-out queries, even this normally-fast write blows past the 8s `statement_timeout`. The “database not accepting connections” lines indicate the instance is at or above its connection ceiling — classic **compute/load** problem, not a bug in the self-review code.

So the issue has **two layers**:

1. **Engineering layer (deterministic fix):** the trigger pipeline on `review_submissions` is too eager and does meaningful work even when nothing relevant has changed. `enqueue_pms_compression_jobs` runs even when no evidence array changed; `log_untracked_submission_changes` writes audit rows on every score change including unchanged self_score; `repercolate_on_submission_update` already has a guard but the order is suboptimal.
2. **Capacity layer (operational):** the Lovable Cloud instance is overloaded — many concurrent statement-timeout errors + "not accepting connections" — so even the engineered fix won’t fully eliminate the symptom under current load.

## Plan

### 1. Make `Submit Self Review` resilient (frontend)
- In `src/hooks/useKpis.ts → useSubmitSelfReview`:
  - Wrap the `review_submissions` upsert + `kpis.status` update in a single retry loop (2 retries, 1s + 2s backoff) **only** for transient errors (`57014` statement timeout, `08006`/`08000` connection errors, `XX000` "not accepting connections").
  - Map the technical error to a clearer toast: *"The server is busy. Please try again in a moment."* instead of "Upload failed / connection to the database timed out".
- In `src/components/review/SelfReviewSheet.tsx`:
  - Change the catch-block toast title from "Submission Failed" → keep, but use the friendly message above when `error.code` matches a transient class. Stop calling it "Upload failed" anywhere — only the file-upload path should use that title (already correct in `MultiFileUpload.tsx`; verify nothing else mislabels it).

### 2. Trim the trigger cascade on `review_submissions` (DB migration)
- `enqueue_pms_compression_jobs`: short-circuit when **none** of the six `*_evidence_urls` arrays changed (`OLD.x IS NOT DISTINCT FROM NEW.x` for all). Currently it runs the EXECUTE-format loop unconditionally.
- `log_untracked_submission_changes`: short-circuit when no score field actually changed (it already checks distinct, but it also fires for self_score changes that are already audited by the application — narrow it to manager/auditor/management/final to remove duplicate work on self submissions).
- Add a partial index to speed up `prevent_locked_submission_updates`'s lookup of locks: `CREATE INDEX IF NOT EXISTS idx_rpl_active ON review_period_locks(review_period_id, lock_type) WHERE is_locked = true;` (only if not already present).

### 3. Rule out the lingering "uuid: null" noise
- The 4× `invalid input syntax for type uuid: "null"` errors in the same window mean somewhere the client is sending the literal string `"null"` for a uuid column. Grep for `.eq('…id', 'null')` / `?id=eq.null` patterns in the affected hooks (`useOrgKpiDataOwner`, `useReviewSubmissions`) and guard with early-return when the id is missing. Not the cause of Piyush's toast, but it's contributing to the error volume.

### 4. Capacity guidance for the user (operational)
The "database not accepting connections" log line is the tell-tale sign the Lovable Cloud instance is at its connection/CPU ceiling under current PMS load. After the engineering fixes above are deployed, if timeouts persist:

> Open the project → Lovable Cloud → Advanced settings → **Upgrade instance** so the backend can handle more concurrent traffic and heavier review-submission writes.
> Docs: https://docs.lovable.dev/features/cloud#advanced-settings-upgrade-instance

We will tell Piyush this explicitly in the response after applying the fixes.

### 5. Tests / regression protection
- `src/test/submitSelfReviewRetry.test.ts` — mocks supabase to return 57014 once then succeed, asserts the hook retries and resolves; second test asserts a permanent error surfaces the friendly message, not "Upload failed".
- `src/test/triggerShortCircuit.test.ts` — SQL-shape assertion that `enqueue_pms_compression_jobs` body contains an `OLD … IS NOT DISTINCT FROM NEW` short-circuit and that `log_untracked_submission_changes` no longer reacts to self_score-only diffs.

### 6. Docs / Memory / Changelog
- `DOCUMENTATION.md`: add a "Submit Self Review resilience" section under Review module.
- `POLICY.md`: add §X — *Trigger cascades on hot tables (`review_submissions`, `kpis`) MUST short-circuit when their target columns did not change.*
- `CHANGELOG_2026.md`: v2.66.13 — Self-review submission resilience + trigger cascade trimming.
- Update memory: `mem://infrastructure/resource-and-performance-optimization` — add note about transient-error retry policy and DB-trigger short-circuit rule for `review_submissions`.

## Risk & Impact

| Area | Impact |
|------|--------|
| Data | None — pure short-circuit and retry; no schema or RLS change. |
| Workflow | None — same final state for the submission. |
| UI/UX | Toast wording improves; behaviour identical on success. |
| Regression | Low — triggers only stop work when target columns are unchanged. New unit tests guard this. |
| Mitigation | Both unit tests above + manual verification by re-submitting a self review. |

## Files to add / change

- **Edit** `src/hooks/useKpis.ts` (retry + friendly error in `useSubmitSelfReview`)
- **Edit** `src/components/review/SelfReviewSheet.tsx` (toast title + message mapping)
- **New** `supabase/migrations/<ts>_trim_review_submissions_trigger_cascade.sql`
- **New** `src/test/submitSelfReviewRetry.test.ts`
- **New** `src/test/triggerShortCircuit.test.ts`
- **Edit** `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`
- **Edit** `mem://infrastructure/resource-and-performance-optimization`

Approve to proceed.
