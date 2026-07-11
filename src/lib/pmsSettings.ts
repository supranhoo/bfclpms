import { supabase } from '@/integrations/supabase/client';

/**
 * PMS-scoped settings helpers backed by `system_settings` (key/value).
 *
 * Keys owned here:
 *  - pms_pip_threshold : numeric (0..5). Employees whose Final-Only average
 *    monthly PMS score is strictly below this number are flagged as PIP
 *    candidates in the Monthly Scorecard Trend report.
 */

export const PMS_PIP_THRESHOLD_KEY = 'pms_pip_threshold';
export const DEFAULT_PIP_THRESHOLD = 3.0;

/** Parse & clamp a raw system_settings value into a valid threshold. */
export function parsePipThreshold(raw: unknown): number {
  if (raw == null) return DEFAULT_PIP_THRESHOLD;
  let v: unknown = raw;
  if (typeof v === 'string') {
    const stripped = v.replace(/^"|"$/g, '').trim();
    const n = Number(stripped);
    v = Number.isFinite(n) ? n : NaN;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_PIP_THRESHOLD;
  if (v < 0) return 0;
  if (v > 5) return 5;
  return Math.round(v * 100) / 100;
}

export async function getPipThreshold(): Promise<number> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', PMS_PIP_THRESHOLD_KEY)
    .maybeSingle();
  if (error) throw error;
  return parsePipThreshold(data?.setting_value ?? null);
}

export async function setPipThreshold(value: number): Promise<void> {
  const clean = parsePipThreshold(value);
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      { setting_key: PMS_PIP_THRESHOLD_KEY, setting_value: clean },
      { onConflict: 'setting_key' },
    );
  if (error) throw error;
}