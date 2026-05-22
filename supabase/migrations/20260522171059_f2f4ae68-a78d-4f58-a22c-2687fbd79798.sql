
-- ============================================================================
-- M1: Bulk Review Dashboard — additive schema foundation (PRD v2.0)
-- Non-regression contract: no existing column/RPC/policy modified.
-- ============================================================================

-- ---------- 1. kpis.kpi_group_type ----------
ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS kpi_group_type TEXT NOT NULL DEFAULT 'individual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kpis_kpi_group_type_check'
  ) THEN
    ALTER TABLE public.kpis
      ADD CONSTRAINT kpis_kpi_group_type_check
      CHECK (kpi_group_type IN ('individual','departmental','org'));
  END IF;
END $$;

-- ---------- 2. review_submissions additive columns ----------
ALTER TABLE public.review_submissions
  ADD COLUMN IF NOT EXISTS is_group_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_write_batch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS is_auditor_override_of_hr BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skipped_by_management JSONB NULL,
  ADD COLUMN IF NOT EXISTS final_revision_no INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

-- ---------- 3. admin_feature_flags ----------
CREATE TABLE IF NOT EXISTS public.admin_feature_flags (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  description TEXT,
  updated_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_read_authenticated" ON public.admin_feature_flags;
CREATE POLICY "feature_flags_read_authenticated"
  ON public.admin_feature_flags FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "feature_flags_admin_write" ON public.admin_feature_flags;
CREATE POLICY "feature_flags_admin_write"
  ON public.admin_feature_flags FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed the two flags this PRD introduces (idempotent)
INSERT INTO public.admin_feature_flags (key, value, description)
VALUES
  ('feature_bulk_review_dashboard', 'false'::jsonb,
   'Master switch for the Bulk Review Dashboard (PRD v2.0). OFF = legacy flows only.'),
  ('mgmt_can_reopen', 'false'::jsonb,
   'When true, Management users can re-open approved scores. Default: admin-granted only.')
ON CONFLICT (key) DO NOTHING;

-- Helper used by all bulk_* RPCs to short-circuit when the master flag is off
CREATE OR REPLACE FUNCTION public.is_bulk_review_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value)::text::boolean
       FROM public.admin_feature_flags
      WHERE key = 'feature_bulk_review_dashboard'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mgmt_reopen_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value)::text::boolean
       FROM public.admin_feature_flags
      WHERE key = 'mgmt_can_reopen'),
    false
  );
$$;

-- ---------- 4. bulk_review_batches ----------
CREATE TABLE IF NOT EXISTS public.bulk_review_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NULL,
  stage TEXT NOT NULL,
  scope_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_count INTEGER NOT NULL DEFAULT 0,
  skipped JSONB NOT NULL DEFAULT '[]'::jsonb,
  batch_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_review_batches_performed_by
  ON public.bulk_review_batches(performed_by);
CREATE INDEX IF NOT EXISTS idx_bulk_review_batches_created_at
  ON public.bulk_review_batches(created_at DESC);

ALTER TABLE public.bulk_review_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bulk_batches_admin_read" ON public.bulk_review_batches;
CREATE POLICY "bulk_batches_admin_read"
  ON public.bulk_review_batches FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "bulk_batches_self_read" ON public.bulk_review_batches;
CREATE POLICY "bulk_batches_self_read"
  ON public.bulk_review_batches FOR SELECT
  TO authenticated
  USING (performed_by = auth.uid());

-- No INSERT/UPDATE/DELETE policy — writes go exclusively through SECURITY DEFINER RPCs.

-- ---------- 5. final_score_revisions ----------
CREATE TABLE IF NOT EXISTS public.final_score_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.review_submissions(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  prev_final_score NUMERIC NULL,
  new_final_score NUMERIC NULL,
  reason TEXT NOT NULL,
  reopened_stages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  performed_by UUID NULL,
  batch_id UUID NULL REFERENCES public.bulk_review_batches(id) ON DELETE SET NULL,
  auto_reverted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_final_score_revisions_submission
  ON public.final_score_revisions(submission_id);
CREATE INDEX IF NOT EXISTS idx_final_score_revisions_batch
  ON public.final_score_revisions(batch_id);
CREATE INDEX IF NOT EXISTS idx_final_score_revisions_performed_by
  ON public.final_score_revisions(performed_by);

ALTER TABLE public.final_score_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revisions_admin_read" ON public.final_score_revisions;
CREATE POLICY "revisions_admin_read"
  ON public.final_score_revisions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "revisions_management_read" ON public.final_score_revisions;
CREATE POLICY "revisions_management_read"
  ON public.final_score_revisions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS "revisions_self_read" ON public.final_score_revisions;
CREATE POLICY "revisions_self_read"
  ON public.final_score_revisions FOR SELECT
  TO authenticated
  USING (performed_by = auth.uid());

-- No write policies — writes go exclusively through bulk_reopen_cells RPC (M5).
