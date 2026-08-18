# Supporting file won't open — "The file server is busy right now"

## What was reported
Ashish Kataria (200226, manager) cannot open a supporting file. The preview dialog opens with the correct file name (`200083_Post_Auction_Negotiation_Compliance_Self_Evidence.png`) but the body shows "The file server is busy right now — please retry in a moment." with Retry / Download instead.

## What has been verified (reads only)
- The evidence file itself is **not missing**: of 11,943 self-evidence URLs referenced in review submissions, **0** have no matching object in the `review-evidence` bucket.
- The message is not a permission message. In `src/lib/review/evidenceError.ts`, permission/404/400 failures render "You do not have access to this file…". The "file server is busy" text is only produced by `isTransientEvidenceError()` — i.e. a 5xx/408/429 status, a statement timeout, or a **fetch-level failure** (`failed to fetch`, `network error`, `connection`, `aborted`), or the 20s preview timeout.
- The preview path (`EvidencePreviewDialog.tsx`) only calls `storage.createSignedUrl()`. That call goes through the storage SELECT policies, which run `can_read_kpi_evidence()` — a multi-branch PL/pgSQL function that hits `kpis`, `profiles`, `get_skip_level_manager`, auditor assignment tables and `org_kpi_data_owners` with `normalize_kpi_text` comparisons.

So there are exactly two candidate causes, and the current code cannot tell them apart:
1. **Request never reached the server** — the browser blocked the `*.supabase.co` fetch (extension/ad-blocker/corporate proxy, the exact problem `openStorageFile()` already documents), or the network dropped. Retry will keep failing forever.
2. **Server-side slowness** — the RLS predicate timed out or storage returned 5xx under load. Retry may succeed.

The root cause is **unconfirmed**; step 1 below is to confirm it before changing behaviour.

## Plan

### 1. Confirm which failure it is (first, before any fix)
- Add a structured diagnostic to the sign failure path: status code, error name/message, elapsed ms, bucket, KPI id, and whether the failure was a network-level throw versus a returned error object. Surface a copyable "Diagnostics" line in the error state of the dialog so a user can send it back.
- Ask Ashish to reproduce once and share the diagnostic line (or a browser console screenshot). Elapsed ~0ms + `Failed to fetch` = cause 1; elapsed multi-second + 5xx/57014 = cause 2.

### 2. Fix the classification so the message is honest
- Split the current single transient message into two:
  - Network/blocked (`Failed to fetch`, no status): "We couldn't reach the file server. This is usually a browser extension, ad-blocker or office network blocking the download — try another browser or use Download instead."
  - Real server pressure (5xx / timeout / 57014): keep "busy, please retry".
- Today both collapse into "busy", which sends users into an endless retry loop for a problem retry cannot solve.

### 3. Make retry actually help
- Automatic retry of the signing call with backoff (2 attempts, ~400ms/1200ms) before showing an error, so a single transient blip resolves without user action.
- Keep the existing manual Retry and Download-instead fallbacks.

### 4. Reduce the server-side cost if step 1 points at cause 2
- Only if diagnostics show timeouts: short-circuit `can_read_kpi_evidence()` for the cheap, common branches first and confirm supporting indexes exist for the manager/skip-level lookups. No policy semantics change — the same people keep the same access.

## Technical notes
- Files touched: `src/lib/review/evidenceError.ts` (new network-vs-busy classification + exported message constants), `src/components/review/EvidencePreviewDialog.tsx` (retry-with-backoff, diagnostics block), `src/components/safety/EvidencePreviewDialog.tsx` (same classification for parity).
- Tests: extend `src/test/evidenceErrorTransient.test.ts` for the network/blocked vs busy split, and `src/test/review/evidencePreview.test.ts` for retry-with-backoff (succeeds on 2nd attempt, gives up after the last).
- Docs: ADR-298 + POLICY §EVIDENCE-PREVIEW-FAILURE-CLARITY — an evidence preview failure must always name the actual class of failure (no access / not reachable / server busy) and never present an unretryable failure as retryable.

## Risk and impact
- **Data:** none — read-only preview path, no schema or storage change in steps 1-3.
- **Workflow/permissions:** unchanged; no RLS semantics are altered.
- **Regression:** low; the change is confined to error messaging and a bounded retry.
- **Rollback:** revert the frontend commit; nothing to undo in the database.
