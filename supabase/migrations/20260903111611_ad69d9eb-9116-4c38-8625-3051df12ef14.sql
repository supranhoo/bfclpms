-- Make menu_access_user_overrides action-aware so a visibility override
-- no longer automatically grants full add/update/delete rights.

-- 1) Add per-action columns. Default false so newly-created overrides are
--    view-only unless an admin explicitly grants write actions.
ALTER TABLE public.menu_access_user_overrides
  ADD COLUMN IF NOT EXISTS can_add     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_update  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete  BOOLEAN NOT NULL DEFAULT false;

-- 2) Preserve current behavior for existing overrides: any row that already
--    existed granted ALL actions because has_menu_write_access ignored the
--    action parameter. Backfilling true avoids breaking live users while
--    making the grant explicit going forward.
UPDATE public.menu_access_user_overrides
SET can_add = true, can_update = true, can_delete = true
WHERE can_add = false AND can_update = false AND can_delete = false;

-- 3) Rewrite has_menu_write_access so the override check is action-specific.
CREATE OR REPLACE FUNCTION public.has_menu_write_access(
  _user_id uuid,
  _menu_key text,
  _action text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.menu_access_user_overrides
      WHERE user_id = _user_id
        AND menu_key = _menu_key
        AND (
          (_action = 'add'     AND can_add = true)
          OR (_action = 'update' AND can_update = true)
          OR (_action = 'delete' AND can_delete = true)
        )
    )
    OR public.has_profile_menu_access(_user_id, _menu_key, _action);
$function$;

COMMENT ON FUNCTION public.has_menu_write_access(uuid, text, text) IS
  'Grants write access only when the user has an explicit action-scoped override or matching profile-based right.';
