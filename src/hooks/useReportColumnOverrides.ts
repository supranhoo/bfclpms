import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';

export interface ColumnOverride {
  key: string;
  alias?: string;
  visible: boolean;
  width?: string;
}

/**
 * Hook to read/write per-report column overrides from system_settings.
 * Setting key: report_columns_{reportKey}
 * Falls back to null (use hardcoded defaults) if no override exists.
 */
export function useReportColumnOverrides(reportKey: string) {
  const settingKey = `report_columns_${reportKey}`;
  const { data, isLoading } = useSystemSetting(settingKey);
  const updateSetting = useUpdateSystemSetting();

  let overrides: ColumnOverride[] | null = null;
  if (data?.setting_value) {
    try {
      const val = data.setting_value;
      if (typeof val === 'string') {
        overrides = JSON.parse(val);
      } else if (Array.isArray(val)) {
        overrides = val as ColumnOverride[];
      }
    } catch {
      overrides = null;
    }
  }

  const saveOverrides = (columns: ColumnOverride[]) => {
    updateSetting.mutate({ key: settingKey, value: JSON.stringify(columns) });
  };

  return { overrides, isLoading, saveOverrides, isSaving: updateSetting.isPending };
}

/**
 * Hook to read/write global report display order from system_settings.
 * Setting key: report_display_order
 * Value: JSON array of report keys e.g. ["employee-summary","performance","custom_abc"]
 */
export function useReportDisplayOrder() {
  const { data, isLoading } = useSystemSetting('report_display_order');
  const updateSetting = useUpdateSystemSetting();

  let order: string[] | null = null;
  if (data?.setting_value) {
    try {
      const val = data.setting_value;
      if (typeof val === 'string') {
        order = JSON.parse(val);
      } else if (Array.isArray(val)) {
        order = val as string[];
      }
    } catch {
      order = null;
    }
  }

  const saveOrder = (newOrder: string[]) => {
    updateSetting.mutate({ key: 'report_display_order', value: JSON.stringify(newOrder) });
  };

  return { order, isLoading, saveOrder, isSaving: updateSetting.isPending };
}
