import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useSafetyIncident } from '@/hooks/useSafetyIncidents';
import { SafetyStatusBadge } from '@/components/safety/StatusBadge';
import { SlaBadge } from '@/components/safety/SlaBadge';
import { StageActionPanel } from '@/components/safety/StageActionPanel';
import { IncidentTimeline } from '@/components/safety/IncidentTimeline';
import { EvidenceList } from '@/components/safety/EvidenceList';
import { ProgressLogList } from '@/components/safety/ProgressLogList';
import { SAFETY_SEVERITY_LABELS, SAFETY_TYPE_LABELS } from '@/lib/safetyIncidents';
import { format } from 'date-fns';

export default function SafetyIncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: incident, isLoading, error } = useSafetyIncident(id);

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !incident) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/safety/incidents')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-sm text-destructive mt-4">
          {error ? (error as Error).message : 'Incident not found or you do not have access.'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate('/safety/incidents')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to incidents
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground font-mono">{incident.incident_number}</p>
              <CardTitle className="text-xl">{incident.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {SAFETY_TYPE_LABELS[incident.incident_type]} • Severity {SAFETY_SEVERITY_LABELS[incident.severity]} • {incident.location}
              </p>
            </div>
            <div className="flex gap-2">
              <SafetyStatusBadge status={incident.status} />
              <SlaBadge state={incident.sla_state} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h3 className="text-sm font-medium mb-1">Description</h3>
            <p className="text-sm whitespace-pre-wrap">{incident.description}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Reported</p>
              <p>{format(new Date(incident.created_at), 'dd MMM yyyy, HH:mm')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Acknowledge by</p>
              <p>{format(new Date(incident.acknowledge_due_at), 'dd MMM yyyy, HH:mm')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Close by</p>
              <p>{format(new Date(incident.close_due_at), 'dd MMM yyyy, HH:mm')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Involved</p>
              <p>{incident.involved_person_name ?? '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StageActionPanel incident={incident} />
        <Card>
          <CardHeader><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
          <CardContent><IncidentTimeline incidentId={incident.id} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Evidence</CardTitle></CardHeader>
          <CardContent><EvidenceList incidentId={incident.id} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Progress Log</CardTitle></CardHeader>
          <CardContent><ProgressLogList incidentId={incident.id} /></CardContent>
        </Card>
      </div>
    </div>
  );
}