/**
 * Safety Evidence — Automatic Display Naming
 * ------------------------------------------
 * Generates standardized, audit-friendly display names for evidence files:
 *
 *     {StageLabel}_{EmployeeCode}_v{Sequence}
 *
 * Examples: Reported_101966_v1, RCA_101966_v2, CAPA_101966_v1
 *
 * - The display name is what the user sees in lists, previews, downloads,
 *   exports and audit logs. The original filename is preserved server-side
 *   in `safety_incident_evidence.original_file_name` for traceability.
 * - Storage paths remain immutable and based on a sanitized original
 *   filename — only the display name is auto-generated.
 * - Once generated, the display name is immutable for that evidence row;
 *   later workflow stage changes never rename existing evidence.
 */

import type { EvidenceStage } from '@/hooks/useSafetyIncidentDetail';

/** Stage → human label used in the auto-generated display name. */
export const EVIDENCE_STAGE_DISPLAY_LABEL: Record<EvidenceStage, string> = {
  report: 'Reported',
  assignment: 'Assignment',
  investigation: 'Investigation',
  rca: 'RCA',
  capa: 'CAPA',
  verification: 'Verification',
};

export interface EvidenceLikeRow {
  stage: EvidenceStage;
  uploaded_by: string;
  file_name: string;
}

/** Fallback when the uploader has no employee_code set on their profile. */
export function safeEmployeeCode(code: string | null | undefined, userId: string): string {
  const trimmed = (code ?? '').trim();
  if (trimmed) return trimmed.replace(/[^a-zA-Z0-9]/g, '');
  // Fall back to a short, opaque id slice — keeps the convention parseable.
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/**
 * Compute the next sequence number for (incident, stage, employee).
 *
 * We count any existing row whose display name starts with the canonical
 * `{label}_{code}` prefix AND was uploaded by the same user at the same
 * stage. This is robust to historical rows that pre-date auto-naming
 * (they simply don't match the prefix and don't shift the counter).
 */
export function nextEvidenceSequence(args: {
  rows: EvidenceLikeRow[];
  stage: EvidenceStage;
  uploadedBy: string;
  employeeCode: string;
}): number {
  const label = EVIDENCE_STAGE_DISPLAY_LABEL[args.stage];
  const prefix = `${label}_${args.employeeCode}`;
  let max = 0;
  for (const r of args.rows) {
    if (r.stage !== args.stage) continue;
    if (r.uploaded_by !== args.uploadedBy) continue;
    if (!r.file_name?.startsWith(prefix)) continue;
    const m = r.file_name.match(/_v(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    } else if (r.file_name === prefix) {
      // Legacy unsuffixed match — treat as v1.
      if (max < 1) max = 1;
    }
  }
  return max + 1;
}

export function buildEvidenceDisplayName(args: {
  stage: EvidenceStage;
  employeeCode: string;
  sequence: number;
}): string {
  const label = EVIDENCE_STAGE_DISPLAY_LABEL[args.stage];
  return `${label}_${args.employeeCode}_v${args.sequence}`;
}