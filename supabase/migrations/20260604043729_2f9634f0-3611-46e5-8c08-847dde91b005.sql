
-- Phase 3D: client_urls table for Implementation Console URL/Domain binding
-- No hard delete; archival only. Primary URL must be active.

CREATE TABLE IF NOT EXISTS public.client_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid,
  verified_at timestamptz,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_urls_url_scheme_chk CHECK (url ~* '^https?://[^[:space:]]+$'),
  CONSTRAINT client_urls_url_no_unsafe_chk CHECK (
    url !~* '^(javascript|data|file|vbscript):'
  ),
  CONSTRAINT client_urls_primary_requires_active_chk CHECK (
    is_primary = false OR is_active = true
  ),
  CONSTRAINT client_urls_archive_consistency_chk CHECK (
    (is_active = true  AND archived_at IS NULL AND archived_by IS NULL)
    OR
    (is_active = false AND archived_at IS NOT NULL)
  )
);

-- One URL row per (client, url) — keep archived rows; allow re-add of same URL only if previous archived
CREATE UNIQUE INDEX IF NOT EXISTS client_urls_active_url_uq
  ON public.client_urls (client_id, lower(url))
  WHERE is_active = true;

-- At most one active primary per client
CREATE UNIQUE INDEX IF NOT EXISTS client_urls_one_active_primary_per_client_uq
  ON public.client_urls (client_id)
  WHERE is_primary = true AND is_active = true;

CREATE INDEX IF NOT EXISTS client_urls_client_idx ON public.client_urls (client_id);

-- GRANTS (no DELETE — archival only)
GRANT SELECT, INSERT, UPDATE ON public.client_urls TO authenticated;
GRANT ALL ON public.client_urls TO service_role;

ALTER TABLE public.client_urls ENABLE ROW LEVEL SECURITY;

-- Read: platform_owner OR implementer assigned to this client
CREATE POLICY "client_urls_select"
ON public.client_urls
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'platform_owner')
  OR public.is_implementation_admin_for(client_id)
);

-- Insert: same scope
CREATE POLICY "client_urls_insert"
ON public.client_urls
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'platform_owner')
  OR public.is_implementation_admin_for(client_id)
);

-- Update: same scope (used for archive, set primary via RPC also re-uses this path through service_role)
CREATE POLICY "client_urls_update"
ON public.client_urls
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'platform_owner')
  OR public.is_implementation_admin_for(client_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'platform_owner')
  OR public.is_implementation_admin_for(client_id)
);

-- NO DELETE POLICY — archival only by design.

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_client_urls_updated_at ON public.client_urls;
CREATE TRIGGER trg_client_urls_updated_at
BEFORE UPDATE ON public.client_urls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic primary switch: unsets previous active primary, sets requested one as primary, in one transaction.
CREATE OR REPLACE FUNCTION public.impl_console_set_primary_url(_url_id uuid)
RETURNS public.client_urls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.client_urls;
BEGIN
  SELECT * INTO v_row FROM public.client_urls WHERE id = _url_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'url_not_found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_owner')
    OR public.is_implementation_admin_for(v_row.client_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_row.is_active = false THEN
    RAISE EXCEPTION 'cannot_set_archived_as_primary';
  END IF;

  -- Unset any other active primary for this client
  UPDATE public.client_urls
     SET is_primary = false, updated_by = auth.uid(), updated_at = now()
   WHERE client_id = v_row.client_id
     AND is_primary = true
     AND id <> _url_id;

  -- Set requested row as primary
  UPDATE public.client_urls
     SET is_primary = true, updated_by = auth.uid(), updated_at = now()
   WHERE id = _url_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.impl_console_set_primary_url(uuid) TO authenticated;

-- Archive (deactivate) — preserves the row for traceability
CREATE OR REPLACE FUNCTION public.impl_console_archive_url(_url_id uuid)
RETURNS public.client_urls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.client_urls;
BEGIN
  SELECT * INTO v_row FROM public.client_urls WHERE id = _url_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'url_not_found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_owner')
    OR public.is_implementation_admin_for(v_row.client_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.client_urls
     SET is_active   = false,
         is_primary  = false,
         archived_at = now(),
         archived_by = auth.uid(),
         updated_by  = auth.uid(),
         updated_at  = now()
   WHERE id = _url_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.impl_console_archive_url(uuid) TO authenticated;
