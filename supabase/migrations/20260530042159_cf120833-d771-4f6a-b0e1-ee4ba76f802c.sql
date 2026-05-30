ALTER TABLE public.safety_settings
ADD COLUMN IF NOT EXISTS ui_incident_v2 BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS incident_stage_copy JSONB DEFAULT '{}';

UPDATE public.safety_settings
SET incident_stage_copy = '{
  "reported": {"title": "Incident Reported", "hint": "Awaiting initial review and classification."},
  "under_investigation": {"title": "Under Investigation", "hint": "Root cause analysis in progress."},
  "awaiting_correction": {"title": "Awaiting Corrective Action", "hint": "CAPA plan pending approval."},
  "closed": {"title": "Closed", "hint": "Incident resolved and verified."}
}'::jsonb
WHERE key = 'safety_default';