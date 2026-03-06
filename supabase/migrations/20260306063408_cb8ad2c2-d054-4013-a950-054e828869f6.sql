
-- ============================================================
-- Phase 1: Advanced Review Period Governance System Schema
-- ============================================================

-- 1. Add governance columns to existing review_periods table
ALTER TABLE public.review_periods
  ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'planning',
  ADD COLUMN IF NOT EXISTS stage_started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completion_percentage numeric NOT NULL DEFAULT 0;

-- 2. Create review_period_stages table (lifecycle history)
CREATE TABLE public.review_period_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_id uuid NOT NULL REFERENCES public.review_periods(id) ON DELETE CASCADE,
  stage text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  started_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_period_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stages"
  ON public.review_period_stages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert stages"
  ON public.review_period_stages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update stages"
  ON public.review_period_stages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Create review_period_locks table (multi-layer locking)
CREATE TABLE public.review_period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_id uuid NOT NULL REFERENCES public.review_periods(id) ON DELETE CASCADE,
  lock_type text NOT NULL CHECK (lock_type IN ('global', 'role', 'department', 'employee')),
  target_id text,
  permissions jsonb NOT NULL DEFAULT '{
    "edit_kpi": true,
    "submit_self_review": true,
    "submit_manager_review": true,
    "approve": true,
    "edit_scores": true,
    "add_comments": true,
    "view_only": false
  }'::jsonb,
  is_locked boolean NOT NULL DEFAULT true,
  locked_by uuid REFERENCES auth.users(id),
  locked_at timestamptz DEFAULT now(),
  unlock_reason text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_period_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view locks"
  ON public.review_period_locks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert locks"
  ON public.review_period_locks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update locks"
  ON public.review_period_locks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete locks"
  ON public.review_period_locks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Unique constraint: one lock per type+target per period
CREATE UNIQUE INDEX review_period_locks_unique_target
  ON public.review_period_locks (review_period_id, lock_type, COALESCE(target_id, '__global__'));

-- 4. Create review_period_auto_rules table
CREATE TABLE public.review_period_auto_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_id uuid NOT NULL REFERENCES public.review_periods(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('deadline_passed', 'review_submitted', 'approval_complete', 'calibration_complete')),
  trigger_condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_period_auto_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view auto rules"
  ON public.review_period_auto_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage auto rules"
  ON public.review_period_auto_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Create review_period_audit_log table
CREATE TABLE public.review_period_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_id uuid NOT NULL REFERENCES public.review_periods(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users(id),
  previous_state jsonb,
  new_state jsonb,
  reason text,
  target_type text,
  target_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_period_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit log"
  ON public.review_period_audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert audit log"
  ON public.review_period_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Create check_review_period_permission function
-- Evaluates lock hierarchy: Employee > Department > Role > Global
CREATE OR REPLACE FUNCTION public.check_review_period_permission(
  p_user_id uuid,
  p_period_name text,
  p_review_year integer,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
  v_current_stage text;
  v_lock_record RECORD;
  v_permission_value boolean;
  v_user_dept_id uuid;
  v_user_roles text[];
BEGIN
  -- Get period info
  SELECT id, current_stage INTO v_period_id, v_current_stage
  FROM review_periods
  WHERE period_name = p_period_name AND review_year = p_review_year;

  IF v_period_id IS NULL THEN
    -- No period record exists, default to open
    RETURN true;
  END IF;

  -- If period is in 'closed' stage, only view_only is allowed
  IF v_current_stage = 'closed' AND p_action != 'view_only' THEN
    RETURN false;
  END IF;

  -- Get user info
  SELECT department_id INTO v_user_dept_id
  FROM profiles WHERE id = p_user_id;

  SELECT array_agg(role::text) INTO v_user_roles
  FROM user_roles WHERE user_id = p_user_id;

  -- Admins always have full access
  IF 'admin' = ANY(COALESCE(v_user_roles, ARRAY[]::text[])) THEN
    RETURN true;
  END IF;

  -- Priority 1: Check employee-specific lock (most specific)
  SELECT * INTO v_lock_record
  FROM review_period_locks
  WHERE review_period_id = v_period_id
    AND lock_type = 'employee'
    AND target_id = p_user_id::text
  LIMIT 1;

  IF v_lock_record IS NOT NULL THEN
    v_permission_value := COALESCE((v_lock_record.permissions->>p_action)::boolean, true);
    IF v_lock_record.is_locked THEN
      RETURN v_permission_value;
    ELSE
      RETURN true; -- Explicitly unlocked employee overrides everything
    END IF;
  END IF;

  -- Priority 2: Check department lock
  IF v_user_dept_id IS NOT NULL THEN
    SELECT * INTO v_lock_record
    FROM review_period_locks
    WHERE review_period_id = v_period_id
      AND lock_type = 'department'
      AND target_id = v_user_dept_id::text
    LIMIT 1;

    IF v_lock_record IS NOT NULL AND v_lock_record.is_locked THEN
      v_permission_value := COALESCE((v_lock_record.permissions->>p_action)::boolean, true);
      RETURN v_permission_value;
    END IF;
  END IF;

  -- Priority 3: Check role locks (check all user roles, most restrictive wins)
  IF v_user_roles IS NOT NULL THEN
    FOR v_lock_record IN
      SELECT * FROM review_period_locks
      WHERE review_period_id = v_period_id
        AND lock_type = 'role'
        AND target_id = ANY(v_user_roles)
        AND is_locked = true
      ORDER BY locked_at ASC
    LOOP
      v_permission_value := COALESCE((v_lock_record.permissions->>p_action)::boolean, true);
      IF NOT v_permission_value THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  -- Priority 4: Check global lock
  SELECT * INTO v_lock_record
  FROM review_period_locks
  WHERE review_period_id = v_period_id
    AND lock_type = 'global'
    AND is_locked = true
  LIMIT 1;

  IF v_lock_record IS NOT NULL THEN
    v_permission_value := COALESCE((v_lock_record.permissions->>p_action)::boolean, true);
    RETURN v_permission_value;
  END IF;

  -- Default: permission granted
  RETURN true;
END;
$$;
