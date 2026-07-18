-- ADR-109 v2: enforce BU Head terminal stage as a DB invariant on annual_review_instances

CREATE OR REPLACE FUNCTION public.enforce_bu_head_terminal_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_bu_head boolean;
  v_new_stages jsonb;
BEGIN
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.business_units bu WHERE bu.head_user_id = NEW.employee_id
  ) INTO v_is_bu_head;

  IF NOT v_is_bu_head THEN
    RETURN NEW;
  END IF;

  -- Strip 'dept_head' from enabled_stages (jsonb array of text)
  IF NEW.enabled_stages IS NOT NULL AND jsonb_typeof(NEW.enabled_stages) = 'array' THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO v_new_stages
    FROM jsonb_array_elements(NEW.enabled_stages) AS elem
    WHERE elem <> to_jsonb('dept_head'::text);
    NEW.enabled_stages := v_new_stages;
  END IF;

  -- Never carry a dept head for a BU head
  NEW.dept_head_id := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bu_head_terminal_stage ON public.annual_review_instances;
CREATE TRIGGER trg_enforce_bu_head_terminal_stage
  BEFORE INSERT OR UPDATE OF enabled_stages, dept_head_id, employee_id
  ON public.annual_review_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_bu_head_terminal_stage();

-- Audit + repair the currently drifted BU-Head instances
WITH targets AS (
  SELECT ari.id, ari.cycle_id, ari.employee_id, ari.enabled_stages AS old_stages,
         ari.dept_head_id AS old_dept_head_id, ari.overall_status
  FROM public.annual_review_instances ari
  WHERE ari.enabled_stages ? 'dept_head'
    AND EXISTS (SELECT 1 FROM public.business_units bu WHERE bu.head_user_id = ari.employee_id)
),
stripped AS (
  SELECT t.id, t.cycle_id, t.employee_id, t.old_stages, t.old_dept_head_id, t.overall_status,
         COALESCE((
           SELECT jsonb_agg(elem)
           FROM jsonb_array_elements(t.old_stages) elem
           WHERE elem <> to_jsonb('dept_head'::text)
         ), '[]'::jsonb) AS new_stages
  FROM targets t
),
audited AS (
  INSERT INTO public.annual_review_bu_head_terminal_audit_2026_07
    (instance_id, cycle_id, employee_id, old_enabled_stages, new_enabled_stages,
     old_dept_head_id, old_overall_status, new_overall_status, reason, source, performed_by)
  SELECT id, cycle_id, employee_id, old_stages, new_stages,
         old_dept_head_id, overall_status, overall_status,
         'ADR-109 v2 invariant backfill: BU Heads must not route to Dept Head',
         'migration:20260718_ar_bu_head_terminal_invariant',
         NULL
  FROM stripped
  RETURNING instance_id
)
UPDATE public.annual_review_instances ari
SET enabled_stages = s.new_stages,
    dept_head_id   = NULL,
    updated_at     = now()
FROM stripped s
WHERE ari.id = s.id;
