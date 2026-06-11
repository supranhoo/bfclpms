import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, Upload } from 'lucide-react';
import {
  nextStage,
  SAFETY_STATUS_LABELS,
  type SafetyIncidentStatus,
} from '@/lib/safetyIncidents';
import { useTransitionSafetyIncident, type SafetyIncidentRow } from '@/hooks/useSafetyIncidents';
import {
  useAddProgressLog,
  useUploadEvidence,
  useUpdateIncidentNotes,
  type EvidenceStage,
} from '@/hooks/useSafetyIncidentDetail';
import { SafetyUserPicker } from '@/components/safety/SafetyUserPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useSafetyPermissions } from '@/hooks/useSafetyPermissions';
import { useSafetySettings } from '@/hooks/useSafetySettings';

const STAGE_TO_EVIDENCE: Record<SafetyIncidentStatus, EvidenceStage | null> = {
  reported: 'report',
  management_review: null,
  assigned: 'assignment',
  investigation: 'investigation',
  rca: 'rca',
  corrective_action: 'capa',
  safety_head_review: null,
  verification: 'verification',
  closed: null,
  orphaned: null,
};

/**
 * Returns the set of user IDs that are the "responsible actor(s)" for the
 * current stage. Anyone NOT in this set sees the panel as read-only — even if
 * they're elsewhere on the routing chain (e.g. BU Head after they've handed
 * off to an investigator).
 *
 * Kept data-driven from the incident row itself (no role hardcoding) so admin
 * routing config remains the source of truth.
 */
function stageResponsibleIds(
  incident: SafetyIncidentRow,
  globalSafetyHeadId: string | null,
): Array<string | null | undefined> {
  switch (incident.status) {
    case 'reported':
    case 'management_review':
      // Routing chain owns triage/assignment.
      return [
        incident.routed_bu_head_id,
        incident.routed_manager_id,
        incident.routed_second_manager_id,
        incident.safety_head_id ?? globalSafetyHeadId,
      ];
    case 'assigned':
    case 'investigation':
    case 'rca':
    case 'corrective_action':
      // Investigator owns fact-finding through CAPA.
      return [incident.assigned_to];
    case 'safety_head_review':
      // Only the configured Safety Head may act here. Fall back to the
      // globally configured Safety Head if no specific one was stamped
      // on the incident at report time.
      return [incident.safety_head_id ?? globalSafetyHeadId];
    case 'verification':
      return [incident.verifier_id];
    default:
      return [];
  }
}

export function StageActionPanel({ incident }: { incident: SafetyIncidentRow }) {
  const next = nextStage(incident.status);
  const stageEvidence = STAGE_TO_EVIDENCE[incident.status];
  const { user } = useAuth();
  const { can } = useSafetyPermissions();
  const { data: settings = [] } = useSafetySettings();
  const globalSafetyHeadId = (() => {
    const row = settings.find((s) => s.key === 'global_safety_head_id');
    const v = row?.value as unknown;
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
      const inner = (v as Record<string, unknown>).value;
      return typeof inner === 'string' ? inner : null;
    }
    return null;
  })();

  const transition = useTransitionSafetyIncident();
  const addProgress = useAddProgressLog(incident.id);
  const upload = useUploadEvidence(incident.id);
  const saveNotes = useUpdateIncidentNotes(incident.id);

  const [note, setNote] = useState('');
  const [assignTo, setAssignTo] = useState<string>('');
  const [verifier, setVerifier] = useState<string>(incident.verifier_id ?? '');
  const [rca, setRca] = useState(incident.rca_summary ?? '');
  const [capa, setCapa] = useState(incident.capa_summary ?? '');
  const [verNotes, setVerNotes] = useState(incident.verification_notes ?? '');

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>, stage: EvidenceStage) => {
    const f = e.target.files?.[0];
    if (!f) return;
    upload.mutate({ file: f, stage });
    e.target.value = '';
  };

  const advance = async () => {
    if (!next) return;
    if (incident.status === 'rca' && rca !== (incident.rca_summary ?? '')) {
      await saveNotes.mutateAsync({ rca_summary: rca });
    }
    if (incident.status === 'corrective_action' && capa !== (incident.capa_summary ?? '')) {
      await saveNotes.mutateAsync({ capa_summary: capa });
    }
    if (incident.status === 'verification' && verNotes !== (incident.verification_notes ?? '')) {
      await saveNotes.mutateAsync({ verification_notes: verNotes });
    }
    transition.mutate({
      incidentId: incident.id,
      toStatus: next,
      notes: note || undefined,
      assignedTo: next === 'assigned' ? assignTo || undefined : undefined,
      verifierId: next === 'verification' ? verifier || undefined : undefined,
    });
  };

  if (incident.status === 'closed') {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Closed</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">This incident is closed.</p></CardContent>
      </Card>
    );
  }
  if (incident.status === 'orphaned') {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Orphaned</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No owner identified. Contact Safety Head.</p></CardContent>
      </Card>
    );
  }

  // Gate the action panel to the stage's responsible actor. Admins and users
  // with the explicit `action.incidents.override` permission can still act
  // (e.g. to unblock a stuck workflow). Everyone else sees a read-only note.
  const uid = user?.id ?? null;
  const responsible = stageResponsibleIds(incident, globalSafetyHeadId);
  const isResponsible = !!uid && responsible.some((r) => r === uid);
  // For the Safety Head Review stage we deliberately ignore the generic
  // override permission: assigning the verifier and advancing to verification
  // must be done by the configured Safety Head only. Any other user (including
  // the investigator who just handed the ticket back) sees a read-only note.
  const canOverride =
    incident.status === 'safety_head_review' ? false : can('action.incidents.override');
  if (!isResponsible && !canOverride) {
    const owner = responsible.find((r): r is string => !!r);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage: {SAFETY_STATUS_LABELS[incident.status]}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {owner
              ? 'Waiting on the responsible reviewer for this stage to act. You will see actions here when it returns to you.'
              : 'No actor is assigned for this stage yet.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stage: {SAFETY_STATUS_LABELS[incident.status]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {incident.status === 'management_review' && (
          <div>
            <Label>Assign to *</Label>
            <SafetyUserPicker
              value={assignTo}
              onChange={setAssignTo}
              placeholder="Select investigator"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Selected worker becomes the investigator for this incident.
            </p>
          </div>
        )}
        {incident.status === 'safety_head_review' && (
          <div>
            <Label>Assign Verifier *</Label>
            <SafetyUserPicker
              value={verifier}
              onChange={setVerifier}
              placeholder="Select verifier"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Verifier confirms corrective actions before closure (may differ from the investigator).
            </p>
          </div>
        )}
        {incident.status === 'rca' && (
          <div>
            <Label>Root Cause Analysis</Label>
            <Textarea rows={4} value={rca} onChange={(e) => setRca(e.target.value)} placeholder="Document the root cause(s)…" />
          </div>
        )}
        {incident.status === 'corrective_action' && (
          <div>
            <Label>Corrective & Preventive Action (CAPA)</Label>
            <Textarea rows={4} value={capa} onChange={(e) => setCapa(e.target.value)} placeholder="Describe corrective and preventive actions…" />
          </div>
        )}
        {incident.status === 'verification' && (
          <div>
            <Label>Verification Notes *</Label>
            <Textarea rows={4} value={verNotes} onChange={(e) => setVerNotes(e.target.value)} placeholder="Verify CAPA effectiveness before closure…" />
            <p className="text-xs text-muted-foreground mt-1">Required to close. Closure also needs ≥1 verification evidence file and ≥1 progress log.</p>
          </div>
        )}
        {stageEvidence && (
          <div>
            <Label className="block mb-1">Upload {stageEvidence} evidence</Label>
            <label className="inline-flex items-center gap-2 text-sm border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-accent/40">
              <Upload className="h-4 w-4" />
              Choose file
              <input
                type="file"
                accept="image/*,video/mp4,application/pdf"
                onChange={(e) => onPickFile(e, stageEvidence)}
                className="hidden"
                disabled={upload.isPending}
              />
            </label>
          </div>
        )}
        <div>
          <Label>Add progress note</Label>
          <Textarea
            rows={2}
            placeholder="Quick note about this stage…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                const target = e.currentTarget;
                const value = target.value.trim();
                if (value) {
                  addProgress.mutate({ stage: incident.status, note: value });
                  target.value = '';
                }
              }
            }}
          />
          <p className="text-xs text-muted-foreground mt-1">Press ⌘/Ctrl+Enter to save the note.</p>
        </div>
        {next && (
          <div className="border-t pt-4 space-y-2">
            <Label>Transition note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you advancing?" />
            <Button
              onClick={advance}
              disabled={
                transition.isPending ||
                saveNotes.isPending ||
                (incident.status === 'management_review' && !assignTo) ||
                (incident.status === 'safety_head_review' && !verifier)
              }
              className="w-full"
            >
              {transition.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Advance to {SAFETY_STATUS_LABELS[next]}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}