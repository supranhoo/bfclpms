INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('max_upload_size_mb', '5', 'Maximum file upload size in MB for evidence and attachments')
ON CONFLICT (setting_key) DO NOTHING;