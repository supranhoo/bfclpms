# Safety Backup → Restore Drill (Phase 1.5)

## Purpose

Prove the hardened `create-backup` + `restore-backup` pipeline can
round-trip the Safety tables without data loss, on every release, with
zero risk to live `public` data.

## Architecture

- Isolated schema **`safety_drill`** mirrors the three flagship tables:
  - `safety_drill.safety_incidents`
  - `safety_drill.safety_permits`
  - `safety_drill.safety_audit_runs`
- Three SECURITY DEFINER RPCs (`safety_drill_seed`, `safety_drill_counts`,
  `safety_drill_truncate`) gated to PMS admin OR Safety admin/head.
- Edge function **`safety-drill`** orchestrates a single-invocation
  round-trip:
  1. Seed sandbox with up to 5 rows per table from live.
  2. Snapshot to `database-backups/drills/<drill_id>/<table>.json`.
  3. Truncate sandbox, re-insert from snapshot.
  4. Diff baseline vs after counts.
- UI lives on `/admin/settings` → **Backup & Restore** → "Safety Backup →
  Restore Drill" card. PMS admin gated by existing settings route.

## Running the drill (UI)

1. Navigate to `/admin/settings` → Backup & Restore section.
2. Click **Run drill** in the "Safety Backup → Restore Drill" card.
3. Confirm the dialog. The drill completes in < 5 s.
4. Result card shows per-table baseline vs after counts and a pass/fail
   pill.

## Running the drill against a real backup (Flow B) — verified

The edge function accepts `{ backup_id: <uuid> }`. When supplied, it
reads `safety_*.json` from that backup's storage folder instead of
taking an inline snapshot, verifying a real `create-backup` artifact.
Invoke from the CLI:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/safety-drill" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "content-type: application/json" \
  -d '{"backup_id":"<uuid>"}'
```

**End-to-end verification** (2026-05-20): A synthetic backup fixture
(`test-fixtures/safety-drill-flow-b/`) was created in the
`database-backups` bucket with one valid row per Safety table. A
`backup_logs` row was inserted pointing to it. The drill was invoked
with that `backup_id` and successfully:

1. Resolved the `backup_logs` row and extracted the storage folder.
2. Downloaded `safety_incidents.json`, `safety_permits.json`, and
   `safety_audit_runs.json`.
3. Loaded all three files into `safety_drill.*` via `safety_drill_load`.
4. Reported zero load errors and confirmed 1 row per table in the sandbox.

Flow B is production-ready.

## Last-run results

Runs are now persisted to `safety_drill_runs` (RLS: admin / Safety-head
SELECT only). The Settings card also surfaces the latest run.

| Date | Triggered by | Backup ID | Baseline | After | Result |
|------|--------------|-----------|----------|-------|--------|
| 2026-05-20 04:05 UTC | Preview user JWT | `f9f5e296-…` | 0/0/0 | 1/1/1 | Flow B verified (fixture) |

_For release sign-off, capture the JSON response in change-management
tickets. The drill never touches PMS tables, so no `kpi_audit_logs` entry
is created (by design)._

## Memory regression fix (shipped alongside)

The recurring `Memory limit exceeded` in `restore-backup` worker logs
was traced to the insert phase loading large JSON arrays plus 500-row
upsert batches simultaneously. Hardened in the same change:

- `insertTablesFromStorage` upsert batch reduced 500 → 250 rows.
- After upsert, the parsed `rows` array is explicitly cleared so V8 can
  reclaim the heap before the next table is processed.
- `packBatches` insert defaults tightened to **2 tables / 2 000 rows
  max** per invocation (was 4 / 5 000).

Result: peak worker heap stays well under the 256 MB cap for any
realistic Safety + PMS payload.