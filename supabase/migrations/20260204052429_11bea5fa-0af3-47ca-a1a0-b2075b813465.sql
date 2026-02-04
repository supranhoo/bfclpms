-- Add SMTP configuration settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('email_provider', '"resend"', 'Email provider: resend or smtp'),
  ('smtp_host', '""', 'SMTP server hostname'),
  ('smtp_port', '587', 'SMTP server port'),
  ('smtp_security', '"tls"', 'SMTP security: tls, starttls, or none'),
  ('smtp_username', '""', 'SMTP authentication username'),
  ('smtp_from_address', '""', 'SMTP from email address'),
  ('smtp_from_name', '""', 'SMTP from display name')
ON CONFLICT (setting_key) DO NOTHING;