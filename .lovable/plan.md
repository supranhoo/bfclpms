## Root cause — found it

`workflow_config` is **empty** (0 rows; the table's last autovacuum is at `2026-05-19 19:22:34 UTC`, one second after the bulk `kpis` rewrite at `19:21:35`).

With `workflow_config` empty, **every** employee's workflow falls back to the default template `self_l1_l2_hr_pms`:

```
kra_set → self_review → manager_check → skip_level_check → hr_pms_review → approved
```

That is exactly why Ankit — and everyone else — now appears to have a Skip-Level stage they didn't have yesterday. Their per-employee / per-department / per-grade overrides in `workflow_config` were wiped.

### What actually happened (timeline, May 19 UTC)

| Time | Event | Source of evidence |
|---|---|---|
| 19:21:35 | 6 026 `kpis` rows rewritten in one transaction | `kpis.updated_at` distribution |
| 19:22:00 | 3 292 `review_submissions` rows rewritten | `review_submissions.updated_at` |
| 19:22:34 | `workflow_config` autovacuumed → 0 live rows | `pg_stat_user_tables` |
| 19:27:19 | `backup_logs` entry: **`uploaded`** restore (`uploads/restore-1779218798446.json`, 106 MB) | `backup_logs` row |

An admin ran a **Restore-from-Uploaded-Backup** at ~19:21 UTC. That uploaded JSON either did not contain `workflow_config` or contained an empty version, so the restore wiped it. The `kpis` / `review_submissions` mass-rewrites in the same minute came from the same restore. Confirmed migrations from the past 13 h did NOT touch workflow data.

### What's recoverable
- **The default template (`self_l1_l2_hr_pms`)** is still in `workflow_templates` — it was never deleted. Good.
- **The per-employee overrides** are gone from the live DB and gone from the visible `backup_logs` history (only the post-wipe restore backup remains). They are *not* recoverable from app-level backups.
- They ARE recoverable from **Lovable Cloud point-in-time recovery (PITR)** — yesterday's snapshot before 19:21:35 UTC still holds the full `workflow_config` table.

---

## Reversal plan — restore yesterday's `workflow_config`

This is a data-only, scoped restore — no schema or code changes needed.

### Step 1 — Recover the snapshot
Two paths, in order of preference:

**Path A (recommended): PITR-scoped table extraction.** Use the Lovable Cloud point-in-time backup at `2026-05-19 19:00 UTC` (~21 min before the wipe). From it, pull a CSV/SQL dump of exactly two tables: `public.workflow_config` and `public.workflow_templates` (templates as a safety mirror). Nothing else.

**Path B (fallback): user-side export.** Ask the admin if anyone has a recent `workflow_config` CSV/JSON export from the Admin → Workflow Configuration screen before yesterday. If yes, that file feeds Step 2 directly.

### Step 2 — Re-insert the rows
Insert the recovered `workflow_config` rows back via the standard insert path. **Critical guardrails before insert:**

1. Temporarily disable the two triggers on `workflow_config` so re-inserting overrides does NOT re-trigger another global `kpis` cascade:
   - `trg_workflow_change_step_back`
   - `trg_repercolate_on_workflow_config_change`
2. Bulk `INSERT … ON CONFLICT DO UPDATE` into `workflow_config` (the unique keys `workflow_config_global_unique` and `workflow_config_period_unique` keep it idempotent).
3. Re-enable both triggers.
4. Run `reconcile_workflow_statuses()` **scoped to April 2026 only** (the one in-flight cycle). This will:
   - leave `approved` rows alone (it skips them),
   - re-align any non-approved KPI whose status doesn't fit its newly-restored template (e.g. an employee whose restored workflow has no Skip-Level shouldn't show "awaiting skip-level").

### Step 3 — Verify
- `SELECT count(*) FROM workflow_config;` matches yesterday's expected count.
- Spot-check 3–5 employees including **Ankit (`535d9a14-e4aa-4676-af92-f535373ffc8d`)**: the resolved workflow on their dashboard should match what they had yesterday (no Skip-Level if that's correct for them).
- Confirm `kpis` row count is unchanged (no cascades fired).

### Step 4 — Preventive guardrails (optional, recommended)
- Add a confirm-step + size diff preview on the **Restore-from-Uploaded-Backup** screen so an upload that would empty `workflow_config` (or any table) requires explicit "I understand 0 rows will replace N rows" acknowledgement.
- Mirror `workflow_config` and `workflow_templates` writes into `template_change_logs` (table exists, currently has no entries for this event).

---

## What I need from you to proceed
1. **Confirm path** — A (PITR extraction by Lovable Cloud) or B (you upload a pre-19:21 export of `workflow_config`).
2. **Approval** to disable/re-enable the two `workflow_config` triggers around the re-insert (zero risk; they fire on every insert/update normally).
3. **Approval** to run `reconcile_workflow_statuses()` scoped to `review_period='April', review_year=2026` after the restore.

Once you confirm, I'll implement Steps 2–3 in a single migration + insert sequence.