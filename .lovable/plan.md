

## Improved Plan: Reliable Multi-Phase Backup Engine

### Root Cause (Confirmed)
The `create-backup` function hits **CPU Time exceeded** on every scheduled run since April 6. The last success (Apr 8, manual) only managed 50 of 81 tables in 61 seconds. The function tries to serialize and upload ~110MB of JSON data (135K+ rows across 81 tables) in a single invocation — exceeding Deno's CPU budget.

### Reliability Problem with Self-Invocation Chain
The previously proposed self-invocation approach (function calls itself for next batch) has a critical flaw: **if any link in the chain fails, the entire backup is orphaned** with no automatic recovery. There's no retry, no resumption, and debugging partial failures is difficult.

### New Approach: Client-Orchestrated Batching with Resume

Instead of a fragile self-invocation chain, split responsibility:

1. **Edge function becomes a stateless worker** — it processes only the tables it's told to process
2. **Client orchestrates the batches** for manual backups (with progress UI)
3. **A lightweight coordinator function** handles scheduled (cron) backups by calling the worker sequentially
4. **Resume capability** — if a batch fails, the client can retry just that batch

### Changes

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/create-backup/index.ts` | Refactor to accept `tables`, `backup_id`, `folder_path` params. When called without these (first call), it creates the log entry and returns the backup_id + folder_path. When called with a table list, it processes only those tables. A `finalize: true` param triggers manifest generation and log completion. |
| 2 | `src/hooks/useBackups.ts` | Rewrite `useTriggerBackup` to orchestrate: (1) init call → get backup_id, (2) loop through 9 batches of ~9 tables each, calling the worker, (3) finalize call. Track progress state for UI. Retry failed batches up to 2 times. |
| 3 | `src/hooks/useBackups.ts` | For cron-triggered backups: the edge function detects `backup_type: 'scheduled'` and internally processes tables in small sequential batches within a single call but with a **table budget** (stop after N tables if approaching time limit), then self-invokes only once for the remainder — a 2-call max chain, not 9. |
| 4 | `DOCUMENTATION.md` | Document multi-phase backup architecture |
| 5 | `POLICY.md` | Version sync |

### Technical Detail

**Edge function API (3 modes):**

```text
POST create-backup

Mode 1 — INIT (no tables param):
  Body: { backup_type: 'manual' | 'scheduled' }
  Returns: { backup_id, folder_path, tables: string[][] } 
  (tables pre-split into 9 batches)

Mode 2 — PROCESS BATCH:
  Body: { backup_id, folder_path, tables: ['profiles', 'kpis', ...] }
  Returns: { processed: [{table, rows, sizeBytes}], errors: [] }

Mode 3 — FINALIZE:
  Body: { backup_id, folder_path, finalize: true }
  Generates manifest, updates backup_logs as completed
  Returns: { success: true, tables_count, total_rows }
```

**Client orchestration (manual backups):**
```typescript
// 1. Init
const { backup_id, folder_path, tables: batches } = await invoke('create-backup', { backup_type: 'manual' });

// 2. Process each batch (with retry)
for (const batch of batches) {
  let retries = 2;
  while (retries > 0) {
    const result = await invoke('create-backup', { backup_id, folder_path, tables: batch });
    if (!result.error) break;
    retries--;
  }
  updateProgress(completedBatches / totalBatches);
}

// 3. Finalize
await invoke('create-backup', { backup_id, folder_path, finalize: true });
```

**Scheduled backups (cron):**
The INIT mode for `backup_type: 'scheduled'` runs all 3 phases internally but processes tables in batches of 10 with a time guard — if elapsed time exceeds 100s, it finalizes with whatever tables completed and logs a partial success. This avoids CPU timeout while keeping cron backups self-contained.

**Reliability advantages over self-invocation:**
- No chain — each batch is independent and retryable
- Client sees progress and can retry individual failures
- Partial backups are usable (manifest reflects what completed)
- Scheduled backups have a time guard instead of hoping the chain completes
- Failed batches don't orphan the entire backup

### Risk Assessment
- **Data impact**: None — same storage format, same manifest structure
- **Regression risk**: Low — download/restore functions work unchanged with chunked manifests
- **Reliability**: High — retry + resume + time guards eliminate the single-point-of-failure problem

