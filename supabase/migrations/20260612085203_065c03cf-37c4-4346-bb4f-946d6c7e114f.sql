-- Rebase SLA-rule uniqueness from legacy enum columns onto configured Type/Severity IDs.
-- Root cause: custom incident types (e.g. "Spillage") have no legacy enum value and were
-- coerced to 'near_miss', causing false duplicate-key collisions with unrelated rules.

-- 1) Safety-net backfill: map any rows missing FK ids from their legacy codes
UPDATE public.safety_incident_sla_rules r
   SET incident_type_id = t.id
  FROM public.safety_incident_types t
 WHERE r.incident_type_id IS NULL
   AND t.code = r.incident_type::text;

UPDATE public.safety_incident_sla_rules r
   SET severity_id = s.id
  FROM public.safety_incident_severities s
 WHERE r.severity_id IS NULL
   AND r.incident_type_id IS NOT NULL
   AND s.incident_type_id = r.incident_type_id
   AND s.code = r.severity::text;

-- 2) Drop the legacy-enum unique indexes
DROP INDEX IF EXISTS public.uq_safety_sla_rules_active_specific;
DROP INDEX IF EXISTS public.uq_safety_sla_rules_active_any_priority;

-- 3) Recreate uniqueness on the configured ID columns (same names so existing
--    client-side error translation keeps working)
CREATE UNIQUE INDEX uq_safety_sla_rules_active_specific
  ON public.safety_incident_sla_rules (incident_type_id, severity_id, priority)
  WHERE is_active AND priority IS NOT NULL
    AND incident_type_id IS NOT NULL AND severity_id IS NOT NULL;

CREATE UNIQUE INDEX uq_safety_sla_rules_active_any_priority
  ON public.safety_incident_sla_rules (incident_type_id, severity_id)
  WHERE is_active AND priority IS NULL
    AND incident_type_id IS NOT NULL AND severity_id IS NOT NULL;

-- 4) Legacy safety net: rows that could not be mapped to IDs still get
--    duplicate protection on the old enum columns
CREATE UNIQUE INDEX uq_safety_sla_rules_active_specific_legacy
  ON public.safety_incident_sla_rules (incident_type, severity, priority)
  WHERE is_active AND priority IS NOT NULL
    AND (incident_type_id IS NULL OR severity_id IS NULL);

CREATE UNIQUE INDEX uq_safety_sla_rules_active_any_priority_legacy
  ON public.safety_incident_sla_rules (incident_type, severity)
  WHERE is_active AND priority IS NULL
    AND (incident_type_id IS NULL OR severity_id IS NULL);