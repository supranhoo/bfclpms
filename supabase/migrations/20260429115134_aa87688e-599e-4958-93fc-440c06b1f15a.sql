
CREATE OR REPLACE FUNCTION public.set_updated_at_safety()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.safety_training_block_status_writes()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('safety.training_fsm', true), '') <> 'true' THEN
    RAISE EXCEPTION 'Direct status update blocked. Use training RPCs.';
  END IF;
  RETURN NEW;
END;
$$;
