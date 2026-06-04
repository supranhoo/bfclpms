CREATE OR REPLACE FUNCTION public.impl_console_try_increment_rate(
  _actor_id uuid,
  _client_id uuid,
  _action text,
  _bucket_hour timestamptz,
  _limit int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_count int;
BEGIN
  -- Prune old buckets opportunistically (keep last 24h)
  DELETE FROM public.impl_console_rate_buckets
   WHERE bucket_hour < now() - interval '24 hours';

  INSERT INTO public.impl_console_rate_buckets (actor_id, client_id, action, bucket_hour, count)
  VALUES (_actor_id, _client_id, _action, _bucket_hour, 1)
  ON CONFLICT (actor_id, client_id, action, bucket_hour)
  DO UPDATE SET count = public.impl_console_rate_buckets.count + 1,
                updated_at = now()
  WHERE public.impl_console_rate_buckets.count < _limit
  RETURNING count INTO _new_count;

  RETURN _new_count;  -- NULL when limit already reached
END;
$$;

REVOKE ALL ON FUNCTION public.impl_console_try_increment_rate(uuid, uuid, text, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.impl_console_try_increment_rate(uuid, uuid, text, timestamptz, int) TO service_role;
