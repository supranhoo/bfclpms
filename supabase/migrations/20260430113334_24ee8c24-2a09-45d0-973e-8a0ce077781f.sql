
-- ============================================================
-- HR Review Notes & Action Tracker
-- ============================================================

-- 1. Table
CREATE TABLE public.review_action_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kpi_id uuid REFERENCES public.kpis(id) ON DELETE SET NULL,
  period_id uuid REFERENCES public.review_periods(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('kpi_change','weightage_change','target_change','new_kpi','remove_kpi','role_realignment','training_need','other')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  details text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high')),
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_period_id uuid REFERENCES public.review_periods(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id)
);

CREATE INDEX idx_ran_subject ON public.review_action_notes(subject_employee_id);
CREATE INDEX idx_ran_status ON public.review_action_notes(status);
CREATE INDEX idx_ran_period ON public.review_action_notes(period_id);
CREATE INDEX idx_ran_assignee ON public.review_action_notes(assignee_id);
CREATE INDEX idx_ran_created_by ON public.review_action_notes(created_by);

-- 2. updated_at trigger (reuse existing function)
CREATE TRIGGER trg_ran_updated_at
BEFORE UPDATE ON public.review_action_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. completed_at auto-stamp trigger
CREATE OR REPLACE FUNCTION public.review_action_notes_stamp_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ran_stamp_completion
BEFORE UPDATE ON public.review_action_notes
FOR EACH ROW EXECUTE FUNCTION public.review_action_notes_stamp_completion();

-- 4. Insert default visibility setting (only if missing)
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'review_action_notes_visibility',
  '{"view":["admin","hr_pms","manager","skip_level","management","auditor"],"create":["admin","hr_pms","manager","skip_level"],"edit":["admin","hr_pms"],"delete":["admin","hr_pms"],"view_own_subject":["employee"]}'::jsonb,
  'Per-role access matrix for the HR Review Notes module. Admin is always implicitly included.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 5. Dynamic role-permission helper (SECURITY DEFINER, no recursion)
CREATE OR REPLACE FUNCTION public.review_note_role_can(_action text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _config jsonb;
  _allowed jsonb;
  _role text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  -- Admin always allowed (defensive default)
  IF public.has_role(_user_id, 'admin'::app_role) THEN RETURN true; END IF;

  SELECT setting_value::jsonb INTO _config
  FROM public.system_settings
  WHERE setting_key = 'review_action_notes_visibility'
  LIMIT 1;

  -- Hardcoded fallback if settings missing/corrupt: only hr_pms (admin already returned true)
  IF _config IS NULL THEN
    RETURN public.has_role(_user_id, 'hr_pms'::app_role);
  END IF;

  _allowed := _config -> _action;
  IF _allowed IS NULL OR jsonb_typeof(_allowed) <> 'array' THEN
    RETURN false;
  END IF;

  FOR _role IN SELECT jsonb_array_elements_text(_allowed)
  LOOP
    IF public.has_role(_user_id, _role::app_role) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- 6. RLS
ALTER TABLE public.review_action_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ran_select"
ON public.review_action_notes FOR SELECT
TO authenticated
USING (
  public.review_note_role_can('view', auth.uid())
  OR (public.review_note_role_can('view_own_subject', auth.uid()) AND subject_employee_id = auth.uid())
  OR created_by = auth.uid()
  OR assignee_id = auth.uid()
);

CREATE POLICY "ran_insert"
ON public.review_action_notes FOR INSERT
TO authenticated
WITH CHECK (
  public.review_note_role_can('create', auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "ran_update"
ON public.review_action_notes FOR UPDATE
TO authenticated
USING (
  public.review_note_role_can('edit', auth.uid())
  OR assignee_id = auth.uid()
)
WITH CHECK (
  public.review_note_role_can('edit', auth.uid())
  OR assignee_id = auth.uid()
);

CREATE POLICY "ran_delete"
ON public.review_action_notes FOR DELETE
TO authenticated
USING (public.review_note_role_can('delete', auth.uid()));
