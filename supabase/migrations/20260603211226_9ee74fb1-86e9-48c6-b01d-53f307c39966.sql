ALTER TABLE public.entitlement_audit
  DROP CONSTRAINT IF EXISTS entitlement_audit_event_type_check;

ALTER TABLE public.entitlement_audit
  ADD CONSTRAINT entitlement_audit_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'grant'::text,
    'revoke'::text,
    'update'::text,
    'would_deny'::text,
    'admin_view'::text,
    'deny'::text,
    'create'::text
  ]));