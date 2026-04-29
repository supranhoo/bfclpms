import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useActiveProfilesLite } from '@/hooks/useSafetyOrg';

const STAGE_TO_EVIDENCE: Record<SafetyIncidentStatus, EvidenceStage | null> = {
  reported: 'report',
  assigned: 'assignment',
  investigation: 'investigation',
  rca: 'rca',
  corrective_action: 'capa',
  verification: 'verification',
  closed: null,
  orphaned: null,
};

export function StageActionPanel({ incident }: { incident: SafetyIncidentRow }) {
  const next = nextStage(incident.status);
  const stageEvidence = STAGE_TO_EVIDENCE[incident.status];

  const transition = useTransitionSafetyIncident();
  const addProgress = useAddProgressLog(incident.id);
  const upload = useUploadEvidence(incident.id);
  const saveNotes = useUpdateIncidentNotes(incident.id);
  const { data: profiles = [] } = useActiveProfilesLite();

  const [note, setNote] = useState('');
  const [assignTo, setAssignTo] = useState<string>('');
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stage: {SAFETY_STATUS_LABELS[incident.status]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {incident.status === 'reported' && (
          <div>
            <Label>Assign to *</Label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger><SelectValue placeholder="Select investigator" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email ?? p.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                (incident.status === 'reported' && !assignTo)
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