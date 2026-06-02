CREATE OR REPLACE FUNCTION public.menu_registry_custom_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  parent_accepts boolean;
  parent_exists boolean;
  parent_depth int;
BEGIN
  IF COALESCE(NEW.is_custom, false) = false THEN
    RETURN NEW;
  END IF;

  IF NEW.menu_key !~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Custom menu_key must match pattern custom-<slug>: %', NEW.menu_key;
  END IF;

  IF NEW.menu_level NOT IN (2, 3, 4) THEN
    RAISE EXCEPTION 'Custom menu items must be at level 2, 3 or 4 (got %)', NEW.menu_level;
  END IF;

  IF NEW.default_parent_key IS NULL THEN
    RAISE EXCEPTION 'Custom menu items require a parent';
  END IF;

  SELECT accepts_children, true
    INTO parent_accepts, parent_exists
    FROM public.menu_registry
   WHERE menu_key = NEW.default_parent_key;

  IF NOT COALESCE(parent_exists, false) THEN
    RAISE EXCEPTION 'Parent % does not exist', NEW.default_parent_key;
  END IF;

  IF parent_accepts = false THEN
    RAISE EXCEPTION 'Parent % cannot accept children', NEW.default_parent_key;
  END IF;

  -- Compute depth of parent by walking default_parent_key chain (root = 1).
  WITH RECURSIVE chain(menu_key, default_parent_key, depth) AS (
    SELECT m.menu_key, m.default_parent_key, 1
      FROM public.menu_registry m
     WHERE m.menu_key = NEW.default_parent_key
    UNION ALL
    SELECT p.menu_key, p.default_parent_key, c.depth + 1
      FROM public.menu_registry p
      JOIN chain c ON p.menu_key = c.default_parent_key
     WHERE c.depth < 10
  )
  SELECT MAX(depth) INTO parent_depth FROM chain;

  IF parent_depth IS NULL THEN
    parent_depth := 1;
  END IF;

  IF (parent_depth + 1) <> NEW.menu_level THEN
    RAISE EXCEPTION 'Custom menu_level (%) must equal parent depth (%) + 1', NEW.menu_level, parent_depth;
  END IF;

  IF (parent_depth + 1) > 4 THEN
    RAISE EXCEPTION 'Custom menu nesting exceeds max depth of 4';
  END IF;

  IF NEW.is_system_required = true THEN
    RAISE EXCEPTION 'Custom items cannot be system-required';
  END IF;

  RETURN NEW;
END;
$function$;