-- Insert email notification settings into system_settings table
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES 
  ('email_notifications_enabled', '"disabled"', 'Master toggle for email notifications (enabled/disabled)'),
  ('email_sender_name', '"PMS Notifications"', 'Display name for email sender'),
  ('email_sender_address', '"onboarding@resend.dev"', 'Sender email address for notifications'),
  ('email_notification_events', '["kpi_submitted", "manager_approved", "manager_rejected", "query_raised", "query_resolved", "final_approved"]', 'List of enabled email notification event types')
ON CONFLICT (setting_key) DO NOTHING;