
CREATE TABLE public.privacy_consent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  consent_key text NOT NULL,
  consent_label text NOT NULL,
  purpose text NOT NULL,
  data_categories text,
  lawful_basis text NOT NULL DEFAULT 'consent',
  required boolean NOT NULL DEFAULT false,
  default_state text NOT NULL DEFAULT 'opt_out',
  dsar_contact_email text,
  policy_url text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT privacy_consent_settings_key_unique UNIQUE (consent_key),
  CONSTRAINT privacy_consent_settings_lawful_basis_valid CHECK (lawful_basis IN ('consent','contract','legitimate_interest','legal_obligation','vital_interest','public_task')),
  CONSTRAINT privacy_consent_settings_default_state_valid CHECK (default_state IN ('opt_in','opt_out'))
);

GRANT SELECT ON public.privacy_consent_settings TO authenticated;
GRANT ALL ON public.privacy_consent_settings TO service_role;

ALTER TABLE public.privacy_consent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read privacy consent settings"
  ON public.privacy_consent_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Platform owners manage privacy consent settings"
  ON public.privacy_consent_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::app_role));

CREATE INDEX idx_privacy_consent_settings_module ON public.privacy_consent_settings(module_key);

CREATE TRIGGER trg_privacy_consent_settings_updated_at
  BEFORE UPDATE ON public.privacy_consent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.privacy_consent_settings
  (module_key, consent_key, consent_label, purpose, data_categories, lawful_basis, required, default_state, dsar_contact_email, policy_url)
VALUES
  ('platform','platform.cookies.strictly_necessary','Strictly Necessary Cookies','Required for authentication, session, and security','session_id, csrf_token','contract',true,'opt_in',NULL,NULL),
  ('platform','platform.cookies.analytics','Analytics Cookies','Aggregate usage analytics to improve product','device_id, ip, page_views','consent',false,'opt_out',NULL,NULL),
  ('platform','platform.cookies.marketing','Marketing Cookies','Personalized marketing and retargeting','device_id, ip, ad_id','consent',false,'opt_out',NULL,NULL),
  ('platform','platform.marketing.email','Marketing Email','Product news, tips, and promotional emails','email, name','consent',false,'opt_out',NULL,NULL),
  ('platform','platform.marketing.sms','Marketing SMS','Promotional SMS messages','phone','consent',false,'opt_out',NULL,NULL),
  ('platform','platform.ai.training_optout','AI Model Training Opt-out','Use anonymized usage data to improve AI models','prompts, responses','legitimate_interest',false,'opt_out',NULL,NULL),
  ('platform','platform.ai.assistant_logging','AI Assistant Conversation Logging','Retain AI assistant chats for quality and debugging','prompts, responses, user_id','consent',false,'opt_out',NULL,NULL),
  ('platform','platform.dsar.contact','Data Subject Access Request Contact','Contact point for DSAR/erasure/portability requests','email','legal_obligation',true,'opt_in','privacy@example.com',NULL),
  ('platform','platform.telemetry.crash_reports','Crash & Error Telemetry','Collect crash and error reports for stability','stack_trace, device, app_version','consent',false,'opt_out',NULL,NULL),
  ('pms','pms.feedback.anonymous_share','Anonymous Feedback Sharing','Share anonymized feedback with leadership','feedback_text','consent',false,'opt_out',NULL,NULL),
  ('hrms','hrms.data_sharing.payroll_vendor','Payroll Vendor Data Sharing','Share employment data with payroll processor','name, pan, bank_account, salary','contract',true,'opt_in',NULL,NULL),
  ('hrms','hrms.data_sharing.background_check','Background Check Sharing','Share PII with background verification vendor','name, dob, address, id_proof','consent',false,'opt_in',NULL,NULL),
  ('safety','safety.incident.publish_anonymized','Publish Anonymized Incidents','Publish anonymized incident summaries internally','incident_description, location','legitimate_interest',false,'opt_out',NULL,NULL),
  ('incentive','incentive.payout.bank_share','Payout Bank Detail Sharing','Share bank details with payout processor','bank_account, ifsc, name','contract',true,'opt_in',NULL,NULL)
ON CONFLICT (consent_key) DO NOTHING;
