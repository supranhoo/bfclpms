
-- Phase 3E: client_contacts — per-client role-tagged email address book
CREATE TABLE IF NOT EXISTS public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role text NOT NULL,
  email text NOT NULL,
  display_name text,
  is_primary_for_role boolean NOT NULL DEFAULT false,
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
  CONSTRAINT client_contacts_role_chk CHECK (role IN ('support','hr','escalation','billing','ops','other')),
  CONSTRAINT client_contacts_email_format_chk CHECK (
    email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND email = lower(email)
  ),
  CONSTRAINT client_contacts_primary_requires_active_chk CHECK (
    is_primary_for_role = false OR is_active = true
  ),
  CONSTRAINT client_contacts_archive_consistency_chk CHECK (
    (is_active = true  AND archived_at IS NULL AND archived_by IS NULL)
    OR
    (is_active = false AND archived_at IS NOT NULL)
  )
);

-- At most one active primary per (client, role)
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_one_active_primary_per_role_uq
  ON public.client_contacts (client_id, role)
  WHERE is_primary_for_role = true AND is_active = true;

-- Same address can't be active twice for the same role; archived rows can be re-added
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_active_email_per_role_uq
  ON public.client_contacts (client_id, role, lower(email))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS client_contacts_client_idx ON public.client_contacts (client_id);

-- GRANTS (no DELETE — archival only)
GRANT SELECT, INSERT, UPDATE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_contacts_select"
ON public.client_contacts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'platform_owner')
  OR public.is_implementation_admin_for(client_id)
);

CREATE POLICY "client_contacts_insert"
ON public.client_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'platform_owner')
  OR public.is_implementation_admin_for(client_id)
);

CREATE POLICY "client_contacts_update"
ON public.client_contacts
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

DROP TRIGGER IF EXISTS trg_client_contacts_updated_at ON public.client_contacts;
CREATE TRIGGER trg_client_contacts_updated_at
BEFORE UPDATE ON public.client_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic primary switch within a (client, role) — unsets prior primary, sets requested row.
CREATE OR REPLACE FUNCTION public.impl_console_set_primary_contact(_contact_id uuid)
RETURNS public.client_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.client_contacts;
BEGIN
  SELECT * INTO v_row FROM public.client_contacts WHERE id = _contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact_not_found'; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_owner')
    OR public.is_implementation_admin_for(v_row.client_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_row.is_active = false THEN
    RAISE EXCEPTION 'cannot_set_archived_as_primary';
  END IF;

  UPDATE public.client_contacts
     SET is_primary_for_role = false, updated_by = auth.uid(), updated_at = now()
   WHERE client_id = v_row.client_id
     AND role      = v_row.role
     AND is_primary_for_role = true
     AND id <> _contact_id;

  UPDATE public.client_contacts
     SET is_primary_for_role = true, updated_by = auth.uid(), updated_at = now()
   WHERE id = _contact_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.impl_console_set_primary_contact(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.impl_console_archive_contact(_contact_id uuid)
RETURNS public.client_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.client_contacts;
BEGIN
  SELECT * INTO v_row FROM public.client_contacts WHERE id = _contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact_not_found'; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_owner')
    OR public.is_implementation_admin_for(v_row.client_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.client_contacts
     SET is_active = false,
         is_primary_for_role = false,
         archived_at = now(),
         archived_by = auth.uid(),
         updated_by  = auth.uid(),
         updated_at  = now()
   WHERE id = _contact_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.impl_console_archive_contact(uuid) TO authenticated;
