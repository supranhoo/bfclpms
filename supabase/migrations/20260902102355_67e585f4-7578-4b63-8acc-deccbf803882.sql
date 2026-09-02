-- ADR-345 — audit-vocabulary drift: correct_kpis_range logs 'rename_kpis_range'
-- and reverse_standardization_action already handles it, but the CHECK
-- constraint allowlist was never extended, so every range rename aborted.
ALTER TABLE public.kpi_standardization_actions
  DROP CONSTRAINT IF EXISTS kpi_standardization_actions_action_type_check;

ALTER TABLE public.kpi_standardization_actions
  ADD CONSTRAINT kpi_standardization_actions_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'create_definition',
    'link_alias',
    'unlink_alias',
    'rename_kpis',
    'rename_kpis_range',
    'delete_definition',
    'edit_definition',
    'skip_group',
    'unskip_group',
    'backfill_definition_links'
  ]::text[]));

COMMENT ON CONSTRAINT kpi_standardization_actions_action_type_check
  ON public.kpi_standardization_actions IS
  'ADR-345 / POLICY §AUDIT-ACTION-VOCABULARY — every action_type written by a standardization RPC must be listed here and handled by reverse_standardization_action.';