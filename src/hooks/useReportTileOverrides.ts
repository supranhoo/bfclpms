import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';

export interface ReportTileOverride {
  title?: string;
  description?: string;
}

export type ReportTileOverridesMap = Record<string, ReportTileOverride>;

/**
 * Per-report-tile title/description overrides.
 * Stored in system_settings under key `report_tile_overrides`
 * as a JSON object keyed by reportKey (e.g. "performance", "custom_<uuid>").
 * Falls back to defaults supplied by the caller when an entry is missing.
 */
export function useReportTileOverrides() {
  const settingKey = 'report_tile_overrides';
  const { data, isLoading } = useSystemSetting(settingKey);
  const updateSetting = useUpdateSystemSetting();

  let overrides: ReportTileOverridesMap = {};
  if (data?.setting_value) {
    try {
      const val = data.setting_value;
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        overrides = parsed as ReportTileOverridesMap;
      }
    } catch {
      overrides = {};
    }
  }

  const persist = (next: ReportTileOverridesMap) => {
    updateSetting.mutate({ key: settingKey, value: JSON.stringify(next) });
  };

  const getOverride = (reportKey: string): ReportTileOverride | undefined =>
    overrides[reportKey];

  const saveOverride = (reportKey: string, value: ReportTileOverride) => {
    const next: ReportTileOverridesMap = { ...overrides, [reportKey]: value };
    persist(next);
  };

  const clearOverride = (reportKey: string) => {
    const next: ReportTileOverridesMap = { ...overrides };
    delete next[reportKey];
    persist(next);
  };

  return {
    overrides,
    getOverride,
    saveOverride,
    clearOverride,
    isLoading,
    isSaving: updateSetting.isPending,
  };
}

/**
 * Pure helper used by tests and components to merge defaults + overrides.
 */
export function applyTileOverride(
  reportKey: string,
  defaults: { title: string; description: string },
  overrides: ReportTileOverridesMap | null | undefined,
): { title: string; description: string } {
  const o = overrides?.[reportKey];
  return {
    title: o?.title?.trim() ? o.title : defaults.title,
    description:
      typeof o?.description === 'string' ? o.description : defaults.description,
  };
}