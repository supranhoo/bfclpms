
-- =========================================================================
-- Step 2: Extended Org KPI Scope schema (Phase 1)
-- Additive only. Keeps org_level_scope as text; widens CHECK to 8 values.
-- Adds scope-target FK columns to kpis, org_kpi_values, org_kpi_data_owners.
-- =========================================================================

-- A. Widen org_level_scope CHECK on kpis
ALTER TABLE public.kpis
  DROP CONSTRAINT IF EXISTS kpis_org_level_scope_check;

ALTER TABLE public.kpis
  ADD CONSTRAINT kpis_org_level_scope_check
  CHECK (
    org_level_scope IS NULL
    OR org_level_scope = ANY (ARRAY[
      'organization','division','business_unit','department',
      'location','pms_grade','level','employee'
    ])
  );

-- B. Add scope-target FK columns on kpis
ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS division_id      uuid REFERENCES public.divisions(id)       ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.business_units(id)  ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS location_id      uuid REFERENCES public.locations(id)       ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pms_grade_id     uuid REFERENCES public.pms_grades(id)      ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS level_id         uuid REFERENCES public.levels(id)          ON DELETE RESTRICT;

COMMENT ON COLUMN public.kpis.division_id      IS 'Scope target when org_level_scope = ''division''. Else must be NULL.';
COMMENT ON COLUMN public.kpis.business_unit_id IS 'Scope target when org_level_scope = ''business_unit''. Else must be NULL.';
COMMENT ON COLUMN public.kpis.location_id      IS 'Scope target when org_level_scope = ''location''. Cross-cutting (independent of org tree).';
COMMENT ON COLUMN public.kpis.pms_grade_id     IS 'Scope target when org_level_scope = ''pms_grade''. Cross-cutting.';
COMMENT ON COLUMN public.kpis.level_id         IS 'Scope target when org_level_scope = ''level''. Cross-cutting.';

-- C. CHECK constraint: exactly the matching target FK is populated per scope kind.
--    department uses existing kpis.department_id (already on table). organization & employee require no new target.
ALTER TABLE public.kpis
  ADD CONSTRAINT kpis_scope_target_check
  CHECK (
    -- when no extended scope, all new target FKs must be NULL (backward compat)
    (org_level_scope IS NULL OR org_level_scope IN ('organization','department','employee')
     AND division_id IS NULL AND business_unit_id IS NULL AND location_id IS NULL
     AND pms_grade_id IS NULL AND level_id IS NULL)
    OR (org_level_scope = 'division'      AND division_id      IS NOT NULL AND business_unit_id IS NULL AND location_id IS NULL AND pms_grade_id IS NULL AND level_id IS NULL)
    OR (org_level_scope = 'business_unit' AND business_unit_id IS NOT NULL AND division_id      IS NULL AND location_id IS NULL AND pms_grade_id IS NULL AND level_id IS NULL)
    OR (org_level_scope = 'location'      AND location_id      IS NOT NULL AND division_id      IS NULL AND business_unit_id IS NULL AND pms_grade_id IS NULL AND level_id IS NULL)
    OR (org_level_scope = 'pms_grade'     AND pms_grade_id     IS NOT NULL AND division_id      IS NULL AND business_unit_id IS NULL AND location_id IS NULL AND level_id IS NULL)
    OR (org_level_scope = 'level'         AND level_id         IS NOT NULL AND division_id      IS NULL AND business_unit_id IS NULL AND location_id IS NULL AND pms_grade_id IS NULL)
  );

-- D. Same scope-target columns on org_kpi_values (so a value row identifies its scope target)
ALTER TABLE public.org_kpi_values
  ADD COLUMN IF NOT EXISTS division_id      uuid REFERENCES public.divisions(id)       ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.business_units(id)  ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS location_id      uuid REFERENCES public.locations(id)       ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pms_grade_id     uuid REFERENCES public.pms_grades(id)      ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS level_id         uuid REFERENCES public.levels(id)          ON DELETE RESTRICT;

-- E. Org KPI Data Owners: per-scope-target ownership
ALTER TABLE public.org_kpi_data_owners
  ADD COLUMN IF NOT EXISTS org_level_scope  text DEFAULT 'organization',
  ADD COLUMN IF NOT EXISTS division_id      uuid REFERENCES public.divisions(id)       ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.business_units(id)  ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS department_id    uuid REFERENCES public.departments(id)     ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS location_id      uuid REFERENCES public.locations(id)       ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pms_grade_id     uuid REFERENCES public.pms_grades(id)      ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS level_id         uuid REFERENCES public.levels(id)          ON DELETE CASCADE;

-- Backfill existing rows: assume legacy data owners are organization-scoped
UPDATE public.org_kpi_data_owners SET org_level_scope = 'organization' WHERE org_level_scope IS NULL;

ALTER TABLE public.org_kpi_data_owners
  ALTER COLUMN org_level_scope SET NOT NULL;

ALTER TABLE public.org_kpi_data_owners
  DROP CONSTRAINT IF EXISTS org_kpi_data_owners_scope_check;

ALTER TABLE public.org_kpi_data_owners
  ADD CONSTRAINT org_kpi_data_owners_scope_check
  CHECK (
    org_level_scope = ANY (ARRAY[
      'organization','division','business_unit','department',
      'location','pms_grade','level','employee'
    ])
    AND (
      (org_level_scope IN ('organization','employee') AND division_id IS NULL AND business_unit_id IS NULL AND department_id IS NULL AND location_id IS NULL AND pms_grade_id IS NULL AND level_id IS NULL)
      OR (org_level_scope = 'division'      AND division_id      IS NOT NULL AND business_unit_id IS NULL AND department_id IS NULL AND location_id IS NULL AND pms_grade_id IS NULL AND level_id IS NULL)
      OR (org_level_scope = 'business_unit' AND business_unit_id IS NOT NULL AND division_id      IS NULL AND department_id IS NULL AND location_id IS NULL AND pms_grade_id IS NULL AND level_id IS NULL)
      OR (org_level_scope = 'department'    AND department_id    IS NOT NULL AND division_id      IS NULL AND business_unit_id IS NULL AND location_id IS NULL AND pms_grade_id IS NULL AND level_id IS NULL)
      OR (org_level_scope = 'location'      AND location_id      IS NOT NULL AND division_id      IS NULL AND business_unit_id IS NULL AND department_id IS NULL AND pms_grade_id IS NULL AND level_id IS NULL)
      OR (org_level_scope = 'pms_grade'     AND pms_grade_id     IS NOT NULL AND division_id      IS NULL AND business_unit_id IS NULL AND department_id IS NULL AND location_id IS NULL AND level_id IS NULL)
      OR (org_level_scope = 'level'         AND level_id         IS NOT NULL AND division_id      IS NULL AND business_unit_id IS NULL AND department_id IS NULL AND location_id IS NULL AND pms_grade_id IS NULL)
    )
  );

-- F. Indexes
CREATE INDEX IF NOT EXISTS idx_kpis_division_id      ON public.kpis(division_id)      WHERE division_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpis_business_unit_id ON public.kpis(business_unit_id) WHERE business_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpis_location_id      ON public.kpis(location_id)      WHERE location_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpis_pms_grade_id     ON public.kpis(pms_grade_id)     WHERE pms_grade_id     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpis_level_id         ON public.kpis(level_id)         WHERE level_id         IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpis_scope_period_year ON public.kpis(org_level_scope, review_period, review_year);

CREATE INDEX IF NOT EXISTS idx_okv_division_id      ON public.org_kpi_values(division_id)      WHERE division_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okv_business_unit_id ON public.org_kpi_values(business_unit_id) WHERE business_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okv_location_id      ON public.org_kpi_values(location_id)      WHERE location_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okv_pms_grade_id     ON public.org_kpi_values(pms_grade_id)     WHERE pms_grade_id     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okv_level_id         ON public.org_kpi_values(level_id)         WHERE level_id         IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_okdo_scope            ON public.org_kpi_data_owners(org_level_scope);
CREATE INDEX IF NOT EXISTS idx_okdo_division_id      ON public.org_kpi_data_owners(division_id)      WHERE division_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okdo_business_unit_id ON public.org_kpi_data_owners(business_unit_id) WHERE business_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okdo_department_id    ON public.org_kpi_data_owners(department_id)    WHERE department_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okdo_location_id      ON public.org_kpi_data_owners(location_id)      WHERE location_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okdo_pms_grade_id     ON public.org_kpi_data_owners(pms_grade_id)     WHERE pms_grade_id     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_okdo_level_id         ON public.org_kpi_data_owners(level_id)         WHERE level_id         IS NOT NULL;
