import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useSafetyIncident } from '@/hooks/useSafetyIncidents';
import { useSafetyRealtimeSync } from '@/hooks/useSafetyRealtimeSync';
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
import { OrphanIncidentDialog } from '@/components/safety/OrphanIncidentDialog';
import { RoutingChainDisplay } from '@/components/safety/RoutingChainDisplay';
import { IncidentSlaPanel } from '@/components/safety/IncidentSlaPanel';

export default function SafetyIncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [reviveOpen, setReviveOpen] = useState(false);
  // Scoped realtime: incidents row + everything the timeline/evidence
  // sections render. Avoids subscribing to permits/training/etc.
  useSafetyRealtimeSync(true, [
    'safety_incidents',
    'safety_incident_status_history',
    'safety_incident_evidence',
    'safety_incident_progress_log',
  ]);
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
          <RoutingChainDisplay
            buHeadId={incident.routed_bu_head_id ?? null}
            managerId={incident.routed_manager_id ?? null}
            secondManagerId={incident.routed_second_manager_id ?? null}
            routingStatus={incident.routing_status ?? null}
          />
        </CardContent>
      </Card>

      {incident.status === 'orphaned' && (
        <Card className="border-destructive/40">
          <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Orphaned incident
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <p className="text-sm text-muted-foreground mb-3">
              This incident has no active owner. Safety Admin or Safety Head can revive it by reassigning to an active employee.
            </p>
            <Button variant="destructive" onClick={() => setReviveOpen(true)}>
              Revive &amp; Reassign
            </Button>
          </CardContent>
        </Card>
      )}

      {uiV2 && <IncidentRcaPanel incident={incident} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IncidentSlaPanel incident={incident} />
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

      <OrphanIncidentDialog
        incident={incident.status === 'orphaned' ? incident : null}
        open={reviveOpen}
        onOpenChange={setReviveOpen}
      />
    </div>
  );
}