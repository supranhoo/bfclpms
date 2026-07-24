
-- ADR-155c: Preventive trigger — strip dept_head from enabled_stages when dept_head_id is NULL
CREATE OR REPLACE FUNCTION public.enforce_missing_dept_head_stage_strip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_stages jsonb;
BEGIN
  IF NEW.dept_head_id IS NULL
     AND NEW.enabled_stages IS NOT NULL
     AND (NEW.enabled_stages)::jsonb ? 'dept_head' THEN
    SELECT COALESCE(jsonb_agg(el), '[]'::jsonb)
      INTO new_stages
      FROM jsonb_array_elements(NEW.enabled_stages::jsonb) el
     WHERE el <> to_jsonb('dept_head'::text);
    NEW.enabled_stages := new_stages;

    IF NEW.overall_status = 'pending_dept' THEN
      IF NEW.bu_head_id IS NOT NULL AND (new_stages ? 'bu_head') THEN
        NEW.overall_status := 'pending_bu';
      ELSIF NEW.management_id IS NOT NULL AND (new_stages ? 'management') THEN
        NEW.overall_status := 'pending_management';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_missing_dept_head_stage_strip ON public.annual_review_instances;
CREATE TRIGGER trg_enforce_missing_dept_head_stage_strip
BEFORE INSERT OR UPDATE OF dept_head_id, enabled_stages, overall_status
ON public.annual_review_instances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_missing_dept_head_stage_strip();

-- Repair the 3 affected instances
UPDATE public.annual_review_instances
   SET enabled_stages = '["self", "bu_head"]'::jsonb,
       overall_status = 'pending_bu',
       updated_at = now()
 WHERE id IN (
   'a0c10c88-6eff-4649-8eb5-9fd800634b95',
   'df576298-b9ab-4057-b74c-be7f1841eed5',
   '50f1e13a-d952-4b2c-a0ae-2d405fd4bad2'
 );

-- Audit trail
INSERT INTO public.annual_review_access_audit (action, target_user_id, actor_id, before, after, reason)
SELECT 'management_stage.backfilled',
       i.employee_id,
       NULL,
       jsonb_build_object('overall_status','pending_dept','enabled_stages', jsonb_build_array('self','dept_head','bu_head')),
       jsonb_build_object('overall_status','pending_bu','enabled_stages', jsonb_build_array('self','bu_head'), 'instance_id', i.id),
       'ADR-155c: dept_head_id NULL — stage stripped so BU Head (Biswajit Sahoo) can process'
  FROM public.annual_review_instances i
 WHERE i.id IN (
   'a0c10c88-6eff-4649-8eb5-9fd800634b95',
   'df576298-b9ab-4057-b74c-be7f1841eed5',
   '50f1e13a-d952-4b2c-a0ae-2d405fd4bad2'
 );
