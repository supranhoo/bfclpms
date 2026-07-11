import { supabase } from '@/integrations/supabase/client';

export const PROXY_SELFIE_BUCKET = 'proxy-selfies';

export async function checkProxyEligibility(instanceId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !instanceId) return false;
  const { data, error } = await supabase.rpc('can_proxy_submit_annual_review', {
    _instance_id: instanceId,
    _proxy_user_id: user.id,
  });
  if (error) return false;
  return Boolean(data);
}

export interface SubmitWithAssistanceArgs {
  instanceId: string;
  employeeUserId: string;
  proxyRoleLabel: string;
  /**
   * Live selfie of the employee. Optional when the admin has switched the
   * `assisted_selfie_required` flag off — in that case no upload is attempted
   * and the audit row is written with `selfie_path = NULL`.
   */
  selfieBlob?: Blob | null;
  /**
   * Uploaded photograph (from device gallery / file picker). Optional when
   * the admin has switched the `assisted_photo_upload_required` flag off.
   * When present it is stored under the same `proxy-selfies` bucket with a
   * `photos/` prefix; when absent the audit row records `photo_upload_path = NULL`.
   */
  photoUploadBlob?: Blob | null;
  photoUploadContentType?: string | null;
  declarationText: string;
  userAgent?: string;
}

/**
 * Captures the selfie, writes an immutable audit row, then advances the self stage
 * through `submit_annual_review_self_as_proxy`. On any failure after the upload,
 * the uploaded object is best-effort removed so we don't leak orphan selfies.
 */
export async function submitWithAssistance(args: SubmitWithAssistanceArgs): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let path: string | null = null;
  if (args.selfieBlob) {
    path = `${args.instanceId}/${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(PROXY_SELFIE_BUCKET)
      .upload(path, args.selfieBlob, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error(`Selfie upload failed: ${upErr.message}`);
  }

  let photoPath: string | null = null;
  if (args.photoUploadBlob) {
    const ext = (args.photoUploadContentType ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
    photoPath = `${args.instanceId}/photos/${Date.now()}.${ext}`;
    const { error: photoErr } = await supabase.storage
      .from(PROXY_SELFIE_BUCKET)
      .upload(photoPath, args.photoUploadBlob, {
        contentType: args.photoUploadContentType ?? 'image/jpeg',
        upsert: false,
      });
    if (photoErr) {
      if (path) void supabase.storage.from(PROXY_SELFIE_BUCKET).remove([path]);
      throw new Error(`Photo upload failed: ${photoErr.message}`);
    }
  }

  try {
    const { data: audit, error: insErr } = await supabase
      .from('annual_review_proxy_submissions')
      .insert({
        instance_id: args.instanceId,
        employee_user_id: args.employeeUserId,
        proxy_user_id: user.id,
        proxy_role: args.proxyRoleLabel,
        selfie_path: path,
        photo_upload_path: photoPath,
        declaration_text: args.declarationText,
        user_agent: args.userAgent ?? null,
      })
      .select('id')
      .single();
    if (insErr || !audit) throw new Error(insErr?.message ?? 'Audit insert failed');

    const { data: next, error: advErr } = await supabase.rpc(
      'submit_annual_review_self_as_proxy',
      { p_instance_id: args.instanceId, p_proxy_submission_id: audit.id },
    );
    if (advErr) throw new Error(advErr.message);
    return next as string;
  } catch (e) {
    // Rollback the orphan uploads if any were made.
    if (path) void supabase.storage.from(PROXY_SELFIE_BUCKET).remove([path]);
    if (photoPath) void supabase.storage.from(PROXY_SELFIE_BUCKET).remove([photoPath]);
    throw e;
  }
}

export async function getProxyAuditForInstance(instanceId: string) {
  const { data, error } = await supabase
    .from('annual_review_proxy_submissions')
    .select('id, proxy_user_id, proxy_role, selfie_path, captured_at, declaration_text, user_agent')
    .eq('instance_id', instanceId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSignedSelfieUrl(path: string, expiresSec = 300): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PROXY_SELFIE_BUCKET)
    .createSignedUrl(path, expiresSec);
  if (error) return null;
  return data?.signedUrl ?? null;
}