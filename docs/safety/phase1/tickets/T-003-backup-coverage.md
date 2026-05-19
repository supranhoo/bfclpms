# T-003 — Add Safety to backup engine

**Severity:** High (rollback integrity)  
**Phase:** 1.5 (blocks Phase 2 sign-off)

## Problem

`supabase/functions/create-backup/index.ts` lists 81 tables; none are
`safety_*`. Restoring today recovers PMS data only.

## Fix

See `docs/safety/phase1/backup-coverage.md` for the per-tier insertion
order. Also:

- Add `safety_notifications` to `PRUNE_TABLES` (`created_at`, 90 days).
- Add Safety evidence storage bucket(s) to `STORAGE_BUCKETS` after
  confirming exact bucket names.
- Update `restore-backup` to honor the new dependency order.
- Drill: backup → restore into sandbox → verify rows from
  `safety_incidents`, `safety_permits`, `safety_audit_runs`.

## Rollback

Remove the new tables from `TABLES_TO_BACKUP` (backward-compatible).
