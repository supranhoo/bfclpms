/**
 * ADR-205 — configurable PIP SLA thresholds (Zero-Hardcoding rule).
 *
 * These previously lived as literals in `useSystemIssues.ts`
 * (`pip: {warning: 7, critical: 14}`, `pip_milestone: {warning: 0, critical: 7}`)
 * and nowhere at all for the reminder cron. They are now admin-configurable
 * `system_settings` rows read by both the dashboard and the scheduled job.
 */
import { supabase } from '@/integrations/supabase/client';

export const PIP_SLA_KEYS = {
  milestoneLeadDays: 'pip_milestone_lead_days',
  milestoneOverdueDays: 'pip_milestone_overdue_days',
  pipWarningDays: 'pip_sla_warning_days',
  pipCriticalDays: 'pip_sla_critical_days',
} as const;

export interface PipSlaSettings {
  milestoneLeadDays: number;
  milestoneOverdueDays: number;
  pipWarningDays: number;
  pipCriticalDays: number;
}

export const DEFAULT_PIP_SLA: PipSlaSettings = {
  milestoneLeadDays: 3,
  milestoneOverdueDays: 7,
  pipWarningDays: 7,
  pipCriticalDays: 14,
};

export function parseDays(raw: unknown, fallback: number): number {
  let v: unknown = raw;
  if (typeof v === 'string') {
    const n = Number(v.replace(/^"|"$/g, '').trim());
    v = Number.isFinite(n) ? n : NaN;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 365) return 365;
  return Math.round(v);
}

export async function getPipSlaSettings(): Promise<PipSlaSettings> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_key, setting_value')
    .in('setting_key', Object.values(PIP_SLA_KEYS));
  if (error) throw error;

  const map = new Map((data ?? []).map(r => [r.setting_key, r.setting_value]));
  return {
    milestoneLeadDays: parseDays(map.get(PIP_SLA_KEYS.milestoneLeadDays), DEFAULT_PIP_SLA.milestoneLeadDays),
    milestoneOverdueDays: parseDays(map.get(PIP_SLA_KEYS.milestoneOverdueDays), DEFAULT_PIP_SLA.milestoneOverdueDays),
    pipWarningDays: parseDays(map.get(PIP_SLA_KEYS.pipWarningDays), DEFAULT_PIP_SLA.pipWarningDays),
    pipCriticalDays: parseDays(map.get(PIP_SLA_KEYS.pipCriticalDays), DEFAULT_PIP_SLA.pipCriticalDays),
  };
}

export async function setPipSlaSettings(patch: Partial<PipSlaSettings>): Promise<void> {
  const rows = Object.entries(patch)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({
      setting_key: PIP_SLA_KEYS[k as keyof PipSlaSettings],
      setting_value: parseDays(v, DEFAULT_PIP_SLA[k as keyof PipSlaSettings]) as unknown as never,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('system_settings')
    .upsert(rows, { onConflict: 'setting_key' });
  if (error) throw error;
}
