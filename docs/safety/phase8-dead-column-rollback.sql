-- Rollback script for Safety Phase 8 dead-column cleanup.
--
-- Forward migration dropped:
--   public.safety_settings.ui_incident_v2      (boolean, default false)
--   public.safety_settings.incident_stage_copy (jsonb,   default '{}'::jsonb)
--
-- This script is committed for recovery only. It is NOT auto-applied.
-- Run manually via supabase--migration ONLY if a regression requires
-- restoring the legacy column shape. Both columns are re-added as
-- nullable with their prior defaults; all 13 rows were at default at
-- drop time, so this exactly reproduces the pre-drop state.

ALTER TABLE public.safety_settings
  ADD COLUMN IF NOT EXISTS ui_incident_v2 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS incident_stage_copy jsonb DEFAULT '{}'::jsonb;