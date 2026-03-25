

# Option A: Stability-First Implementation Plan

## Status Assessment

**Milestone 1 (Stability & Data Integrity)** — mostly complete:
- ✅ `activeReviewStage` fix in UnifiedScorecard — already deployed
- ✅ `reconcile_workflow_statuses` extended with 3 classes — already in DB
- ✅ Auto-reconcile edge function + hook wiring — already deployed
- ⬜ Run one-time reconciliation — admin action, not a code change
- ⬜ Verification that zero new orphaned KPIs appear for 7 days — monitoring

**Milestone 2 (Resilience & Guardrails)** — not started:
- ⬜ Edge function retry wrapper
- ⬜ 1000-row query limit fix (2 files affected)
- ⬜ Session-expired form recovery
- ⬜ PIP letter download wiring

**Recommendation:** Milestone 1 is code-complete. Start implementing Milestone 2.

---

## Milestone 2 Implementation Plan

### Step 1: Edge Function Retry Wrapper
Create a shared retry utility used by critical edge functions.

**New file:** `supabase/functions/_shared/retry.ts`
- Wrap `fetch` calls with 3 attempts, exponential backoff (1s, 2s, 4s)
- Return last error if all retries fail

**Update:** `supabase/functions/send-email-notification/index.ts`
- Wrap the SMTP/email send call with the retry utility

**Update:** `supabase/functions/propagate-template-change/index.ts`
- Wrap the batch update logic with retry on transient DB errors

### Step 2: Fix 1000-Row Query Limits
Two report pages silently truncate data at 1000 rows.

**`src/pages/reports/KpiJourneyReport.tsx`** (line ~98):
- Replace `.limit(1000)` with paginated fetching using `.range()`
- Add a loop that fetches in 1000-row chunks until no more data
- Or use server-side RPC aggregation if the report only needs summary stats

**`src/pages/reports/AuditTrailReport.tsx`** (line ~156):
- Same pagination approach
- Add a "Load more" button or auto-paginate
- Show total count badge so admin knows how many records exist

### Step 3: Session-Expired Form Recovery
Prevent data loss during long review sessions when auth tokens expire.

**`src/components/review/UnifiedScorecard.tsx`**:
- Before submitting review, save current form state (scores, remarks, evidence paths) to `sessionStorage` keyed by `review-draft-${kpiId}`
- On successful submit, clear the draft
- On component mount, check for existing draft and offer to restore
- Show a small "Draft saved" indicator

**`src/contexts/AuthContext.tsx`**:
- On auth error / session expiry, show a modal instead of hard redirect
- Modal says "Session expired — your draft is saved. Please log in again."

### Step 4: Wire PIP Letter Download
The edge function `generate-pip-letter` exists but is not connected to the UI.

**`src/components/pip/PIPDetailSheet.tsx`** (line ~128):
- Replace the TODO stub with actual edge function invocation
- Call `supabase.functions.invoke('generate-pip-letter', { body: { pip_id: pip.id } })`
- Receive PDF blob, create download link
- Show loading state on the download button

### Step 5: Auto-Reconcile Toast Feedback
Currently auto-reconcile logs to console only. Surface results to admin.

**`src/hooks/useWorkflowConfig.ts`** (line ~141):
- After successful reconciliation with `reconciled_count > 0`, trigger a toast notification
- Message: `"${count} KPI(s) auto-reconciled due to workflow change"`

---

## Files Modified
- `supabase/functions/_shared/retry.ts` — new shared retry utility
- `supabase/functions/send-email-notification/index.ts` — add retry
- `supabase/functions/propagate-template-change/index.ts` — add retry
- `src/pages/reports/KpiJourneyReport.tsx` — paginated fetching
- `src/pages/reports/AuditTrailReport.tsx` — paginated fetching
- `src/components/review/UnifiedScorecard.tsx` — sessionStorage draft save/restore
- `src/contexts/AuthContext.tsx` — session-expired modal
- `src/components/pip/PIPDetailSheet.tsx` — wire generate-pip-letter
- `src/hooks/useWorkflowConfig.ts` — toast for auto-reconcile results

## Dependencies & Risks
- Retry wrapper: Must ensure idempotency for email sends (don't send duplicate emails). Use a dedup key based on notification ID.
- Session recovery: Draft data is per-browser — if user switches devices, draft is lost. Acceptable tradeoff.
- PIP letter: Edge function must be tested to confirm it returns a valid PDF blob.
- Query limits: Paginated fetching increases load time for large datasets but ensures data completeness.

