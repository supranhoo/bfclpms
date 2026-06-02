-- Add custom menu item support to menu_registry (additive only).

ALTER TABLE public.menu_registry
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color text NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid NULL;

-- Validation trigger for custom menu items.
CREATE OR REPLACE FUNCTION public.menu_registry_custom_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_level smallint;
  parent_accepts boolean;
BEGIN
  -- Only validate when this row is a custom item.
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

  SELECT menu_level, accepts_children
    INTO parent_level, parent_accepts
    FROM public.menu_registry
   WHERE menu_key = NEW.default_parent_key;

  IF parent_level IS NULL THEN
    RAISE EXCEPTION 'Parent % does not exist', NEW.default_parent_key;
  END IF;

  IF parent_accepts = false THEN
    RAISE EXCEPTION 'Parent % cannot accept children', NEW.default_parent_key;
  END IF;

  IF (parent_level + 1) <> NEW.menu_level THEN
    RAISE EXCEPTION 'Custom menu_level (%) must be parent level (%) + 1', NEW.menu_level, parent_level;
  END IF;

  IF NEW.is_system_required = true THEN
    RAISE EXCEPTION 'Custom items cannot be system-required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_registry_custom_validate ON public.menu_registry;
CREATE TRIGGER trg_menu_registry_custom_validate
  BEFORE INSERT OR UPDATE ON public.menu_registry
  FOR EACH ROW EXECUTE FUNCTION public.menu_registry_custom_validate();

-- Protect seeded (non-custom) rows from being deleted.
CREATE OR REPLACE FUNCTION public.menu_registry_protect_seeded_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.is_custom, false) = false THEN
    RAISE EXCEPTION 'Cannot delete seeded menu item %', OLD.menu_key;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_registry_protect_seeded_delete ON public.menu_registry;
CREATE TRIGGER trg_menu_registry_protect_seeded_delete
  BEFORE DELETE ON public.menu_registry
  FOR EACH ROW EXECUTE FUNCTION public.menu_registry_protect_seeded_delete();