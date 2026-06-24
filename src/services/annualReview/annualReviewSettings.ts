import { supabase } from '@/integrations/supabase/client';

/** Keys used in `public.annual_review_settings`. */
export const AR_SETTING_KEYS = {
  showReviewerNamesInStepper: 'show_reviewer_names_in_stepper',
  autoReassignHrOnBuHeadChange: 'auto_reassign_hr_on_bu_head_change',
} as const;

export type ArSettingKey = (typeof AR_SETTING_KEYS)[keyof typeof AR_SETTING_KEYS];

/** Reads a boolean setting, falling back to `fallback` when absent. */
export async function getBoolSetting(key: ArSettingKey, fallback = false): Promise<boolean> {
  const { data, error } = await supabase
    .from('annual_review_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return fallback;
  return data.value === true || data.value === 'true';
}

/** Upserts a boolean setting. Admin-only at the RLS layer. */
export async function setBoolSetting(key: ArSettingKey, value: boolean): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('annual_review_settings')
    .select('id')
    .eq('key', key)
    .maybeSingle();
  if (selErr) throw selErr;

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? null;

  if (existing) {
    const { error } = await supabase
      .from('annual_review_settings')
      .update({ value, updated_by: uid })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('annual_review_settings')
      .insert({ key, value, updated_by: uid });
    if (error) throw error;
  }
}

export const getShowReviewerNamesInStepper = () =>
  getBoolSetting(AR_SETTING_KEYS.showReviewerNamesInStepper, false);

export const setShowReviewerNamesInStepper = (value: boolean) =>
  setBoolSetting(AR_SETTING_KEYS.showReviewerNamesInStepper, value);

export const getAutoReassignHrOnBuHeadChange = () =>
  getBoolSetting(AR_SETTING_KEYS.autoReassignHrOnBuHeadChange, false);

export const setAutoReassignHrOnBuHeadChange = (value: boolean) =>
  setBoolSetting(AR_SETTING_KEYS.autoReassignHrOnBuHeadChange, value);