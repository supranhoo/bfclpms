## Diagnosis recap

Pulled `cron.job` + `cron.job_run_details` (last 7 days). The recent compute spike is dominated by sub-hourly cron jobs that mostly run on **empty queues**:

| Job | Schedule today | Runs / 30d | Current workload |
|---|---|---:|---|
| `compress-evidence-every-2min` | every 2 min | ~21,600 | PMS jobs pending = **0**, Safety non-webp = **0** |
| `check-safety-sla-every-5min` | every 5 min | ~8,640 | small open-incident queue |
| `safety-analytics-refresh-30min` | every 30 min | ~1,440 | full `REFRESH MATERIALIZED VIEW` every run |
| `permit-expiry-sweep-15min` | every 15 min | ~2,880 | |
| `reap-stuck-backups-every-15min` | every 15 min | ~2,880 | |
| `process-scheduled-emails` | every 15 min | ~2,880 | user-facing email latency |

Each `compress-evidence` invocation cold-starts and loads ~5 MB of WASM (`@jsquash/jpeg`, `png`, `webp`) even when there's nothing to do. That alone explains most of the recent Cloud compute bill.

## Risk & Impact Report

- **Data:** none. Queued jobs still process, just on a slower cadence.
- **Workflow:** evidence images stay as JPEG/PNG longer (cosmetic — storage size only). Safety SLA / permit-expiry / backup-reaper alerts arrive minutes later, well within their business SLAs.
- **UI:** none.
- **Regression risk:** low. Schedule changes + a cheap early-exit guard. No business logic.
- **Scalability:** cost now scales with actual queue depth, not wall-clock.
- **Rollback:** every change is one `cron.unschedule` + `cron.schedule` call — reversible in a single migration.

## Plan

### Step 1 — Re-schedule cron jobs

| Job | Today | **New** | Why |
|---|---|---|---|
| `compress-evidence-every-2min` | every 2 min | **once daily at 03:30 UTC** (`30 3 * * *`) | Per user direction. Queue is empty 99% of the time; nightly run is plenty for background WebP re-encode. Job renamed to `compress-evidence-daily`. |
| `check-safety-sla-every-5min` | every 5 min | **every 15 min** | SLA breaches are tracked in minutes-to-hours. |
| `safety-analytics-refresh-30min` | every 30 min | **every 2 h** | Dashboards, not realtime alerts. |
| `permit-expiry-sweep-15min` | every 15 min | **every 1 h** | Daily/weekly concern. |
| `reap-stuck-backups-every-15min` | every 15 min | **every 1 h** | Backups run weekly. |
| `process-scheduled-emails` | every 15 min | **unchanged** | User-facing email latency — leave alone. |

Implementation: a single `supabase--insert`-style SQL call that runs `cron.unschedule(<old name>)` and then `cron.schedule(<new name>, <new cron>, <same http_post body>)` for each job. Schedules are user-specific data (URLs + tokens) so we use the insert/SQL path, not a checked-in migration.

Verification: re-query `cron.job` after the change and confirm new schedules + that the old job names are gone.

### Step 2 — Empty-queue short-circuit in `compress-evidence`

Even with daily cadence, guard the entry-point so the function exits before importing the WASM codecs when both queues are empty:

```ts
const [{ count: pmsPending }, { count: safetyPending }] = await Promise.all([
  sb.from('pms_evidence_compression_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'failed'])
    .lt('attempts', MAX_ATTEMPTS),
  sb.from('safety_incident_evidence')
    .select('id', { count: 'exact', head: true })
    .in('compression_status', ['pending', 'failed'])
    .lt('compression_attempts', MAX_ATTEMPTS),
]);
if ((pmsPending ?? 0) === 0 && (safetyPending ?? 0) === 0) {
  return jsonResponse({ ok: true, skipped: 'empty_queue' });
}
```

(POLICY §120 — zero-row `head: true` count call is explicitly allowed.)

The dynamic-imports of `@jsquash/*` codecs are moved inside `decodeImage()` so they only load when there's real work.

Verification: invoke `compress-evidence` manually with empty queue → response under ~200 ms and no codec import in logs.

### Step 3 — Add an "On-demand re-encode" button to the existing admin panel

`src/components/admin/ServerCompressionPanel.tsx` already has the master switch and queue counters. Add one button: **"Run compression now"** that calls `supabase.functions.invoke('compress-evidence')` and refreshes the queue counts. This is how the admin "moves to manual" between the daily runs if a large batch lands.

Update the panel's description text from *"every 2 minutes"* to *"runs once daily; admins can trigger an on-demand run below"*.

Verification: click the button while there are pending jobs → toast shows result; queue counts drop on next refresh.

### Step 4 — Documentation

- `DOCUMENTATION.md`: replace the "Scheduled Jobs" cadence table with the new values; document the on-demand button.
- `POLICY.md`: record SLA — evidence WebP re-encode is best-effort, processed at least once per 24 h; admins may trigger manually.
- Update mem `mem://features/image-compression-server.md` cron line from `*/2 * * * *` to the new daily schedule.

### Step 5 — Measure

After 7 days, re-pull `cron.job_run_details` and compare. Expected reductions:

- compress-evidence: 21,600 → **~30 /month** (−99.9%)
- safety-sla: 8,640 → 2,880 (−67%)
- safety-analytics: 1,440 → 360 (−75%)
- permit-expiry + reap-backups: 5,760 → 1,440 combined (−75%)
- **Total cron invocations: roughly −95%**, which should reflect directly in the Cloud compute line.

## Technical details

- `cron.unschedule(jobname)` requires the old name to exist — wrap in `DO $$ ... EXCEPTION WHEN OTHERS THEN NULL; $$` so re-runs are idempotent.
- Each new `cron.schedule(...)` keeps the **exact same `net.http_post(...)` body** as today (URL, headers, anon/cron-secret). No auth-posture change.
- `compress-evidence/index.ts` change is additive: existing `server_compression_enabled` kill-switch still wins; the new empty-queue exit just runs before it does any work.
- No RLS, no schema, no backup-coverage change.

## Out of scope

- Removing the Safety module or compression feature entirely (still in use — just over-scheduled).
- Optimising edge-function cold-start beyond the empty-queue guard. Revisit only if numbers stay high after Step 1 + 2.
