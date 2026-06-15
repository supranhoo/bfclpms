
DO $$ BEGIN
  CREATE TYPE public.dev_report_entry_type AS ENUM ('feature','bug','timeline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.dev_report_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type      public.dev_report_entry_type NOT NULL,
  entry_date      date,
  period_label    text,
  title           text NOT NULL,
  module_area     text,
  description     text NOT NULL,
  status          text,
  severity        text,
  timeline_type   text,
  adr_refs        text[] NOT NULL DEFAULT '{}',
  linked_commit   text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_report_entries_date_or_period
    CHECK (entry_date IS NOT NULL OR period_label IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_report_entries TO authenticated;
GRANT ALL ON public.dev_report_entries TO service_role;

ALTER TABLE public.dev_report_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_report_admin_all"
  ON public.dev_report_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "dev_report_viewers_select"
  ON public.dev_report_entries FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'management')
    OR public.has_role(auth.uid(),'auditor')
  );

CREATE INDEX dev_report_entries_type_date_idx
  ON public.dev_report_entries (entry_type, entry_date DESC NULLS LAST);
CREATE INDEX dev_report_entries_module_idx
  ON public.dev_report_entries (module_area);
CREATE INDEX dev_report_entries_adr_refs_idx
  ON public.dev_report_entries USING GIN (adr_refs);

CREATE TRIGGER dev_report_entries_set_updated_at
  BEFORE UPDATE ON public.dev_report_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.dev_report_summary(
  period_from date DEFAULT NULL,
  period_to   date DEFAULT NULL
)
RETURNS TABLE (
  feature_count  bigint,
  bug_count      bigint,
  timeline_count bigint,
  min_entry_date date,
  max_entry_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*) FILTER (WHERE entry_type = 'feature')::bigint,
    COUNT(*) FILTER (WHERE entry_type = 'bug')::bigint,
    COUNT(*) FILTER (WHERE entry_type = 'timeline')::bigint,
    MIN(entry_date),
    MAX(entry_date)
  FROM public.dev_report_entries
  WHERE (period_from IS NULL OR entry_date IS NULL OR entry_date >= period_from)
    AND (period_to   IS NULL OR entry_date IS NULL OR entry_date <= period_to);
$$;

GRANT EXECUTE ON FUNCTION public.dev_report_summary(date,date) TO authenticated, service_role;

INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES
  ('dev_report_enabled', to_jsonb(false), 'Master switch for the in-app Development Report.'),
  ('dev_report.project_name', to_jsonb('BFCL Performance Management System (PMS)'::text), 'Cover-sheet project name.'),
  ('dev_report.tech_stack', to_jsonb('Vite, TypeScript, React, shadcn-ui, Tailwind CSS, Supabase (PostgreSQL/PLpgSQL), Edge Functions'::text), 'Cover-sheet tech stack.'),
  ('dev_report.repository', to_jsonb('github.com/supranhoo/bfclpms'::text), 'Cover-sheet repository.'),
  ('dev_report.workstreams', to_jsonb(ARRAY['Scoring Engine','Org KPI','Incentive Engine','Multi-Month Cycle','Identity & Access Console (IAC)','Safety Module','Hub Platform','Implementation Console','Data Governance Registry','Functional Manager workflow']), 'Cover-sheet workstreams.')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.report_registry (report_id, report_key, module_prefix, display_name, canonical_route, menu_key, description, is_active, sort_order)
VALUES (
  'RPT-DEV-001','dev-report','DEV','Development Report','/reports/dev-report','reports-dev-report',
  'Project development evidence (features, bugs, timeline) — exportable as the 4-sheet PMS Digitalisation Self Evidence workbook.',
  true, 9000
)
ON CONFLICT (report_id) DO NOTHING;

INSERT INTO public.report_field_registry (report_id, field_key, default_label, default_sort, is_required, is_renamable) VALUES
  ('RPT-DEV-001','feature.entry_date',  'Date / Period', 10, true,  true),
  ('RPT-DEV-001','feature.title',       'Feature',       20, true,  true),
  ('RPT-DEV-001','feature.module_area', 'Module / Area', 30, false, true),
  ('RPT-DEV-001','feature.description', 'What Was Built',40, true,  true),
  ('RPT-DEV-001','feature.status',      'Status',        50, false, true),
  ('RPT-DEV-001','bug.entry_date',      'Date / Period', 110, true,  true),
  ('RPT-DEV-001','bug.title',           'Bug / Issue',   120, true,  true),
  ('RPT-DEV-001','bug.description',     'Fix Description',130, true, true),
  ('RPT-DEV-001','bug.severity',        'Severity',      140, false, true),
  ('RPT-DEV-001','timeline.entry_date', 'Date / Period', 210, true,  true),
  ('RPT-DEV-001','timeline.title',      'Item',          220, true,  true),
  ('RPT-DEV-001','timeline.description','Summary',       230, true,  true),
  ('RPT-DEV-001','timeline.timeline_type','Type',        240, false, true)
ON CONFLICT (report_id, field_key) DO NOTHING;
