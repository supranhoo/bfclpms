import { useSystemSetting } from '@/hooks/useSystemSettings';

const DEFAULT_MAX_MB = 5;

export function useUploadLimits() {
  const { data, isLoading } = useSystemSetting('max_upload_size_mb');

  let maxFileSizeMb = DEFAULT_MAX_MB;

  if (data?.setting_value) {
    const value = data.setting_value;
    if (typeof value === 'number') {
      maxFileSizeMb = value;
    } else if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/^"|"$/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        maxFileSizeMb = parsed;
      }
    }
  }

  return {
    maxFileSizeMb,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    isLoading,
  };
}
