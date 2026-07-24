CREATE OR REPLACE FUNCTION public.annual_review_next_status(p_enabled jsonb, p_current annual_review_status)
 RETURNS annual_review_status
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chain text[];
  v_cur text;
  v_idx int;
BEGIN
  SELECT array_agg(s ORDER BY ord) INTO v_chain
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                 ('dept_head',4),('bu_head',5),('hr',6),('management',7)) AS t(s,ord)
   WHERE p_enabled ? s;

  v_cur := CASE p_current
    WHEN 'pending_self'       THEN 'self'
    WHEN 'pending_manager'    THEN 'manager'
    WHEN 'pending_skip'       THEN 'skip_manager'
    WHEN 'pending_dept'       THEN 'dept_head'
    WHEN 'pending_bu'         THEN 'bu_head'
    WHEN 'pending_hr'         THEN 'hr'
    WHEN 'pending_management' THEN 'management'
    ELSE NULL
  END;

  IF v_cur IS NULL THEN RETURN p_current; END IF;
  v_idx := array_position(v_chain, v_cur);
  IF v_idx IS NULL OR v_idx >= array_length(v_chain,1) THEN
    RETURN 'completed'::public.annual_review_status;
  END IF;

  RETURN (CASE v_chain[v_idx+1]
    WHEN 'self'         THEN 'pending_self'
    WHEN 'manager'      THEN 'pending_manager'
    WHEN 'skip_manager' THEN 'pending_skip'
    WHEN 'dept_head'    THEN 'pending_dept'
    WHEN 'bu_head'      THEN 'pending_bu'
    WHEN 'hr'           THEN 'pending_hr'
    WHEN 'management'   THEN 'pending_management'
  END)::public.annual_review_status;
END $function$;