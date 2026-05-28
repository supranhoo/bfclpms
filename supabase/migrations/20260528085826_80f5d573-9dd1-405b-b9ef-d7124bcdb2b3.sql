
-- =========================================================================
-- Step 1: Profile FK migration for PMS Grade and Level (Extended Org KPI Scope, Phase 1)
-- =========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pms_grade_id uuid REFERENCES public.pms_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level_id     uuid REFERENCES public.levels(id)     ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.pms_grade    IS 'DEPRECATED (2026-05) — use pms_grade_id. Kept as fallback during Extended Org KPI Scope transition. Trigger trg_profiles_sync_grade_level keeps both in sync.';
COMMENT ON COLUMN public.profiles.level        IS 'DEPRECATED (2026-05) — use level_id. Kept as fallback during Extended Org KPI Scope transition. Trigger trg_profiles_sync_grade_level keeps both in sync.';
COMMENT ON COLUMN public.profiles.pms_grade_id IS 'Foreign key into pms_grades. Authoritative starting with Extended Org KPI Scope rollout (Phase 1, 2026-05).';
COMMENT ON COLUMN public.profiles.level_id     IS 'Foreign key into levels. Authoritative starting with Extended Org KPI Scope rollout (Phase 1, 2026-05).';

CREATE INDEX IF NOT EXISTS idx_profiles_pms_grade_id ON public.profiles(pms_grade_id) WHERE pms_grade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_level_id     ON public.profiles(level_id)     WHERE level_id     IS NOT NULL;

UPDATE public.profiles p
SET pms_grade_id = g.id
FROM public.pms_grades g
WHERE p.pms_grade_id IS NULL
  AND p.pms_grade IS NOT NULL
  AND trim(p.pms_grade) <> ''
  AND lower(trim(g.name)) = lower(trim(p.pms_grade));

UPDATE public.profiles p
SET level_id = l.id
FROM public.levels l
WHERE p.level_id IS NULL
  AND p.level IS NOT NULL
  AND trim(p.level) <> ''
  AND lower(trim(l.name)) = lower(trim(p.level));

CREATE OR REPLACE FUNCTION public.sync_profile_grade_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_grade_name text;
  v_level_name text;
  v_grade_id   uuid;
  v_level_id   uuid;
BEGIN
  IF NEW.pms_grade_id IS DISTINCT FROM OLD.pms_grade_id THEN
    IF NEW.pms_grade_id IS NOT NULL THEN
      SELECT name INTO v_grade_name FROM public.pms_grades WHERE id = NEW.pms_grade_id;
      IF v_grade_name IS NOT NULL THEN NEW.pms_grade := v_grade_name; END IF;
    END IF;
  ELSIF NEW.pms_grade IS DISTINCT FROM OLD.pms_grade AND NEW.pms_grade IS NOT NULL AND trim(NEW.pms_grade) <> '' THEN
    SELECT id INTO v_grade_id FROM public.pms_grades
      WHERE lower(trim(name)) = lower(trim(NEW.pms_grade)) LIMIT 1;
    NEW.pms_grade_id := v_grade_id;
  END IF;

  IF NEW.level_id IS DISTINCT FROM OLD.level_id THEN
    IF NEW.level_id IS NOT NULL THEN
      SELECT name INTO v_level_name FROM public.levels WHERE id = NEW.level_id;
      IF v_level_name IS NOT NULL THEN NEW.level := v_level_name; END IF;
    END IF;
  ELSIF NEW.level IS DISTINCT FROM OLD.level AND NEW.level IS NOT NULL AND trim(NEW.level) <> '' THEN
    SELECT id INTO v_level_id FROM public.levels
      WHERE lower(trim(name)) = lower(trim(NEW.level)) LIMIT 1;
    NEW.level_id := v_level_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_grade_level ON public.profiles;
CREATE TRIGGER trg_profiles_sync_grade_level
BEFORE UPDATE OF pms_grade, level, pms_grade_id, level_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_grade_level();

CREATE OR REPLACE FUNCTION public.sync_profile_grade_level_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pms_grade_id IS NULL AND NEW.pms_grade IS NOT NULL AND trim(NEW.pms_grade) <> '' THEN
    SELECT id INTO NEW.pms_grade_id FROM public.pms_grades
      WHERE lower(trim(name)) = lower(trim(NEW.pms_grade)) LIMIT 1;
  ELSIF NEW.pms_grade_id IS NOT NULL AND (NEW.pms_grade IS NULL OR trim(NEW.pms_grade) = '') THEN
    SELECT name INTO NEW.pms_grade FROM public.pms_grades WHERE id = NEW.pms_grade_id;
  END IF;

  IF NEW.level_id IS NULL AND NEW.level IS NOT NULL AND trim(NEW.level) <> '' THEN
    SELECT id INTO NEW.level_id FROM public.levels
      WHERE lower(trim(name)) = lower(trim(NEW.level)) LIMIT 1;
  ELSIF NEW.level_id IS NOT NULL AND (NEW.level IS NULL OR trim(NEW.level) = '') THEN
    SELECT name INTO NEW.level FROM public.levels WHERE id = NEW.level_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_grade_level_insert ON public.profiles;
CREATE TRIGGER trg_profiles_sync_grade_level_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_grade_level_insert();

CREATE OR REPLACE FUNCTION public.list_profile_grade_level_orphans()
RETURNS TABLE (
  profile_id     uuid,
  full_name      text,
  orphan_kind    text,
  orphan_value   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.profile_id, x.full_name, x.orphan_kind, x.orphan_value
  FROM (
    SELECT id AS profile_id, full_name, 'pms_grade'::text AS orphan_kind, pms_grade AS orphan_value
      FROM public.profiles
     WHERE pms_grade IS NOT NULL AND trim(pms_grade) <> '' AND pms_grade_id IS NULL
    UNION ALL
    SELECT id, full_name, 'level'::text, level
      FROM public.profiles
     WHERE level IS NOT NULL AND trim(level) <> '' AND level_id IS NULL
  ) x
  ORDER BY x.orphan_kind, x.orphan_value, x.full_name;
$$;

REVOKE ALL ON FUNCTION public.list_profile_grade_level_orphans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_profile_grade_level_orphans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_profile_grade_level_orphans() TO service_role;
