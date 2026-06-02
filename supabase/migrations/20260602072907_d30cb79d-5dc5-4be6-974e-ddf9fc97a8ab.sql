
-- ============================================================================
-- Menu Registry, Menu Overrides, Audit Log (Phase 1 foundation)
-- Additive only. Behaviour is gated by feature_flags.menu_overrides_enabled.
-- ============================================================================

-- 1. Registry (defaults seeded by the app on first load) -----------------------
CREATE TABLE public.menu_registry (
  menu_key              text PRIMARY KEY,
  default_label         text NOT NULL,
  module_key            text NOT NULL DEFAULT 'pms',
  default_parent_key    text NULL REFERENCES public.menu_registry(menu_key) ON DELETE SET NULL,
  menu_level            smallint NOT NULL CHECK (menu_level BETWEEN 1 AND 4),
  route_path            text NULL,
  icon_name             text NULL,
  default_sort_order    integer NOT NULL DEFAULT 100,
  accepts_children      boolean NOT NULL DEFAULT false,
  is_renamable          boolean NOT NULL DEFAULT true,
  is_movable            boolean NOT NULL DEFAULT true,
  is_cross_app_movable  boolean NOT NULL DEFAULT false,
  is_system_required    boolean NOT NULL DEFAULT false,
  feature_key           text NULL,
  permission_key        text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.menu_registry TO authenticated;
GRANT ALL ON public.menu_registry TO service_role;

ALTER TABLE public.menu_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_registry_read_all_authenticated"
  ON public.menu_registry FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "menu_registry_admin_write"
  ON public.menu_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Overrides (per client, NULL for single-tenant) ---------------------------
CREATE TABLE public.menu_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_key            text NOT NULL REFERENCES public.menu_registry(menu_key) ON DELETE CASCADE,
  client_id           uuid NULL,
  custom_label        text NULL,
  custom_parent_key   text NULL REFERENCES public.menu_registry(menu_key) ON DELETE SET NULL,
  custom_sort_order   integer NULL,
  is_active           boolean NOT NULL DEFAULT true,
  updated_by          uuid NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique per (menu_key, client_id). NULL client_id = global override.
CREATE UNIQUE INDEX menu_overrides_unique_key_client
  ON public.menu_overrides (menu_key, COALESCE(client_id::text, '__global__'));

CREATE INDEX menu_overrides_active_idx ON public.menu_overrides(is_active) WHERE is_active;

GRANT SELECT ON public.menu_overrides TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_overrides TO authenticated;
GRANT ALL ON public.menu_overrides TO service_role;

ALTER TABLE public.menu_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_overrides_read_all_authenticated"
  ON public.menu_overrides FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "menu_overrides_admin_insert"
  ON public.menu_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "menu_overrides_admin_update"
  ON public.menu_overrides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "menu_overrides_admin_delete"
  ON public.menu_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Audit log (immutable) ----------------------------------------------------
CREATE TABLE public.menu_override_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_key      text NOT NULL,
  client_id     uuid NULL,
  field         text NOT NULL CHECK (field IN ('label','parent','sort_order','reset','is_active')),
  old_value     text NULL,
  new_value     text NULL,
  changed_by    uuid NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX menu_override_audit_menu_idx ON public.menu_override_audit(menu_key, changed_at DESC);

GRANT SELECT, INSERT ON public.menu_override_audit TO authenticated;
GRANT ALL ON public.menu_override_audit TO service_role;

ALTER TABLE public.menu_override_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_override_audit_admin_read"
  ON public.menu_override_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "menu_override_audit_admin_insert"
  ON public.menu_override_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Validation trigger -------------------------------------------------------
-- Enforces the rules from plan §7 at the database level so the UI cannot be
-- bypassed via direct API calls.
CREATE OR REPLACE FUNCTION public.menu_overrides_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.menu_registry%ROWTYPE;
  tgt public.menu_registry%ROWTYPE;
  cursor_key text;
  guard int := 0;
BEGIN
  SELECT * INTO src FROM public.menu_registry WHERE menu_key = NEW.menu_key;
  IF src IS NULL THEN
    RAISE EXCEPTION 'menu_overrides: unknown menu_key %', NEW.menu_key;
  END IF;

  -- Rename check
  IF NEW.custom_label IS NOT NULL AND NEW.custom_label IS DISTINCT FROM src.default_label THEN
    IF NOT src.is_renamable THEN
      RAISE EXCEPTION 'menu_overrides: % is not renamable', NEW.menu_key;
    END IF;
    IF length(trim(NEW.custom_label)) = 0 THEN
      RAISE EXCEPTION 'menu_overrides: custom_label cannot be blank';
    END IF;
  END IF;

  -- Parent / move checks
  IF NEW.custom_parent_key IS DISTINCT FROM src.default_parent_key THEN
    IF NOT src.is_movable THEN
      RAISE EXCEPTION 'menu_overrides: % is not movable', NEW.menu_key;
    END IF;
    IF src.is_system_required THEN
      RAISE EXCEPTION 'menu_overrides: % is system-required, parent cannot change', NEW.menu_key;
    END IF;

    IF NEW.custom_parent_key IS NOT NULL THEN
      SELECT * INTO tgt FROM public.menu_registry WHERE menu_key = NEW.custom_parent_key;
      IF tgt IS NULL THEN
        RAISE EXCEPTION 'menu_overrides: target parent % does not exist', NEW.custom_parent_key;
      END IF;
      IF NOT tgt.accepts_children THEN
        RAISE EXCEPTION 'menu_overrides: target parent % does not accept children', NEW.custom_parent_key;
      END IF;
      IF tgt.module_key IS DISTINCT FROM src.module_key AND NOT src.is_cross_app_movable THEN
        RAISE EXCEPTION 'menu_overrides: cross-app move not permitted for %', NEW.menu_key;
      END IF;

      -- Cycle detection: walk up target's chain (via override-or-default parent)
      cursor_key := NEW.custom_parent_key;
      WHILE cursor_key IS NOT NULL AND guard < 50 LOOP
        IF cursor_key = NEW.menu_key THEN
          RAISE EXCEPTION 'menu_overrides: cycle detected for %', NEW.menu_key;
        END IF;
        SELECT COALESCE(
          (SELECT mo.custom_parent_key
             FROM public.menu_overrides mo
             WHERE mo.menu_key = cursor_key
               AND mo.is_active
               AND COALESCE(mo.client_id::text,'__global__')
                 = COALESCE(NEW.client_id::text,'__global__')
             LIMIT 1),
          (SELECT mr.default_parent_key FROM public.menu_registry mr WHERE mr.menu_key = cursor_key)
        )
        INTO cursor_key;
        guard := guard + 1;
      END LOOP;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER menu_overrides_validate_trg
  BEFORE INSERT OR UPDATE ON public.menu_overrides
  FOR EACH ROW EXECUTE FUNCTION public.menu_overrides_validate();

-- 5. Feature flag (additive, default OFF) -------------------------------------
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'menu_overrides_enabled',
  '"false"'::jsonb,
  'Master switch for the configurable menu (Menu Setting tab). When false, the resolver returns defaults only.'
)
ON CONFLICT (setting_key) DO NOTHING;
