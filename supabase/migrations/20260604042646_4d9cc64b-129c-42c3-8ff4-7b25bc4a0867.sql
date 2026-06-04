CREATE TABLE public.impl_console_rate_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('test_email_send')),
  bucket_hour timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, client_id, action, bucket_hour)
);

CREATE INDEX idx_impl_rate_buckets_lookup
  ON public.impl_console_rate_buckets (actor_id, client_id, action, bucket_hour);

GRANT SELECT ON public.impl_console_rate_buckets TO authenticated;
GRANT ALL ON public.impl_console_rate_buckets TO service_role;

ALTER TABLE public.impl_console_rate_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_buckets_self_read"
  ON public.impl_console_rate_buckets
  FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid());
