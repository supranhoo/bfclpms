-- Add daily aggregation method system setting
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'daily_aggregation_method',
  '"average"',
  'Aggregation method for Daily KPIs: "average" (simple average of values) or "missed_days_penalty" (score based on missed days: 5 for 0 missed, 4 for 1, etc.)'
)
ON CONFLICT (setting_key) DO NOTHING;