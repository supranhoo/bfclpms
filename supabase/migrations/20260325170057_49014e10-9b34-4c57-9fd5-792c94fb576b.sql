
-- Drop the duplicate overload that has p_dry_run as the FIRST parameter
DROP FUNCTION IF EXISTS public.reconcile_workflow_statuses(boolean, text, integer, uuid);
