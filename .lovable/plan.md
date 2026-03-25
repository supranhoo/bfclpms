


## Milestone 2: Resilience & Guardrails — COMPLETED

### What was implemented

1. **Edge Function Retry Wrapper** — `supabase/functions/_shared/retry.ts`
   - 3 attempts with exponential backoff (1s, 2s, 4s)
   - Skips retries on client errors (4xx)
   - Applied to `send-email-notification` (all providers: SMTP, Resend, Microsoft Graph)
   - Applied to `propagate-template-change` (batch KPI updates)

2. **1000-Row Query Limit Fix**
   - `src/pages/reports/AuditTrailReport.tsx` — replaced `.limit(1000)` with paginated `.range()` fetching
   - `src/pages/reports/KpiJourneyReport.tsx` — department filter dropdown now fetches in 1000-row batches
   - Main KPI journey data already used server-side RPC with pagination (no change needed)

3. **Session-Expired Form Recovery**
   - `src/components/review/UnifiedScorecard.tsx` — auto-saves review drafts (score, remarks, achieved value, evidence URLs) to `sessionStorage` keyed by `review-draft-{kpiId}-{viewLevel}`
   - Drafts restored when re-opening review sheet
   - Drafts cleared on successful submit (all 4 success paths)

4. **PIP Letter Download**
   - `src/components/pip/PIPDetailSheet.tsx` — replaced TODO stub with actual `generate-pip-letter` edge function invocation
   - Downloads PDF blob, shows loading state

5. **Auto-Reconcile Toast Feedback**
   - `src/hooks/useWorkflowConfig.ts` — surfaces reconciliation count as toast notification to admin

### Files Modified
- `supabase/functions/_shared/retry.ts` — NEW shared retry utility
- `supabase/functions/send-email-notification/index.ts` — withRetry on all send paths
- `supabase/functions/propagate-template-change/index.ts` — withRetry on batch updates
- `src/pages/reports/AuditTrailReport.tsx` — paginated fetching
- `src/pages/reports/KpiJourneyReport.tsx` — paginated dept filter
- `src/components/review/UnifiedScorecard.tsx` — sessionStorage draft save/restore
- `src/components/pip/PIPDetailSheet.tsx` — wire generate-pip-letter
- `src/hooks/useWorkflowConfig.ts` — toast for auto-reconcile

### Risk Assessment
- Retry wrapper: Only retries on server/transient errors (5xx, timeouts). Client errors (4xx) fail immediately. No duplicate email risk since retries happen within the same request.
- Session recovery: Per-browser, per-KPI drafts. Cleared on success. No data leak risk.
- Pagination: Increases initial load time for very large audit trails but ensures complete data.
