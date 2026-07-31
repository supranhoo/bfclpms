/**
 * ADR-217 / POLICY §AR-SYSTEM-SCORE-ADMIN-CORRECTION.
 *
 * Admin-only correction path for Annual Review System Score raw values.
 * Unlike the monotonic bulk-upload path (`admin_apply_system_scores_upgrade`,
 * ADR-171) this RPC accepts corrections in BOTH directions and works on any
 * status — including `completed` — because a wrong measurement must be
 * fixable. Every change is audit-logged with a mandatory reason and the
 * final score/rating is recomputed server-side.
 */
import { supabase } from '@/integrations/supabase/client';
import type { TemplateSystemScore } from '@/types/annualReview';
import { scoreFromRaw } from '@/lib/annualReview/systemKpiScoring';

/** A slot the admin may correct — carry_kra slots are computed live and excluded. */
export function editableSystemScoreSlots(
  slots: TemplateSystemScore[] | null | undefined,
): TemplateSystemScore[] {
  return (slots ?? []).filter((s) => s.source !== 'carry_kra');
}

/** Raw → points using the template bands (SSOT: `scoreFromRaw`). */
export function pointsForRaw(slot: TemplateSystemScore, raw: number) {
  return scoreFromRaw(raw, slot.scoring_rules ?? null, slot.weight);
}

export interface SystemScoreEditPayload {
  instanceId: string;
  /** slotId → new raw value. Only CHANGED slots should be supplied. */
  raw: Record<string, number>;
  /** slotId → derived points. */
  points: Record<string, number>;
  /** slotId → display name (audit readability). */
  names: Record<string, string>;
  reason: string;
}

export interface SystemScoreEditResult {
  instance_id: string;
  applied: unknown[];
  total_score: number | null;
  final_rating: string | null;
  changed: boolean;
}

/** Build the payload from the current stored raws and the admin's edits. */
export function buildEditPayload(args: {
  instanceId: string;
  slots: TemplateSystemScore[];
  storedRaw: Record<string, number>;
  drafts: Record<string, string>;
  reason: string;
}): SystemScoreEditPayload {
  const raw: Record<string, number> = {};
  const points: Record<string, number> = {};
  const names: Record<string, string> = {};
  for (const slot of editableSystemScoreSlots(args.slots)) {
    const entered = args.drafts[slot.id];
    if (entered === undefined || entered === null || entered === '') continue;
    const next = Number(entered);
    if (!Number.isFinite(next)) continue;
    const before = args.storedRaw[slot.id];
    if (before !== undefined && before !== null && Number(before) === next) continue;
    raw[slot.id] = next;
    points[slot.id] = Number(pointsForRaw(slot, next).points.toFixed(4));
    names[slot.id] = slot.name;
  }
  return { instanceId: args.instanceId, raw, points, names, reason: args.reason };
}

export async function adminUpdateSystemScoresRaw(
  payload: SystemScoreEditPayload,
): Promise<SystemScoreEditResult> {
  const { data, error } = await supabase.rpc('admin_update_system_scores_raw' as never, {
    p_instance_id: payload.instanceId as never,
    p_system_scores: payload.points as never,
    p_system_scores_raw: payload.raw as never,
    p_slot_names: payload.names as never,
    p_reason: payload.reason as never,
  } as never);
  if (error) throw error;
  return data as unknown as SystemScoreEditResult;
}
