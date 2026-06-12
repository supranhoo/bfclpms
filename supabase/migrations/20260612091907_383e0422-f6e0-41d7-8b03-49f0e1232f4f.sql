DROP FUNCTION IF EXISTS public.start_training_attempt(uuid);
DROP FUNCTION IF EXISTS public.submit_training_attempt(uuid, jsonb);
DROP FUNCTION IF EXISTS public.assign_sop_to_role(uuid, public.safety_app_role, uuid, integer);