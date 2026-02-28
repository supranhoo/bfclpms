
-- =============================================================
-- kpi_mention_access: Grant mentioned users read-only KPI access
-- =============================================================

-- 1. Create junction table
CREATE TABLE public.kpi_mention_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kpi_mention_access_unique UNIQUE (kpi_id, user_id)
);

CREATE INDEX idx_kpi_mention_access_user ON public.kpi_mention_access(user_id);
CREATE INDEX idx_kpi_mention_access_kpi ON public.kpi_mention_access(kpi_id);

-- 2. Enable RLS
ALTER TABLE public.kpi_mention_access ENABLE ROW LEVEL SECURITY;

-- 3. RLS on kpi_mention_access itself
CREATE POLICY "Users can view their own mention access grants"
  ON public.kpi_mention_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can insert mention access grants"
  ON public.kpi_mention_access FOR INSERT
  TO authenticated
  WITH CHECK (granted_by = auth.uid());

CREATE POLICY "Admins can manage all mention access"
  ON public.kpi_mention_access FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Additive SELECT policy on kpis
CREATE POLICY "Mentioned users can view KPI"
  ON public.kpis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kpi_mention_access
      WHERE kpi_mention_access.kpi_id = kpis.id
        AND kpi_mention_access.user_id = auth.uid()
    )
  );

-- 5. Additive SELECT policy on kpi_observations (public visibility only)
CREATE POLICY "Mentioned users can view public observations"
  ON public.kpi_observations FOR SELECT
  TO authenticated
  USING (
    visibility = 'public'
    AND EXISTS (
      SELECT 1 FROM public.kpi_mention_access
      WHERE kpi_mention_access.kpi_id = kpi_observations.kpi_id
        AND kpi_mention_access.user_id = auth.uid()
    )
  );

-- 6. Additive SELECT policy on kpi_observation_replies
CREATE POLICY "Mentioned users can view observation replies"
  ON public.kpi_observation_replies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kpi_observations o
      JOIN public.kpi_mention_access m ON m.kpi_id = o.kpi_id
      WHERE o.id = kpi_observation_replies.observation_id
        AND m.user_id = auth.uid()
    )
  );
