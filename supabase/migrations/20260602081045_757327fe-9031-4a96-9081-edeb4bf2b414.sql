-- ============================================================================
-- Menu Setting Phase 3: full DnD repositioning (additive)
--   - custom_menu_level and custom_module_key on menu_overrides
--   - extended validator: level range, cross-app guard, parent-level rule
--   - audit fields covered for parent/level/module/module via existing 'field' CHECK
-- ============================================================================

ALTER TABLE public.menu_overrides
  ADD COLUMN IF NOT EXISTS custom_menu_level smallint NULL
    CHECK (custom_menu_level IS NULL OR custom_menu_level BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS custom_module_key text NULL;

-- Extend audit field CHECK to cover the new fields. The existing CHECK only
-- allows label/parent/sort_order/reset/is_active.
ALTER TABLE public.menu_override_audit
  DROP CONSTRAINT IF EXISTS menu_override_audit_field_check;
ALTER TABLE public.menu_override_audit
  ADD CONSTRAINT menu_override_audit_field_check
  CHECK (field IN ('label','parent','sort_order','reset','is_active','menu_level','module_key'));

-- Replace validator. Adds cross-app + level rules; keeps every prior check.
CREATE OR REPLACE FUNCTION public.menu_overrides_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.menu_registry%ROWTYPE;
  tgt public.menu_registry%ROWTYPE;
  effective_module text;
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

  -- Module change check
  IF NEW.custom_module_key IS NOT NULL
     AND NEW.custom_module_key IS DISTINCT FROM src.module_key THEN
    IF NOT src.is_cross_app_movable THEN
      RAISE EXCEPTION 'menu_overrides: cross-app move not permitted for %', NEW.menu_key;
    END IF;
  END IF;

  effective_module := COALESCE(NEW.custom_module_key, src.module_key);

  -- Level change check
  IF NEW.custom_menu_level IS NOT NULL
     AND NEW.custom_menu_level IS DISTINCT FROM src.menu_level THEN
    IF NOT src.is_movable THEN
      RAISE EXCEPTION 'menu_overrides: % is not movable (level change blocked)', NEW.menu_key;
    END IF;
    IF src.is_system_required THEN
      RAISE EXCEPTION 'menu_overrides: % is system-required, level cannot change', NEW.menu_key;
    END IF;
    IF NEW.custom_menu_level NOT BETWEEN 1 AND 4 THEN
      RAISE EXCEPTION 'menu_overrides: custom_menu_level must be 1..4';
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
      IF tgt.module_key IS DISTINCT FROM effective_module AND NOT src.is_cross_app_movable THEN
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