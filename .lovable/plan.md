

# Add Permanent Backup Checklist Rule to Documentation

## Summary

Add a mandatory checklist item to `DOCUMENTATION.md` and `POLICY.md` that ensures every new database table is immediately added to the backup and restore edge functions.

## Changes

### 1. DOCUMENTATION.md

Add a prominent "Database Table Checklist" section (or append to the existing backup section) with a rule:

> **Mandatory**: When any new table is created via migration, the following files MUST be updated in the same change:
> - `supabase/functions/create-backup/index.ts` -- add table to `TABLES_TO_BACKUP` in correct dependency order
> - `supabase/functions/restore-backup/index.ts` -- add table to both `INSERT_ORDER` and `DELETE_ORDER` arrays (insert = parent-first, delete = leaf-first)

### 2. POLICY.md (if exists, or create a section in DOCUMENTATION.md)

Add under engineering policies:

> **Backup Coverage Policy**: No table may exist in the production schema without being included in the scheduled backup system. Any migration that creates a new table without updating the backup/restore functions is considered incomplete.

## Files Changed

| File | Change |
|------|--------|
| `DOCUMENTATION.md` | Add "New Table Backup Checklist" rule to the backup section |

## Risk Assessment

| Aspect | Risk | Notes |
|--------|------|-------|
| Data | None | Documentation-only change |
| Regression | None | No code modified |

