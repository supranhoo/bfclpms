
-- ============================================================
-- Phase 3-A: Training & SOP — schema, RLS, RPCs, realtime
-- ============================================================

-- 1. Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.safety_training_status AS ENUM (
    'pending','in_progress','passed','failed','overdue'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. SOPs ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.safety_sops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  version int NOT NULL DEFAULT 1,
  category text NULL,
  body_md text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_read_seconds int NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  published_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);
CREATE INDEX IF NOT EXISTS safety_sops_active_idx ON public.safety_sops(is_active);
CREATE INDEX IF NOT EXISTS safety_sops_code_idx   ON public.safety_sops(code);
ALTER TABLE public.safety_sops REPLICA IDENTITY FULL;

-- 3. Quizzes ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.safety_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id uuid NOT NULL REFERENCES public.safety_sops(id) ON DELETE CASCADE,
  pass_threshold int NOT NULL DEFAULT 80 CHECK (pass_threshold BETWEEN 1 AND 100),
  time_limit_seconds int NULL,
  max_attempts int NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  randomize boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sop_id)
);
CREATE INDEX IF NOT EXISTS safety_quizzes_sop_idx ON public.safety_quizzes(sop_id);

-- 4. Quiz questions -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.safety_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.safety_quizzes(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  options jsonb NOT NULL,           -- ["opt A","opt B",...]
  correct_index int NOT NULL CHECK (correct_index >= 0),
  weight numeric(6,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safety_quiz_questions_quiz_idx
  ON public.safety_quiz_questions(quiz_id);

-- 5. Assignments --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.safety_training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sop_id uuid NOT NULL REFERENCES public.safety_sops(id) ON DELETE CASCADE,
  assigned_by uuid NULL,
  business_unit_id uuid NULL,
  due_at timestamptz NULL,
  status public.safety_training_status NOT NULL DEFAULT 'pending',
  attempts_count int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sop_id)
);
CREATE INDEX IF NOT EXISTS safety_training_assignments_user_idx
  ON public.safety_training_assignments(user_id);
CREATE INDEX IF NOT EXISTS safety_training_assignments_sop_idx
  ON public.safety_training_assignments(sop_id);
CREATE INDEX IF NOT EXISTS safety_training_assignments_status_idx
  ON public.safety_training_assignments(status);
ALTER TABLE public.safety_training_assignments REPLICA IDENTITY FULL;

-- 6. Attempts -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.safety_training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.safety_training_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  reading_seconds int NOT NULL DEFAULT 0,
  question_order jsonb NOT NULL DEFAULT '[]'::jsonb,  -- shuffled question ids
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,         -- {question_id: index}
  score numeric(6,2) NULL,
  passed boolean NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safety_training_attempts_assignment_idx
  ON public.safety_training_attempts(assignment_id);
CREATE INDEX IF NOT EXISTS safety_training_attempts_user_idx
  ON public.safety_training_attempts(user_id);
ALTER TABLE public.safety_training_attempts REPLICA IDENTITY FULL;

-- 7. updated_at triggers (reuse helper used elsewhere) ------------------
DO $$ BEGIN
  PERFORM 1 FROM pg_proc WHERE proname = 'set_updated_at_safety';
  IF NOT FOUND THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at_safety()
    RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_sops_updated_at ON public.safety_sops;
CREATE TRIGGER trg_sops_updated_at BEFORE UPDATE ON public.safety_sops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_safety();

DROP TRIGGER IF EXISTS trg_quizzes_updated_at ON public.safety_quizzes;
CREATE TRIGGER trg_quizzes_updated_at BEFORE UPDATE ON public.safety_quizzes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_safety();

DROP TRIGGER IF EXISTS trg_assignments_updated_at ON public.safety_training_assignments;
CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON public.safety_training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_safety();

-- 8. FSM trigger: block direct status writes on assignments -------------
CREATE OR REPLACE FUNCTION public.safety_training_block_status_writes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('safety.training_fsm', true), '') <> 'true' THEN
    RAISE EXCEPTION 'Direct status update blocked. Use training RPCs.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_block_status ON public.safety_training_assignments;
CREATE TRIGGER trg_training_block_status
  BEFORE UPDATE ON public.safety_training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.safety_training_block_status_writes();

-- 9. Enable RLS ---------------------------------------------------------
ALTER TABLE public.safety_sops                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_quizzes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_quiz_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_training_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_training_attempts     ENABLE ROW LEVEL SECURITY;

-- 10. Policies — SOPs ---------------------------------------------------
DROP POLICY IF EXISTS "sops admin full" ON public.safety_sops;
CREATE POLICY "sops admin full" ON public.safety_sops FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL))
  WITH CHECK (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL));

DROP POLICY IF EXISTS "sops read for safety users" ON public.safety_sops;
CREATE POLICY "sops read for safety users" ON public.safety_sops FOR SELECT TO authenticated
  USING (is_active = true AND public.has_any_safety_role(auth.uid()));

-- 11. Policies — Quizzes / questions -----------------------------------
DROP POLICY IF EXISTS "quizzes admin full" ON public.safety_quizzes;
CREATE POLICY "quizzes admin full" ON public.safety_quizzes FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL))
  WITH CHECK (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL));

DROP POLICY IF EXISTS "quizzes read for safety users" ON public.safety_quizzes;
CREATE POLICY "quizzes read for safety users" ON public.safety_quizzes FOR SELECT TO authenticated
  USING (is_active = true AND public.has_any_safety_role(auth.uid()));

DROP POLICY IF EXISTS "questions admin full" ON public.safety_quiz_questions;
CREATE POLICY "questions admin full" ON public.safety_quiz_questions FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL))
  WITH CHECK (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL));

-- Workers must NOT be able to read questions directly (would expose answers).
-- Reading happens server-side via start_attempt RPC.

-- 12. Policies — Assignments -------------------------------------------
DROP POLICY IF EXISTS "assignments admin full" ON public.safety_training_assignments;
CREATE POLICY "assignments admin full" ON public.safety_training_assignments FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL))
  WITH CHECK (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL));

DROP POLICY IF EXISTS "assignments read self" ON public.safety_training_assignments;
CREATE POLICY "assignments read self" ON public.safety_training_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_safety_role(auth.uid(),'auditor',NULL)
    OR public.has_safety_role(auth.uid(),'manager', business_unit_id)
    OR public.has_safety_role(auth.uid(),'bu_head', business_unit_id)
    OR public.has_safety_role(auth.uid(),'supervisor', business_unit_id)
  );

-- 13. Policies — Attempts ----------------------------------------------
DROP POLICY IF EXISTS "attempts admin full" ON public.safety_training_attempts;
CREATE POLICY "attempts admin full" ON public.safety_training_attempts FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL))
  WITH CHECK (public.has_safety_role(auth.uid(),'admin',NULL)
      OR public.has_safety_role(auth.uid(),'safety_head',NULL)
      OR public.has_safety_role(auth.uid(),'safety_officer',NULL));

DROP POLICY IF EXISTS "attempts read self" ON public.safety_training_attempts;
CREATE POLICY "attempts read self" ON public.safety_training_attempts FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_safety_role(auth.uid(),'auditor',NULL)
  );

-- 14. RPC: assign_sop_to_role -----------------------------------------
CREATE OR REPLACE FUNCTION public.assign_sop_to_role(
  _sop_id uuid,
  _role public.safety_app_role,
  _business_unit_id uuid DEFAULT NULL,
  _due_in_days int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_due timestamptz := now() + (COALESCE(_due_in_days,7) || ' days')::interval;
BEGIN
  IF NOT (public.has_safety_role(auth.uid(),'admin',NULL)
       OR public.has_safety_role(auth.uid(),'safety_head',NULL)
       OR public.has_safety_role(auth.uid(),'safety_officer',NULL)) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.safety_sops WHERE id = _sop_id AND is_active) THEN
    RETURN jsonb_build_object('ok',false,'error','sop_not_active');
  END IF;

  WITH targets AS (
    SELECT DISTINCT ur.user_id, ur.business_unit_id
      FROM public.safety_user_roles ur
     WHERE ur.role = _role
       AND ( _business_unit_id IS NULL
             OR ur.business_unit_id IS NULL
             OR ur.business_unit_id = _business_unit_id )
  ),
  ins AS (
    INSERT INTO public.safety_training_assignments
      (user_id, sop_id, assigned_by, business_unit_id, due_at, status)
    SELECT t.user_id, _sop_id, auth.uid(),
           COALESCE(_business_unit_id, t.business_unit_id),
           v_due, 'pending'
      FROM targets t
    ON CONFLICT (user_id, sop_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object('ok',true,'result',
    jsonb_build_object('assigned', v_inserted, 'due_at', v_due));
END;
$$;

-- 15. RPC: start_attempt ----------------------------------------------
CREATE OR REPLACE FUNCTION public.start_training_attempt(
  _assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.safety_training_assignments;
  v_quiz public.safety_quizzes;
  v_attempt_id uuid;
  v_order jsonb;
  v_questions jsonb;
BEGIN
  SELECT * INTO v_a FROM public.safety_training_assignments WHERE id = _assignment_id;
  IF v_a.id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','assignment_not_found');
  END IF;
  IF v_a.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF v_a.status IN ('passed','overdue') THEN
    RETURN jsonb_build_object('ok',false,'error',
      CASE v_a.status WHEN 'passed' THEN 'already_passed' ELSE 'overdue' END);
  END IF;

  SELECT * INTO v_quiz FROM public.safety_quizzes WHERE sop_id = v_a.sop_id AND is_active;
  IF v_quiz.id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','quiz_not_found');
  END IF;

  IF v_a.attempts_count >= v_quiz.max_attempts THEN
    RETURN jsonb_build_object('ok',false,'error','max_attempts_reached');
  END IF;

  -- Build randomised question order
  IF v_quiz.randomize THEN
    SELECT jsonb_agg(id ORDER BY random())
      INTO v_order
      FROM public.safety_quiz_questions
     WHERE quiz_id = v_quiz.id;
  ELSE
    SELECT jsonb_agg(id ORDER BY sort_order, id)
      INTO v_order
      FROM public.safety_quiz_questions
     WHERE quiz_id = v_quiz.id;
  END IF;

  IF v_order IS NULL OR jsonb_array_length(v_order) = 0 THEN
    RETURN jsonb_build_object('ok',false,'error','no_questions');
  END IF;

  -- Return questions WITHOUT correct_index
  SELECT jsonb_agg(jsonb_build_object(
           'id', q.id,
           'prompt', q.prompt,
           'options', q.options,
           'weight', q.weight
         ) ORDER BY ord.idx)
    INTO v_questions
    FROM jsonb_array_elements_text(v_order) WITH ORDINALITY ord(qid, idx)
    JOIN public.safety_quiz_questions q ON q.id = ord.qid::uuid;

  INSERT INTO public.safety_training_attempts
    (assignment_id, user_id, question_order)
  VALUES (_assignment_id, auth.uid(), v_order)
  RETURNING id INTO v_attempt_id;

  -- Move to in_progress (FSM-guarded)
  PERFORM set_config('safety.training_fsm','true', true);
  UPDATE public.safety_training_assignments
     SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
         attempts_count = attempts_count + 1,
         last_attempt_at = now()
   WHERE id = _assignment_id;
  PERFORM set_config('safety.training_fsm','false', true);

  RETURN jsonb_build_object('ok',true,'result', jsonb_build_object(
    'attempt_id', v_attempt_id,
    'quiz', jsonb_build_object(
      'pass_threshold', v_quiz.pass_threshold,
      'time_limit_seconds', v_quiz.time_limit_seconds,
      'max_attempts', v_quiz.max_attempts,
      'attempts_used', v_a.attempts_count + 1
    ),
    'questions', v_questions
  ));
END;
$$;

-- 16. RPC: submit_attempt ---------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_training_attempt(
  _attempt_id uuid,
  _answers jsonb,           -- { "<question_id>": <chosen_index> }
  _reading_seconds int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.safety_training_attempts;
  v_assignment public.safety_training_assignments;
  v_quiz public.safety_quizzes;
  v_sop public.safety_sops;
  v_total_weight numeric := 0;
  v_earned numeric := 0;
  v_score numeric;
  v_passed boolean;
  v_q record;
  v_chosen int;
BEGIN
  SELECT * INTO v_attempt FROM public.safety_training_attempts WHERE id = _attempt_id;
  IF v_attempt.id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','attempt_not_found');
  END IF;
  IF v_attempt.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF v_attempt.finished_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','already_submitted');
  END IF;

  SELECT * INTO v_assignment FROM public.safety_training_assignments WHERE id = v_attempt.assignment_id;
  SELECT * INTO v_sop  FROM public.safety_sops    WHERE id = v_assignment.sop_id;
  SELECT * INTO v_quiz FROM public.safety_quizzes WHERE sop_id = v_assignment.sop_id;

  -- Enforce min read time
  IF COALESCE(_reading_seconds,0) < COALESCE(v_sop.min_read_seconds,0) THEN
    RETURN jsonb_build_object('ok',false,'error','min_read_seconds_not_met',
      'required', v_sop.min_read_seconds);
  END IF;

  -- Score on the server using stored question_order
  FOR v_q IN
    SELECT q.id, q.correct_index, q.weight
      FROM jsonb_array_elements_text(v_attempt.question_order) ord(qid)
      JOIN public.safety_quiz_questions q ON q.id = ord.qid::uuid
  LOOP
    v_total_weight := v_total_weight + v_q.weight;
    v_chosen := NULLIF(_answers ->> v_q.id::text, '')::int;
    IF v_chosen IS NOT NULL AND v_chosen = v_q.correct_index THEN
      v_earned := v_earned + v_q.weight;
    END IF;
  END LOOP;

  IF v_total_weight = 0 THEN
    RETURN jsonb_build_object('ok',false,'error','no_questions');
  END IF;

  v_score  := round((v_earned / v_total_weight) * 100, 2);
  v_passed := v_score >= v_quiz.pass_threshold;

  UPDATE public.safety_training_attempts
     SET answers = _answers,
         reading_seconds = _reading_seconds,
         finished_at = now(),
         score = v_score,
         passed = v_passed
   WHERE id = _attempt_id;

  PERFORM set_config('safety.training_fsm','true', true);
  UPDATE public.safety_training_assignments
     SET status = CASE
                    WHEN v_passed THEN 'passed'::public.safety_training_status
                    WHEN attempts_count >= v_quiz.max_attempts THEN 'failed'::public.safety_training_status
                    ELSE 'in_progress'::public.safety_training_status
                  END,
         completed_at = CASE WHEN v_passed THEN now() ELSE completed_at END
   WHERE id = v_assignment.id;
  PERFORM set_config('safety.training_fsm','false', true);

  RETURN jsonb_build_object('ok',true,'result', jsonb_build_object(
    'score', v_score,
    'passed', v_passed,
    'pass_threshold', v_quiz.pass_threshold
  ));
END;
$$;

-- 17. RPC: mark overdue (cron-callable) -------------------------------
CREATE OR REPLACE FUNCTION public.mark_overdue_training_assignments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  PERFORM set_config('safety.training_fsm','true', true);
  WITH upd AS (
    UPDATE public.safety_training_assignments
       SET status = 'overdue'
     WHERE status IN ('pending','in_progress')
       AND due_at IS NOT NULL
       AND due_at < now()
    RETURNING 1
  ) SELECT count(*) INTO v_n FROM upd;
  PERFORM set_config('safety.training_fsm','false', true);
  RETURN jsonb_build_object('ok',true,'result', jsonb_build_object('overdue', v_n));
END;
$$;

-- 18. Realtime publication --------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_training_assignments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_training_attempts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
