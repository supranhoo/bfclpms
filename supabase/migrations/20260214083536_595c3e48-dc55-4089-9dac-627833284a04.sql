
-- Create kpi_rollback_requests table
CREATE TABLE public.kpi_rollback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  requested_from_status TEXT NOT NULL,
  target_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  actioned_by UUID REFERENCES public.profiles(id),
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique partial index: only one pending request per KPI
CREATE UNIQUE INDEX idx_one_pending_rollback_per_kpi
  ON public.kpi_rollback_requests (kpi_id)
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.kpi_rollback_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: requester or anyone authenticated (reviewers need to see it)
CREATE POLICY "Authenticated users can view rollback requests"
  ON public.kpi_rollback_requests FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: only the requester
CREATE POLICY "Users can create their own rollback requests"
  ON public.kpi_rollback_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requested_by);

-- UPDATE: reviewer who actions it (not the requester)
CREATE POLICY "Reviewers can action rollback requests"
  ON public.kpi_rollback_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() != requested_by);

-- Auto-expire pending requests when KPI status changes
CREATE OR REPLACE FUNCTION public.auto_expire_rollback_requests()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.kpi_rollback_requests
    SET status = 'expired', actioned_at = now()
    WHERE kpi_id = NEW.id
      AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_expire_rollback_on_status_change
  AFTER UPDATE OF status ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_expire_rollback_requests();

-- Enable realtime for rollback requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.kpi_rollback_requests;
