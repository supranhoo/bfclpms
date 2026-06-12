import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShieldAlert, Copy as CopyIcon, CheckCircle2 } from 'lucide-react';
import {
  useSafetyIncident,
  useMySafetyRoleRows,
} from '@/hooks/useSafetyIncidents';
import { useSafetyRealtimeSync } from '@/hooks/useSafetyRealtimeSync';
import { SafetyStatusBadge } from '@/components/safety/StatusBadge';
import { SlaBadge } from '@/components/safety/SlaBadge';
import { StageActionPanel } from '@/components/safety/StageActionPanel';
import { IncidentTimeline } from '@/components/safety/IncidentTimeline';
import { EvidenceList } from '@/components/safety/EvidenceList';
import { ProgressLogList } from '@/components/safety/ProgressLogList';
import { SAFETY_SEVERITY_LABELS, SAFETY_TYPE_LABELS } from '@/lib/safetyIncidents';

/**
 * Render the configured snapshot label if present (so admin renames or
 * deletes never alter past records), otherwise fall back to the legacy
 * enum label.
 */
function renderTypeLabel(i: { incident_type?: string | null; type_label_snapshot?: string | null }) {
  return i.type_label_snapshot
    ?? (i.incident_type ? (SAFETY_TYPE_LABELS as Record<string, string>)[i.incident_type] ?? i.incident_type : '—');
}
function renderSeverityLabel(i: { severity?: string | null; severity_label_snapshot?: string | null }) {
  return i.severity_label_snapshot
    ?? (i.severity ? (SAFETY_SEVERITY_LABELS as Record<string, string>)[i.severity] ?? i.severity : '—');
}
import { format } from 'date-fns';
import { IncidentStageHeader } from '@/components/safety/IncidentStageHeader';
import { IncidentRcaPanel } from '@/components/safety/IncidentRcaPanel';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { SafetySkeletonBlock } from '@/components/safety/SafetySkeletonBlock';
import { OrphanIncidentDialog } from '@/components/safety/OrphanIncidentDialog';
import { RoutingChainDisplay } from '@/components/safety/RoutingChainDisplay';
import { IncidentSlaPanel } from '@/components/safety/IncidentSlaPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useSafetyPermissions } from '@/hooks/useSafetyPermissions';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MarkDuplicateDialog } from '@/components/safety/MarkDuplicateDialog';
import { CloseDuplicateDialog } from '@/components/safety/CloseDuplicateDialog';

export default function SafetyIncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [reviveOpen, setReviveOpen] = useState(false);
  const [markDupOpen, setMarkDupOpen] = useState(false);
  const [closeDupOpen, setCloseDupOpen] = useState(false);
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
  const { user } = useAuth();
  const { can } = useSafetyPermissions();
  const { data: myRoleRows = [] } = useMySafetyRoleRows();

  // Hydrate reporter + actual-reporter profile data for the detail header.
  const reporterIds = [incident?.reporter_id, (incident as any)?.actual_reporter_id]
    .filter(Boolean) as string[];
  const { data: reporterProfiles = [] } = useQuery({
    queryKey: ['safety', 'incident-detail-reporters', reporterIds.sort().join(',')],
    enabled: reporterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .in('id', reporterIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const reporterProfile = reporterProfiles.find((p: any) => p.id === incident?.reporter_id) as any;
  const actualReporterProfile = (incident as any)?.actual_reporter_id
    ? reporterProfiles.find((p: any) => p.id === (incident as any).actual_reporter_id) as any
    : null;

  // Phase 2 — duplicate handling fields (added to safety_incidents schema).
  const dupOfId = (incident as any)?.duplicate_of_id as string | null | undefined;
  const markedDupAt = (incident as any)?.marked_duplicate_at as string | null | undefined;
  const isMarkedDuplicate = !!markedDupAt;

  // Hydrate the master-incident number for the banner link (single small query).
  const { data: masterRows = [] } = useQuery({
    queryKey: ['safety', 'incident-duplicate-master', dupOfId ?? 'none'],
    enabled: !!dupOfId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_incidents')
        .select('id, incident_number, title, status')
        .eq('id', dupOfId!)
        .limit(1);
      if (error) throw error;
      return data ?? [];
    },
  });
  const masterIncident = masterRows[0] as
    | { id: string; incident_number: string | null; title: string; status: string }
    | undefined;

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

  // Visibility of stage actions, SLA, evidence & progress log is controlled
  // by the configurable `action.incidents.view_internals` permission key
  // (manage from Safety > Settings > Permissions). Anyone explicitly on the
  // routing/assignment chain for this incident always sees the internals so
  // they can act on it.
  const uid = user?.id ?? null;
  const isOnRoutingChain = !!uid && (
    incident.assigned_to === uid ||
    incident.routed_bu_head_id === uid ||
    incident.routed_manager_id === uid ||
    incident.routed_second_manager_id === uid ||
    incident.safety_head_id === uid ||
    incident.verifier_id === uid
  );
  const canSeeFullDetail = can('action.incidents.view_internals') || isOnRoutingChain;

  // Phase 2 — show "Mark as duplicate" only to BU Heads of this incident's
  // business unit (or admin override). Server RPC re-validates this.
  const isAdminRole = myRoleRows.some((r) => r.role === 'admin');
  const isSafetyHeadRole = myRoleRows.some((r) => r.role === 'safety_head');
  const isBuHeadHere =
    isAdminRole ||
    myRoleRows.some(
      (r) =>
        r.role === 'bu_head' &&
        (r.business_unit_id == null || r.business_unit_id === incident.business_unit_id),
    );
  const canMarkDuplicate =
    isBuHeadHere && !isMarkedDuplicate && incident.status !== 'closed' && incident.status !== 'orphaned';
  const canCloseDuplicate =
    (isSafetyHeadRole || isAdminRole) && isMarkedDuplicate && incident.status !== 'closed';

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
                {renderTypeLabel(incident as never)} • Severity {renderSeverityLabel(incident as never)} • {incident.location}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm pt-1 border-t">
            <div>
              <p className="text-xs text-muted-foreground">Reported by</p>
              <p className="text-xs sm:text-sm">
                {reporterProfile?.full_name ?? '—'}
                {reporterProfile?.employee_code && (
                  <span className="ml-1 font-mono text-muted-foreground">
                    ({reporterProfile.employee_code})
                  </span>
                )}
              </p>
            </div>
            {actualReporterProfile && (
              <div>
                <p className="text-xs text-muted-foreground">On behalf of</p>
                <p className="text-xs sm:text-sm">
                  {actualReporterProfile.full_name}
                  {actualReporterProfile.employee_code && (
                    <span className="ml-1 font-mono text-muted-foreground">
                      ({actualReporterProfile.employee_code})
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
          <RoutingChainDisplay
            buHeadId={incident.routed_bu_head_id ?? null}
            managerId={incident.routed_manager_id ?? null}
            secondManagerId={incident.routed_second_manager_id ?? null}
            routingStatus={incident.routing_status ?? null}
          />
        </CardContent>
      </Card>

      {isMarkedDuplicate && (
        <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10">
          <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <CopyIcon className="h-4 w-4" /> Marked as duplicate
              {incident.status === 'closed' && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-normal">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Closed by Safety Head
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-2 text-sm">
            {masterIncident ? (
              <p>
                Linked to master incident{' '}
                <button
                  type="button"
                  onClick={() => navigate(`/safety/incidents/${masterIncident.id}`)}
                  className="font-mono underline text-primary"
                >
                  {masterIncident.incident_number}
                </button>{' '}
                — {masterIncident.title}
              </p>
            ) : (
              <p className="text-muted-foreground">Master incident link unavailable.</p>
            )}
            {(incident as any).duplicate_remarks && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                <span className="font-medium text-foreground">Remarks: </span>
                {(incident as any).duplicate_remarks}
              </p>
            )}
            {markedDupAt && (
              <p className="text-xs text-muted-foreground">
                Marked on {format(new Date(markedDupAt), 'dd MMM yyyy, HH:mm')}
              </p>
            )}
            {canCloseDuplicate && (
              <div className="pt-1">
                <Button size="sm" onClick={() => setCloseDupOpen(true)}>
                  Close duplicate
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canMarkDuplicate && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setMarkDupOpen(true)}>
            <CopyIcon className="h-4 w-4 mr-2" />
            Mark as duplicate
          </Button>
        </div>
      )}

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

      {canSeeFullDetail ? (
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
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
          <CardContent><IncidentTimeline incidentId={incident.id} grouped={uiV2} /></CardContent>
        </Card>
      )}

      <OrphanIncidentDialog
        incident={incident.status === 'orphaned' ? incident : null}
        open={reviveOpen}
        onOpenChange={setReviveOpen}
      />

      <MarkDuplicateDialog
        open={markDupOpen}
        onOpenChange={setMarkDupOpen}
        incident={incident}
      />
      <CloseDuplicateDialog
        open={closeDupOpen}
        onOpenChange={setCloseDupOpen}
        incident={incident}
      />
    </div>
  );
}