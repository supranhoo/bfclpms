CREATE OR REPLACE FUNCTION public.menu_overrides_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  src public.menu_registry%ROWTYPE;
  tgt public.menu_registry%ROWTYPE;
  effective_module text;
  effective_target_level int;
  cursor_key text;
  guard int := 0;
BEGIN
  SELECT * INTO src FROM public.menu_registry WHERE menu_key = NEW.menu_key;
  IF src IS NULL THEN
    RAISE EXCEPTION 'menu_overrides: unknown menu_key %', NEW.menu_key;
  END IF;

  IF NEW.custom_label IS NOT NULL AND NEW.custom_label IS DISTINCT FROM src.default_label THEN
    IF NOT src.is_renamable THEN
      RAISE EXCEPTION 'menu_overrides: % is not renamable', NEW.menu_key;
    END IF;
    IF length(trim(NEW.custom_label)) = 0 THEN
      RAISE EXCEPTION 'menu_overrides: custom_label cannot be blank';
    END IF;
  END IF;

  IF NEW.custom_module_key IS NOT NULL
     AND NEW.custom_module_key IS DISTINCT FROM src.module_key THEN
    IF NOT src.is_cross_app_movable THEN
      RAISE EXCEPTION 'menu_overrides: cross-app move not permitted for %', NEW.menu_key;
    END IF;
  END IF;

  effective_module := COALESCE(NEW.custom_module_key, src.module_key);

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

      -- Depth cap: parent's EFFECTIVE level (override-or-default) + 1 must be <= 4.
      SELECT COALESCE(
        (SELECT mo.custom_menu_level
           FROM public.menu_overrides mo
           WHERE mo.menu_key = NEW.custom_parent_key
             AND mo.is_active
             AND mo.custom_menu_level IS NOT NULL
             AND COALESCE(mo.client_id::text,'__global__')
               = COALESCE(NEW.client_id::text,'__global__')
           LIMIT 1),
        tgt.menu_level
      ) INTO effective_target_level;

      IF effective_target_level + 1 > 4 THEN
        RAISE EXCEPTION 'menu_overrides: nesting too deep (max 4 levels) for %', NEW.menu_key;
      END IF;

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
$function$;