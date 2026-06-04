## Verify Dead-Column Migration — Result: **NO-GO (already dropped)**

### Evidence table (re-snapshotted just now against live DB)

| Check | Source | Result |
|---|---|---|
| Live columns on `public.safety_settings` | `information_schema.columns` | 5 columns: `key, value, description, updated_at, updated_by` |
| `ui_incident_v2` column present | `pg_attribute attnum=6` | **`attisdropped = true`** — already dropped |
| `incident_stage_copy` column present | `pg_attribute attnum=7` | **`attisdropped = true`** — already dropped |
| Row count | `safety_settings` | 13 rows (unchanged) |
| Runtime config keys present | `SELECT … WHERE key IN (…)` | Both rows present with correct values (`ui_incident_v2=true`, `incident_stage_copy` = full stage-copy JSON) |
| Code readers of the **columns** | `rg ui_incident_v2\|incident_stage_copy` across `src/`, `supabase/`, tests | **0 readers** (all matches are doc/memory/migration text or row-key lookups) |
| SQL dependents (views/functions/triggers/policies) | `pg_attribute` shows dropped slots cleanly; no live deps | None |
| Menu CAPA invariants (admin sidebar non-empty, auditor pages, legacy baseline access while `menu_overrides_enabled` toggles) | Unrelated surface; this work-package touches zero menu code/data | Green (no change vector) |

### Dry-run / precondition simulation

Staged migration `supabase/migrations/20260604124417_…sql` runs:

```sql
SELECT count(*) … WHERE ui_incident_v2 IS DISTINCT FROM false;
```

Against the **current** schema this throws:

```
ERROR  42703: column "ui_incident_v2" does not exist
```

So the in-transaction precondition guard would fire — exactly as designed for schema drift — and **abort before any DROP**. The drop has, in fact, already happened in an earlier session (attnums 6/7 are tombstoned in `pg_attribute`). The staged migration is now a duplicate that would error loudly on apply.

### Go / No-Go recommendation

**NO-GO on applying `20260604124417_…sql`.** The destructive action is already complete; re-running it adds no value and would error.

Two follow-on cleanups required to keep SSOT honest — both are non-destructive doc/file edits, no DB change:

1. Delete the staged forward migration `supabase/migrations/20260604124417_10129351-58a4-4839-b793-c997fb3d64af.sql` (it would only ever error).
2. Correct `CHANGELOG_2026.md` line 8, `docs/safety/phase8-release-readiness.md` row 55, and `mem/features/safety/phase8-stabilization.md` to state: *"Drop verified complete in a prior session (pg_attribute attnums 6 & 7 tombstoned). Today's session re-snapshotted and confirmed — no new migration applied."*
3. **Keep** `docs/safety/phase8-dead-column-rollback.sql` as-is — committed, not auto-applied, valid recovery path if a regression ever requires restoring the column shape.

### Rollback readiness

- Rollback script present at `docs/safety/phase8-dead-column-rollback.sql`.
- Re-adds both columns as nullable with original defaults (`false`, `'{}'::jsonb`).
- Manual `supabase--migration` apply only; not wired to any automation.
- Verified syntactically against current schema — `ADD COLUMN IF NOT EXISTS` is safe.

### Guardrails honored

- No new code, no runtime features, no new routes.
- No Menu Setting / Custom Tabs changes.
- `menu_overrides_enabled` untouched.
- No PMS workflow/scoring/RLS/enforcement changes.
- Release-readiness page remains deferred.
- No destructive migration applied or proposed for apply.

### Awaiting explicit approval to switch to build mode for

The three doc-only cleanups above (delete the duplicate forward migration file + correct three doc/memory lines). Until you approve, nothing is changed.
