import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  SafetyAssetStatus,
} from '@/lib/safetyAssets';

/**
 * Phase 4 data layer for the safety asset register.
 *
 * Cache prefix: ['safety','assets'] — invalidated by useSafetyRealtimeSync
 * on any change to safety_assets / safety_asset_calibrations / safety_asset_evidence.
 *
 * Mutations: assets are created/edited via plain table writes (RLS gates writes
 * to admin/safety_head/safety_officer). Calibrations always go through the
 * `record_calibration` RPC so the asset row & history stay in sync.
 */

export interface SafetyAssetRow {
  id: string;
  asset_code: string;
  name: string;
  category: string;
  business_unit_id: string | null;
  department_id: string | null;
  location: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_no: string | null;
  install_date: string | null;
  calibration_required: boolean;
  calibration_interval_days: number | null;
  last_calibration_at: string | null;
  calibration_expires_at: string | null;
  status: SafetyAssetStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyAssetCalibrationRow {
  id: string;
  asset_id: string;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_at: string;
  next_due_at: string;
  certificate_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface SafetyAssetEvidenceRow {
  id: string;
  asset_id: string;
  kind: 'photo' | 'manual' | 'certificate' | 'other';
  file_path: string;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export function useSafetyAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'asset', assetId ?? 'none'],
    enabled: !!assetId,
    queryFn: async (): Promise<SafetyAssetRow> => {
      const { data, error } = await supabase
        .from('safety_assets')
        .select('*')
        .eq('id', assetId!)
        .single();
      if (error) throw error;
      return data as SafetyAssetRow;
    },
  });
}

export function useAssetCalibrations(assetId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'asset-calibrations', assetId ?? 'none'],
    enabled: !!assetId,
    queryFn: async (): Promise<SafetyAssetCalibrationRow[]> => {
      const { data, error } = await supabase
        .from('safety_asset_calibrations')
        .select('*')
        .eq('asset_id', assetId!)
        .order('performed_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as SafetyAssetCalibrationRow[];
    },
  });
}

export function useAssetEvidence(assetId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'asset-evidence', assetId ?? 'none'],
    enabled: !!assetId,
    queryFn: async (): Promise<SafetyAssetEvidenceRow[]> => {
      const { data, error } = await supabase
        .from('safety_asset_evidence')
        .select('*')
        .eq('asset_id', assetId!)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SafetyAssetEvidenceRow[];
    },
  });
}

/* ─────────────────────────────────── mutations ─── */

export interface CreateAssetInput {
  asset_code: string;
  name: string;
  category: string;
  business_unit_id?: string | null;
  department_id?: string | null;
  location?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_no?: string | null;
  install_date?: string | null;
  calibration_required: boolean;
  calibration_interval_days?: number | null;
  status?: SafetyAssetStatus;
  notes?: string | null;
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAssetInput): Promise<SafetyAssetRow> => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('safety_assets')
        .insert({
          ...input,
          status: input.status ?? 'active',
          created_by: u.user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as SafetyAssetRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['safety', 'assets'] });
    },
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { id: string } & Partial<CreateAssetInput>,
    ): Promise<SafetyAssetRow> => {
      const { id, ...patch } = input;
      const { data, error } = await supabase
        .from('safety_assets')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as SafetyAssetRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['safety', 'assets'] });
      qc.invalidateQueries({ queryKey: ['safety', 'asset', row.id] });
    },
  });
}

export interface RecordCalibrationInput {
  asset_id: string;
  performed_at: string;        // ISO
  next_due_at: string;         // ISO
  certificate_url?: string | null;
  notes?: string | null;
  performed_by_name?: string | null;
}

export function useRecordCalibration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordCalibrationInput) => {
      const { data, error } = await supabase.rpc('record_calibration', {
        p_asset_id: input.asset_id,
        p_performed_at: input.performed_at,
        p_next_due_at: input.next_due_at,
        p_certificate_url: input.certificate_url ?? null,
        p_notes: input.notes ?? null,
        p_performed_by_name: input.performed_by_name ?? null,
      });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string; calibration_id?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'record_calibration_failed');
      return result;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['safety', 'assets'] });
      qc.invalidateQueries({ queryKey: ['safety', 'asset', vars.asset_id] });
      qc.invalidateQueries({ queryKey: ['safety', 'asset-calibrations', vars.asset_id] });
    },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('safety_assets').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['safety', 'assets'] });
    },
  });
}