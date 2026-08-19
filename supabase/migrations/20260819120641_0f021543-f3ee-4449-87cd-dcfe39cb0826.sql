-- ADR-301 — Central Data Approval → Score Propagation (schema)

CREATE TABLE public.org_kpi_central_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  kra_name text NOT NULL,
  kpi_name text NOT NULL,
  propagation_mode text NOT NULL DEFAULT 'central_fed'
    CHECK (propagation_mode IN ('central_fed','central_approved')),
  cutoff_day integer CHECK (cutoff_day IS NULL OR (cutoff_day BETWEEN 1 AND 31)),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX org_kpi_central_registry_key
  ON public.org_kpi_central_registry (
    category_id,
    public.normalize_kpi_text(kra_name),
    public.normalize_kpi_text(kpi_name)
  );

GRANT SELECT ON public.org_kpi_central_registry TO authenticated;
GRANT ALL ON public.org_kpi_central_registry TO service_role;
ALTER TABLE public.org_kpi_central_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "central_registry_read"
  ON public.org_kpi_central_registry FOR SELECT TO authenticated
  USING (
    public.bu_console_can_read(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o
      WHERE o.owner_id = auth.uid()
        AND o.category_id = org_kpi_central_registry.category_id
        AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(org_kpi_central_registry.kra_name)
        AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(org_kpi_central_registry.kpi_name)
    )
  );

CREATE POLICY "central_registry_admin_write"
  ON public.org_kpi_central_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


CREATE TABLE public.org_kpi_approval_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  kra_name text NOT NULL,
  kpi_name text NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  step_no integer NOT NULL CHECK (step_no >= 1),
  step_kind text NOT NULL DEFAULT 'approver'
    CHECK (step_kind IN ('provider','approver')),
  approver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approver_role public.app_role,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_kpi_chain_actor_present
    CHECK (approver_id IS NOT NULL OR approver_role IS NOT NULL)
);

CREATE UNIQUE INDEX org_kpi_approval_chains_key
  ON public.org_kpi_approval_chains (
    category_id,
    public.normalize_kpi_text(kra_name),
    public.normalize_kpi_text(kpi_name),
    effective_from,
    step_no
  );

CREATE INDEX org_kpi_approval_chains_lookup
  ON public.org_kpi_approval_chains (category_id, effective_from DESC);

GRANT SELECT ON public.org_kpi_approval_chains TO authenticated;
GRANT ALL ON public.org_kpi_approval_chains TO service_role;
ALTER TABLE public.org_kpi_approval_chains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "central_chain_read"
  ON public.org_kpi_approval_chains FOR SELECT TO authenticated
  USING (
    public.bu_console_can_read(auth.uid())
    OR approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o
      WHERE o.owner_id = auth.uid()
        AND o.category_id = org_kpi_approval_chains.category_id
        AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(org_kpi_approval_chains.kra_name)
        AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(org_kpi_approval_chains.kpi_name)
    )
  );

CREATE POLICY "central_chain_admin_write"
  ON public.org_kpi_approval_chains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


CREATE TABLE public.org_kpi_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  okv_id uuid NOT NULL REFERENCES public.org_kpi_values(id) ON DELETE CASCADE,
  step_no integer NOT NULL,
  step_label text,
  decision text NOT NULL
    CHECK (decision IN ('submitted','approved','sent_back','finalised','auto_closed')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text,
  comment text,
  achieved_value_at_decision numeric,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX org_kpi_approvals_okv ON public.org_kpi_approvals (okv_id, decided_at DESC);

GRANT SELECT ON public.org_kpi_approvals TO authenticated;
GRANT ALL ON public.org_kpi_approvals TO service_role;
ALTER TABLE public.org_kpi_approvals ENABLE ROW LEVEL SECURITY;

-- Read-only to the app: rows are written exclusively by SECURITY DEFINER RPCs,
-- and no UPDATE/DELETE policy exists anywhere (immutable audit trail).
CREATE POLICY "central_approvals_read"
  ON public.org_kpi_approvals FOR SELECT TO authenticated
  USING (
    public.bu_console_can_read(auth.uid())
    OR actor_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.org_kpi_values v
      JOIN public.org_kpi_data_owners o
        ON o.category_id = v.category_id
       AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(v.kra_name)
       AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(v.kpi_name)
      WHERE v.id = org_kpi_approvals.okv_id
        AND o.owner_id = auth.uid()
    )
  );


ALTER TABLE public.org_kpi_values
  ADD COLUMN IF NOT EXISTS workflow_stage text,
  ADD COLUMN IF NOT EXISTS current_step integer,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS propagation_mode text;

ALTER TABLE public.org_kpi_values
  ADD CONSTRAINT org_kpi_values_workflow_stage_check
  CHECK (workflow_stage IS NULL OR workflow_stage IN
    ('draft','in_approval','sent_back','approved','propagated'));

ALTER TABLE public.org_kpi_values
  ADD CONSTRAINT org_kpi_values_propagation_mode_check
  CHECK (propagation_mode IS NULL OR propagation_mode IN ('central_fed','central_approved'));

CREATE TRIGGER trg_org_kpi_central_registry_updated_at
  BEFORE UPDATE ON public.org_kpi_central_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_org_kpi_approval_chains_updated_at
  BEFORE UPDATE ON public.org_kpi_approval_chains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();