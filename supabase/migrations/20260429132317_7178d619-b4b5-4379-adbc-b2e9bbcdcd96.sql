
CREATE TABLE IF NOT EXISTS public.safety_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.safety_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_settings REPLICA IDENTITY FULL;

CREATE POLICY safety_settings_select
  ON public.safety_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY safety_settings_write
  ON public.safety_settings FOR ALL
  TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  )
  WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  );

-- Auto-update updated_at + updated_by on every write
CREATE OR REPLACE FUNCTION public.safety_settings_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS safety_settings_touch_trg ON public.safety_settings;
CREATE TRIGGER safety_settings_touch_trg
  BEFORE INSERT OR UPDATE ON public.safety_settings
  FOR EACH ROW EXECUTE FUNCTION public.safety_settings_touch();

-- Seed defaults
INSERT INTO public.safety_settings (key, value, description) VALUES
  ('ptw_expiry_warning_hours', '2'::jsonb,
    'Hours before PTW end_at to fire permit_expiring_soon notification.'),
  ('training_overdue_escalation_days', '3'::jsonb,
    'Days after due_at before an overdue training assignment is escalated.'),
  ('audit_compliance_thresholds',
    '{"excellent":90,"good":75,"fair":60}'::jsonb,
    'Score cutoffs for the audit compliance bands (Excellent/Good/Fair/Poor).'),
  ('emergency_ack_window_minutes', '5'::jsonb,
    'Minutes within which a user must ACK an emergency to avoid the defaulter list.'),
  ('drill_required_per_year', '4'::jsonb,
    'Minimum number of emergency drills expected per business unit per year.'),
  ('asset_calibration_alert_days',
    '[7,1,0]'::jsonb,
    'Day-offsets (T-N) at which asset-calibration sweep should fire reminders.')
ON CONFLICT (key) DO NOTHING;

-- Typed get/set RPCs (avoid every page reaching into the table directly)
CREATE OR REPLACE FUNCTION public.get_safety_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.safety_settings WHERE key = p_key;
$$;

CREATE OR REPLACE FUNCTION public.set_safety_setting(p_key text, p_value jsonb, p_description text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  INSERT INTO public.safety_settings(key, value, description)
  VALUES (p_key, p_value, p_description)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = COALESCE(EXCLUDED.description, public.safety_settings.description);

  RETURN jsonb_build_object('ok', true, 'key', p_key, 'value', p_value);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_safety_setting(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_safety_setting(text, jsonb, text) TO authenticated;
