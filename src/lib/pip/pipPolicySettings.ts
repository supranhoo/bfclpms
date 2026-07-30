/**
 * ADR-207 — admin-configurable PIP policy parameters (Zero-Hardcoding rule).
 * Backed by `system_settings`; seeded by the ADR-207 migration.
 */
import { supabase } from '@/integrations/supabase/client';

export const PIP_POLICY_KEYS = {
  requireRm2Approval: 'pip_require_rm2_approval',
  minDurationDays: 'pip_min_duration_days',
  maxDurationDays: 'pip_max_duration_days',
  monitorMonths: 'pip_monitor_months',
} as const;

export interface PipPolicySettings {
  requireRm2Approval: boolean;
  minDurationDays: number;
  maxDurationDays: number;
  monitorMonths: number;
}

export const DEFAULT_PIP_POLICY: PipPolicySettings = {
  requireRm2Approval: true,
  minDurationDays: 30,
  maxDurationDays: 90,
  monitorMonths: 3,
};

function num(raw: unknown, fallback: number, max: number): number {
  let v: unknown = raw;
  if (typeof v === 'string') {
    const n = Number(v.replace(/^"|"$/g, '').trim());
    v = Number.isFinite(n) ? n : NaN;
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.round(v), max);
}

function bool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const s = raw.replace(/^"|"$/g, '').trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return fallback;
}

export function parsePipPolicy(map: Map<string, unknown>): PipPolicySettings {
  return {
    requireRm2Approval: bool(map.get(PIP_POLICY_KEYS.requireRm2Approval), DEFAULT_PIP_POLICY.requireRm2Approval),
    minDurationDays: num(map.get(PIP_POLICY_KEYS.minDurationDays), DEFAULT_PIP_POLICY.minDurationDays, 365),
    maxDurationDays: num(map.get(PIP_POLICY_KEYS.maxDurationDays), DEFAULT_PIP_POLICY.maxDurationDays, 365),
    monitorMonths: num(map.get(PIP_POLICY_KEYS.monitorMonths), DEFAULT_PIP_POLICY.monitorMonths, 24),
  };
}

export async function getPipPolicySettings(): Promise<PipPolicySettings> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_key, setting_value')
    .in('setting_key', Object.values(PIP_POLICY_KEYS));
  if (error) throw error;
  return parsePipPolicy(new Map((data ?? []).map(r => [r.setting_key, r.setting_value as unknown])));
}