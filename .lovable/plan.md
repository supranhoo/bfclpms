## Goal

Prove that the hardened `create-backup` + `restore-backup` pipeline can round-trip the Safety tables without data loss, using a sandbox so production rows are never at risk. Land the evidence (row counts, manifest integrity, log excerpt) in `docs/safety/phase1/hardening-baseline.md` and unlock the Phase 2 gate.

## Why a sandbox, not a real restore

`restore-backup` is destructive — it `DELETE`s every row in `DELETE_ORDER` before re-inserting. Running it against the live `public` schema would wipe PMS + Safety data. So the drill runs in an isolated `safety_drill` Postgres schema that mirrors the three tables under test, and a small **`safety-drill`** edge function copies live rows into it, invokes restore-style logic against the sandbox, and reports row deltas.

This keeps the drill repeatable and CI-friendly without ever touching production tables.

## Scope

In:
- Seed sandbox with ≥1 row from `safety_incidents`, `safety_permits`, `safety_audit_runs` (copied from `public`, IDs preserved).
- Run `create-backup` end-to-end → confirm `manifest.json.integrity.status = 'ok'` for the three tables.
- Run a restore against the sandbox schema using the same chunked batches the live `restore-backup` produces → diff sandbox row counts pre vs post.
- Capture results in a new doc page + append a summary to `hardening-baseline.md`.
- Fix the lingering `restore-backup` "Memory limit exceeded" seen in today's logs (downloads the whole `<table>.json` into memory — switch to streamed `Response.body` + chunked JSON parse for any file > 5 MB, and cap per-invocation insert work to one large table).

Out:
- Restoring evidence files from the `safety-media` bucket (storage objects, not rows — separate ticket).
- Phase 2 Incident UX work.

## Deliverables

```text
supabase/functions/safety-drill/index.ts        new — sandbox orchestrator
supabase/functions/restore-backup/index.ts      patched — streamed download + single-large-table guard
src/pages/admin/Settings.tsx                    new "Run Safety Drill" button (admin only)
src/hooks/useSafetyDrill.ts                     new — invokes safety-drill, polls status
docs/safety/phase1/backup-restore-drill.md      new — drill runbook + last-run results
docs/safety/phase1/hardening-baseline.md        append drill summary, mark "Next" item done
src/test/safety/backup-restore-drill.test.ts    new vitest — mocks edge fn, asserts UI surfaces deltas
mem://features/safety/hardening-baseline        update with drill SOP + sandbox schema name
```

## Technical notes

### Sandbox schema (migration)
- `CREATE SCHEMA IF NOT EXISTS safety_drill;`
- `CREATE TABLE safety_drill.safety_incidents (LIKE public.safety_incidents INCLUDING ALL);` × 3 tables.
- Grant `service_role` full DML; no GRANTs to `anon`/`authenticated`.
- New RPC `safety_drill_seed()` — admin/safety_head only, `SECURITY DEFINER`, `TRUNCATE` + `INSERT … LIMIT 5` from public into sandbox.
- New RPC `safety_drill_counts()` — returns `{table, count}[]` for the 3 tables.

### `safety-drill` edge function (phases mirror `restore-backup`)
1. `seed` — calls `safety_drill_seed`, returns baseline counts.
2. `backup` — invokes `create-backup` (live path) and records the resulting `backup_id`.
3. `restore` — for each `INSERT_ORDER` batch from that backup that touches one of the 3 tables, download the `<table>.json` and re-insert into `safety_drill.<table>` (NOT `public.<table>`) using the same 500-row upsert chunks.
4. `verify` — calls `safety_drill_counts`, diffs vs baseline, returns `{ok, missing[], extra[], integrity}`.

Phases are client-orchestrated through `useSafetyDrill` (same pattern as `useTriggerRestore`) so no single invocation breaches the 150 s / 256 MB worker budget.

### Memory fix in `restore-backup`
- Replace `await fileData.text()` + `JSON.parse(...)` with a streaming reader: `const reader = fileData.stream().pipeThrough(new TextDecoderStream()).getReader();` and a small incremental JSON-array parser that yields each row to a 500-row buffer; flush via `upsert`. Keeps peak heap ≈ a few MB regardless of table size.
- If a single table file exceeds 20 MB or 50 000 rows, the `insert` phase returns `{partial: true, resume_token: <byte_offset>}` and the client re-invokes the same batch with that token; the function resumes streaming from the offset.

### UI
- `/admin/settings` → new "Safety Drill" card visible only to PMS admin + safety admin. Shows last run timestamp, status pill (passed / failed / running), and a `ConfirmDestructiveDialog`-gated "Run Drill" button. On success surfaces a toast with per-table row deltas and a link to the drill doc page.

### Tests
- `backup-restore-drill.test.ts` mocks `supabase.functions.invoke('safety-drill', …)` for each phase and asserts: baseline > 0, post-restore counts equal baseline, integrity payload renders, error branch surfaces a destructive toast.
- Vitest does not need to touch the live edge fn — the runbook in `backup-restore-drill.md` covers the live smoke procedure.

### Risk & Impact

- **Data**: zero risk to `public` — all writes target `safety_drill.*`. Migration is additive (new schema, new RPCs, no policy changes to existing tables).
- **Workflow**: no change to incident/permit/audit lifecycles.
- **UI/UX**: one new admin-only card on `/admin/settings`; respects existing settings layout.
- **Regression**: streaming refactor in `restore-backup` is the only edit to a shared edge function — covered by the new vitest plus a manual replay of the last legacy backup file.
- **Mitigation**: feature-flag the streaming path behind `RESTORE_STREAMING=1` env var so we can fall back to the buffered code instantly if a regression appears in prod restores.

## Execution order

1. Migration: `safety_drill` schema + RPCs.
2. Patch `restore-backup` (streaming + resume token) and deploy.
3. New `safety-drill` edge function + deploy.
4. `useSafetyDrill` hook + Settings card.
5. Vitest coverage.
6. Live drill on the sandbox, capture output.
7. Append results to `hardening-baseline.md`, update memory, mark roadmap row.

## Definition of Done

- Drill button on `/admin/settings` returns `passed` with non-zero baseline counts for all 3 tables and `integrity.status = 'ok'`.
- `restore-backup` logs no `Memory limit exceeded` for the drill payload, nor for a synthetic 50 000-row table file.
- `docs/safety/phase1/hardening-baseline.md` "Next" line is replaced with a dated "Drill verified" entry linking to the new runbook.
- Vitest suite green; no PMS test regressions.
