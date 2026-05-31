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
import { IncidentStageHeader } from '@/components/safety/IncidentStageHeader';
import { IncidentRcaPanel } from '@/components/safety/IncidentRcaPanel';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { SafetySkeletonBlock } from '@/components/safety/SafetySkeletonBlock';

export default function SafetyIncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: incident, isLoading, error } = useSafetyIncident(id);
  const { data: settings = [] } = useSafetySettings();
  const uiV2 = settings.find((r) => r.key === 'ui_incident_v2')?.value === true;

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 w-full">
        <SafetySkeletonBlock variant="detail" />
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
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 w-full">
      <Button variant="ghost" size="sm" className="min-h-[40px]" onClick={() => navigate('/safety/incidents')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Back to incidents</span>
        <span className="sm:hidden">Back</span>
      </Button>

      <Card data-incident-layout={uiV2 ? 'v2' : 'legacy'}>
        <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground font-mono">{incident.incident_number}</p>
              <CardTitle className="text-lg sm:text-xl">{incident.title}</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {SAFETY_TYPE_LABELS[incident.incident_type]} • Severity {SAFETY_SEVERITY_LABELS[incident.severity]} • {incident.location}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <SafetyStatusBadge status={incident.status} />
              <SlaBadge state={incident.sla_state} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-3">
          {uiV2 && <IncidentStageHeader status={incident.status} />}
          <div>
            <h3 className="text-sm font-medium mb-1">Description</h3>
            <p className="text-sm whitespace-pre-wrap">{incident.description}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Reported</p>
              <p className="text-xs sm:text-sm">{format(new Date(incident.created_at), 'dd MMM yyyy, HH:mm')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Acknowledge by</p>
              <p className="text-xs sm:text-sm">{format(new Date(incident.acknowledge_due_at), 'dd MMM yyyy, HH:mm')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Close by</p>
              <p className="text-xs sm:text-sm">{format(new Date(incident.close_due_at), 'dd MMM yyyy, HH:mm')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Involved</p>
              <p className="text-xs sm:text-sm">{incident.involved_person_name ?? '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {uiV2 && <IncidentRcaPanel incident={incident} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StageActionPanel incident={incident} />
        <Card>
          <CardHeader><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
          <CardContent><IncidentTimeline incidentId={incident.id} grouped={uiV2} /></CardContent>
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