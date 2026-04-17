
-- Phase 1 audit: add missing indexes on RLS-critical columns
CREATE INDEX IF NOT EXISTS idx_access_profile_org_scope_profile_id ON public.access_profile_org_scope(profile_id);
CREATE INDEX IF NOT EXISTS idx_access_profiles_created_by ON public.access_profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_kpi_level_assignments_auditor_id ON public.audit_kpi_level_assignments(auditor_id);
CREATE INDEX IF NOT EXISTS idx_backup_logs_created_by ON public.backup_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_reports_created_by ON public.custom_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_employee_job_descriptions_created_by ON public.employee_job_descriptions(created_by);
CREATE INDEX IF NOT EXISTS idx_import_progress_user_id ON public.import_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_incentive_programs_created_by ON public.incentive_programs(created_by);
CREATE INDEX IF NOT EXISTS idx_incentive_score_revisions_employee_id ON public.incentive_score_revisions(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_templates_created_by ON public.kpi_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_password_rollout_logs_user_id ON public.password_rollout_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee_id ON public.performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_review_period_auto_rules_created_by ON public.review_period_auto_rules(created_by);
CREATE INDEX IF NOT EXISTS idx_skill_competencies_employee_id ON public.skill_competencies(employee_id);
CREATE INDEX IF NOT EXISTS idx_template_bundles_created_by ON public.template_bundles(created_by);
CREATE INDEX IF NOT EXISTS idx_workflow_config_created_by ON public.workflow_config(created_by);
