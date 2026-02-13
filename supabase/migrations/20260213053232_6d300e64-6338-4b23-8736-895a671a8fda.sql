
-- Create email_logs table
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  provider TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT
CREATE POLICY "Admins can view email logs"
  ON public.email_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Create index for common queries
CREATE INDEX idx_email_logs_created_at ON public.email_logs (created_at DESC);
CREATE INDEX idx_email_logs_status ON public.email_logs (status);
CREATE INDEX idx_email_logs_event_type ON public.email_logs (event_type);
