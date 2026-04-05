
CREATE TABLE public.email_dispatch_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.email_dispatch_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on email_dispatch_queue"
ON public.email_dispatch_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Admins can view email_dispatch_queue"
ON public.email_dispatch_queue
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

CREATE INDEX idx_email_dispatch_queue_pending 
ON public.email_dispatch_queue (template_key, created_at) 
WHERE sent_at IS NULL;
