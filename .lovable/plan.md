## RCA — Why Backup Failed Again (2026-06-11 22:30 IST)

### Evidence
From `backup_logs` for the failed run `c7b341a7…`:
```
status        = failed
tables_count  = 199 / 211   (12 tables missing = 3 batches × 4)
error_message = "Coverage shrink: 199/211 tables backed up — 3 warning(s):
                 Batch 5/53 failed (non-transient): HTTP 502;
                 Batch 6/53 failed (non-transient): HTTP 502;
                 Batch 7/53 failed (non-transient): HTTP 502"
```
Three consecutive early batches got `HTTP 502 Bad Gateway` from the Supabase REST/PostgREST gateway. Hard-fail-on-partial (WP-9.2.a) correctly marked the run `failed`. Working as designed — but the run **should not have lost those batches in the first place.**

### 5-Why Analysis

| # | Why? | Answer |
|---|---|---|
| 1 | Why did the 11 Jun scheduled backup fail? | Hard-fail triggered: 199 of 211 tables backed up. |
| 2 | Why were 12 tables missing? | Batches 5, 6, 7 each failed with `HTTP 502` and were skipped. |
| 3 | Why were those batches skipped instead of retried? | `isTransientChunkError()` in `create-backup/index.ts` (lines 725-737) only treats **HTTP 546 / HTTP 429 / RateLimitError** as transient. `502` falls through to the `// generic 5xx other than 546. Do not retry.` branch. |
| 4 | Why was that classifier scoped so narrowly? | Phase 9.2 WP-b focused on the then-dominant failure modes (Deno worker OOM = 546, edge rate limits = 429). Upstream gateway transients (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout) were not in the observed sample set and were left as "non-transient". |
| 5 | Why did we not catch the gap earlier? | Until 11 Jun, the recurring failure pattern was 546 on Batch 46 (one chronically large table) — not 502. The classifier was never stress-tested against a gateway-side blip, so the gap remained latent. The 11 Jun event was the first transient 502 burst since the policy shipped. |

### Root Cause
**Mis-classification of upstream gateway errors (HTTP 502/503/504) as non-transient** in `isTransientChunkError`. A short upstream blip on Supabase's gateway killed three back-to-back batches that a normal retry-with-backoff would have recovered — exactly the use case the retry policy was built for. The hard-fail policy then (correctly) marked the run failed.

### Secondary Finding (chronic, not the trigger for this failure)
`backup_logs` shows a long tail of `Batch 46/51 HTTP 546; sub 1/2 failed after 2 retries` (2026-06-04, 06-05, 06-06, 06-07, 06-08, 06-09). One specific table at dependency position ~46 OOMs the Deno worker **even at `BATCH_SIZE_RETRY = 1`** (i.e. table alone). Streaming chunk export isn't enough for that table. Out of scope for this fix but tracked below as CAPA-2.

### CAPA

#### CAPA-1 (Corrective — fixes the 11 Jun failure class)
Expand `isTransientChunkError` to also classify as transient:
- `HTTP 502` (Bad Gateway)
- `HTTP 503` (Service Unavailable)
- `HTTP 504` (Gateway Timeout)
- `HTTP 408` (Request Timeout)
- Network-layer errors: `fetch failed`, `ECONNRESET`, `ETIMEDOUT`, `socket hang up`

These are all canonical idempotent-retryable errors per RFC 7231 / standard backend retry policy. The existing retry mechanics already cover them safely:
- Max 2 retries per chunk, 5s / 15s backoff
- `BATCH_SIZE_RETRY = 1` (single-table isolation)
- Global `RETRY_BUDGET_MS = 8 min` cap

No new infra, no schema change, no constant tuning. **One file changed:** `supabase/functions/create-backup/index.ts`. Hard-fail policy and shrink-guard remain authoritative — retries only get a wider net of "worth retrying".

**Rollback:** revert the regex additions in `isTransientChunkError`. Backward-compatible; behaviour falls back to current narrow classifier.

#### CAPA-2 (Preventive — tracked, not in this change)
Diagnose the chronic `Batch 46` OOM:
- Identify which table sits at dependency index ~46 (likely a wide row + JSONB table — `org_kpi_data_entry_logs`, `notifications`, or a `*_audit_log`).
- If it's a single fat table, add row-level streaming (chunk the table itself via `LIMIT/OFFSET` keyset rather than table-at-a-time) for tables above a row-count or column-width threshold.
- Open as separate ticket; do **not** bundle with CAPA-1 to keep the surgical change auditable.

#### CAPA-3 (Detective — already in place, verified)
- Hard-fail-on-partial (`backup_hard_fail_on_partial = true`) correctly converted the partial run to `failed`. No change needed; this is exactly why we shipped it.
- Backup History UI already exposes `error_message` with the per-batch breakdown — that's how we diagnosed this in <5 minutes. No UI change needed.

### Risk & Impact (CAPA-1 only)

| Area | Impact |
|---|---|
| Data | None. Retries are read-only re-exports of the same tables; idempotent. |
| Workflow | None. Same scheduled cron, same finalize path. |
| UI/UX | None. Status pills and history unchanged. |
| Regression | Very low. Adds matches to a regex; non-matching paths unchanged. |
| Scalability | Slightly longer worst-case wall time (≤ 8 min retry budget already capped). No change to memory profile. |
| Backup integrity | Improved — more transient classes recovered before hard-fail trips. |

### Step-by-Step Plan

1. **Edit** `supabase/functions/create-backup/index.ts` → `isTransientChunkError`: add `502/503/504/408` regex branches and a network-error string match. Keep the existing 546/429/RateLimit branches.
   - **Verify:** added unit assertions in the existing classifier test (`supabase/functions/create-backup/*test*.ts` if present, else inline) covering 502/503/504/408/network. Re-run `bunx vitest run` for the safety + backup contract tests (I8/I9/I10/I11 stay green — they assert *presence* of 546/429/RateLimit and retry mechanics, not exclusivity).
2. **Update** memory `mem/infrastructure/database/backup-batch-retry-policy` to add the widened transient set + rationale, preserving the WP-9.2 invariants.
3. **Update** `DOCUMENTATION.md` (backup runbook section) and `POLICY.md` (operational policy: which HTTP statuses are retryable for the backup engine). One-paragraph addition each.
4. **Deploy** edge function via the standard flow.
5. **Verify in production:** trigger one manual backup; confirm `status='completed'` and `tables_count = discoveredCount`. Watch the next 2 scheduled runs for absence of "non-transient: HTTP 5xx" entries.

### Files Touched (CAPA-1)
- `supabase/functions/create-backup/index.ts` (classifier only — ~6 lines)
- `mem/infrastructure/database/backup-batch-retry-policy`
- `DOCUMENTATION.md`, `POLICY.md`

### Not Changed (explicitly)
- `BATCH_SIZE = 4`, `BATCH_SIZE_RETRY = 1`, `RETRY_BUDGET_MS = 8 min` — locked invariants.
- Hard-fail-on-partial policy, shrink-guard, `get_backup_table_order` RPC, `backup_denylist`.
- `restore-backup`, `safety-drill`, Backup History UI.

Awaiting approval to implement CAPA-1. CAPA-2 will be raised as a separate ticket after this lands.