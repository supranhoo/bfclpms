/**
 * ADR-220 — admin calibration of the Annual Review Final Rating (/5).
 * Service layer: every write goes through an admin-gated SECURITY DEFINER RPC.
 */
import { supabase } from '@/integrations/supabase/client';

export const BULK_CALIBRATION_LIMIT = 500;

function assertReason(reason: string) {
  if (!reason || !reason.trim()) throw new Error('A reason is required for calibration');
}

function assertRating(rating: number) {
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
    throw new Error('Calibrated rating must be between 0 and 5');
  }
}

export async function calibrateFinalRating(
  instanceId: string,
  rating: number,
  reason: string,
): Promise<void> {
  assertReason(reason);
  assertRating(rating);
  const { error } = await supabase.rpc('admin_calibrate_final_rating', {
    p_instance_id: instanceId,
    p_rating: Math.round(rating * 100) / 100,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

export async function clearFinalRatingCalibration(
  instanceId: string,
  reason: string,
): Promise<void> {
  assertReason(reason);
  const { error } = await supabase.rpc('admin_clear_final_rating_calibration', {
    p_instance_id: instanceId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

export async function bulkCalibrateFinalRating(
  instanceIds: string[],
  rating: number,
  reason: string,
): Promise<number> {
  assertReason(reason);
  assertRating(rating);
  if (instanceIds.length === 0) return 0;
  if (instanceIds.length > BULK_CALIBRATION_LIMIT) {
    throw new Error(`Bulk calibration is limited to ${BULK_CALIBRATION_LIMIT} employees per action`);
  }
  const { error } = await supabase.rpc('admin_bulk_calibrate_final_rating', {
    p_instance_ids: instanceIds,
    p_rating: Math.round(rating * 100) / 100,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return instanceIds.length;
}
