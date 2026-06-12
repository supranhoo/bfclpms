import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { SafetyIncidentStatus } from '@/lib/safetyIncidents';
import {
  compressImageFile,
  formatSavings,
  shouldShowSavingsToast,
} from '@/lib/imageCompression';
import { useImageCompressionSettings } from '@/hooks/useImageCompressionSettings';
import { useSafetyIncident } from '@/hooks/useSafetyIncidents';
import {
  buildEvidenceDisplayName,
  nextEvidenceSequence,
  safeEmployeeCode,
} from '@/lib/safetyEvidenceNaming';

export interface TimelineRow {
  id: string;
  incident_id: string;
  from_status: SafetyIncidentStatus | null;
  to_status: SafetyIncidentStatus;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
}

export function useIncidentTimeline(incidentId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'incident', incidentId, 'timeline'],
    enabled: !!incidentId,
    queryFn: async (): Promise<TimelineRow[]> => {
      const { data, error } = await supabase
        .from('safety_incident_timeline')
        .select('*')
        .eq('incident_id', incidentId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimelineRow[];
    },
  });
}

export interface ProgressLogRow {
  id: string;
  incident_id: string;
  stage: SafetyIncidentStatus;
  note: string;
  logged_by: string;
  created_at: string;
}

export function useIncidentProgress(incidentId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'incident', incidentId, 'progress'],
    enabled: !!incidentId,
    queryFn: async (): Promise<ProgressLogRow[]> => {
      const { data, error } = await supabase
        .from('safety_incident_progress_logs')
        .select('*')
        .eq('incident_id', incidentId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProgressLogRow[];
    },
  });
}

export function useAddProgressLog(incidentId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ stage, note }: { stage: SafetyIncidentStatus; note: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('safety_incident_progress_logs').insert({
        incident_id: incidentId,
        stage,
        note,
        logged_by: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Progress logged');
      qc.invalidateQueries({ queryKey: ['safety', 'incident', incidentId] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to log progress'),
  });
}

export type EvidenceStage = 'report' | 'assignment' | 'investigation' | 'rca' | 'capa' | 'verification';

export interface EvidenceRow {
  id: string;
  incident_id: string;
  stage: EvidenceStage;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  uploaded_at: string;
  /** Phase 3 — preserved on first upload; never changes after rename. */
  original_file_name?: string | null;
}

const ALLOWED_MIME = /^(image\/.+|video\/mp4|application\/pdf)$/;
const MAX_BYTES = 20 * 1024 * 1024;

export function useIncidentEvidence(incidentId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'incident', incidentId, 'evidence'],
    enabled: !!incidentId,
    queryFn: async (): Promise<EvidenceRow[]> => {
      const { data, error } = await supabase
        .from('safety_incident_evidence')
        .select('*')
        .eq('incident_id', incidentId!)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EvidenceRow[];
    },
  });
}

export function useUploadEvidence(incidentId: string) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const { enabled: compressionEnabled, policy: compressionPolicy } =
    useImageCompressionSettings();
  const { data: incident } = useSafetyIncident(incidentId);
  return useMutation({
    mutationFn: async ({ file, stage }: { file: File; stage: EvidenceStage }) => {
      if (!user) throw new Error('Not authenticated');
      if (file.size > MAX_BYTES) throw new Error('File exceeds 20 MB limit');
      if (!ALLOWED_MIME.test(file.type)) throw new Error('Only images, MP4, or PDF files are allowed');

      // Phase A — best-effort client-side compression.
      const compResult = await compressImageFile(file, {
        enabled: compressionEnabled,
        policy: compressionPolicy,
        severityHint: incident?.severity ?? null,
      });
      const out = compResult.file;

      // Storage path keeps a sanitized form of the ORIGINAL filename for
      // technical traceability; the user-facing display name is auto-generated.
      const safeName = out.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${user.id}/${incidentId}/${stage}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('safety-media')
        .upload(path, out, { contentType: out.type });
      if (upErr) throw upErr;

      // Generate the standardized display name: {StageLabel}_{EmployeeCode}_v{n}.
      const employeeCode = safeEmployeeCode(profile?.employee_code, user.id);
      const { data: existing } = await supabase
        .from('safety_incident_evidence')
        .select('stage, uploaded_by, file_name')
        .eq('incident_id', incidentId);
      const sequence = nextEvidenceSequence({
        rows: (existing ?? []) as Array<{ stage: EvidenceStage; uploaded_by: string; file_name: string }>,
        stage,
        uploadedBy: user.id,
        employeeCode,
      });
      const displayName = buildEvidenceDisplayName({ stage, employeeCode, sequence });

      const { error: insErr } = await supabase.from('safety_incident_evidence').insert({
        incident_id: incidentId,
        stage,
        file_path: path,
        file_name: displayName,
        original_file_name: out.name,
        mime_type: out.type,
        size_bytes: out.size,
        uploaded_by: user.id,
      } as never);
      if (insErr) throw insErr;
      return compResult;
    },
    onSuccess: (compResult) => {
      toast.success('Evidence uploaded');
      if (compResult && shouldShowSavingsToast(compResult)) {
        toast.message(formatSavings(compResult));
      }
      qc.invalidateQueries({ queryKey: ['safety', 'incident', incidentId] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Upload failed'),
  });
}

export async function getEvidenceSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('safety-media')
    .createSignedUrl(filePath, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Phase 3 — Rename the *display* name of an uploaded evidence file.
 * Storage path is immutable; only `file_name` changes. Original filename is
 * preserved server-side in `original_file_name` for audit. Only the original
 * uploader can rename — the SECURITY DEFINER RPC enforces this.
 */
export function useRenameIncidentEvidence(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ evidenceId, newName }: { evidenceId: string; newName: string }) => {
      const { data, error } = await supabase.rpc(
        'rename_incident_evidence' as never,
        { p_evidence_id: evidenceId, p_new_file_name: newName } as never,
      );
      if (error) throw error;
      const result = data as { ok: boolean; error?: string; file_name?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'Rename failed');
      return result;
    },
    onSuccess: () => {
      toast.success('Evidence renamed');
      qc.invalidateQueries({ queryKey: ['safety', 'incident', incidentId, 'evidence'] });
      qc.invalidateQueries({ queryKey: ['safety', 'audit-log'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Rename failed'),
  });
}

export type IncidentNotesPatch = {
  rca_summary?: string;
  capa_summary?: string;
  verification_notes?: string;
};

export function useUpdateIncidentNotes(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: IncidentNotesPatch) => {
      const { error } = await supabase
        .from('safety_incidents')
        .update(patch as never)
        .eq('id', incidentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['safety', 'incident', incidentId] });
      qc.invalidateQueries({ queryKey: ['safety', 'incidents'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to save'),
  });
}