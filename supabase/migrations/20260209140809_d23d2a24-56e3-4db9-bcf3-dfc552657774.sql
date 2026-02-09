
-- 1. Add status column to kpi_observations
ALTER TABLE public.kpi_observations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

-- 2. Set score_impact default to 0 (column already exists)
ALTER TABLE public.kpi_observations
  ALTER COLUMN score_impact SET DEFAULT 0;

-- 3. Create kpi_observation_replies table
CREATE TABLE public.kpi_observation_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  observation_id UUID NOT NULL REFERENCES public.kpi_observations(id) ON DELETE CASCADE,
  reply_by UUID NOT NULL REFERENCES public.profiles(id),
  reply_text TEXT NOT NULL,
  evidence_urls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.kpi_observation_replies ENABLE ROW LEVEL SECURITY;

-- 5. RLS: All authenticated users can read replies
CREATE POLICY "Authenticated users can view observation replies"
  ON public.kpi_observation_replies
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 6. RLS: Authenticated users can insert replies
CREATE POLICY "Authenticated users can create observation replies"
  ON public.kpi_observation_replies
  FOR INSERT
  WITH CHECK (auth.uid() = reply_by);

-- 7. RLS: Users can delete their own replies
CREATE POLICY "Users can delete their own replies"
  ON public.kpi_observation_replies
  FOR DELETE
  USING (auth.uid() = reply_by);

-- 8. Add index for fast lookups
CREATE INDEX idx_observation_replies_observation_id
  ON public.kpi_observation_replies(observation_id);
