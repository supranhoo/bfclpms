import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Plus, FileDown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useManualQuery, type ManualQueryFetcherArgs } from '@/hooks/useManualQuery';
import { useSafetyRealtimeSync } from '@/hooks/useSafetyRealtimeSync';
import { SafetyFilterSheet } from '@/components/safety/SafetyFilterSheet';
import { SafetyResponsiveList } from '@/components/safety/SafetyResponsiveList';
import { SafetyMobileListCard } from '@/components/safety/SafetyMobileListCard';
import { SafetyStickyActionBar } from '@/components/safety/SafetyStickyActionBar';
import { SafetyActiveFilterChips, type SafetyFilterChip } from '@/components/safety/SafetyActiveFilterChips';
import { SafetyStatusBadge } from '@/components/safety/StatusBadge';
import { SlaBadge } from '@/components/safety/SlaBadge';
import { OrphanIncidentDialog } from '@/components/safety/OrphanIncidentDialog';
import {
  SAFETY_SEVERITY_LABELS,
  SAFETY_TYPE_LABELS,
  SAFETY_SLA_STATUS_LABELS,
  SAFETY_SLA_STATUS_TONE,
} from '@/lib/safetyIncidents';
import {
  useSafetyIncidentTypes,
  useSafetyIncidentSeverities,
} from '@/hooks/useSafetyIncidentTypes';
import { useBusinessUnits } from '@/hooks/useSafetyOrg';
import { MultiSelectId } from '@/components/ui/multi-select-id';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import {
  DATE_RANGE_PRESETS,
  DATE_RANGE_PRESET_LABELS,
  resolveDateRange,
  type DateRangePreset,
} from '@/lib/safetyDateRangePresets';
import { Badge } from '@/components/ui/badge';
import type { SafetyIncidentRow } from '@/hooks/useSafetyIncidents';
import { useMySafetyRoleRows } from '@/hooks/useSafetyIncidents';
import { useAuth } from '@/contexts/AuthContext';
import {
  exportIncidentsToExcel,
  MAX_INCIDENT_EXPORT_ROWS,
} from '@/lib/safetyIncidentExcelExport';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict } from 'date-fns';

/**
 * Safety Incidents — POLICY §113 / ADR-050.
 * Filters first, click Search to load, paginated server-side.
 */

const STATUS_OPTIONS = [
  'reported', 'management_review', 'assigned', 'investigation', 'rca',
  'corrective_action', 'safety_head_review', 'verification', 'closed', 'orphaned',
] as const;
const SLA_STATUS_OPTIONS = [
  'on_track', 'at_risk', 'overdue', 'closed_on_time', 'closed_late',
] as const;

const STATUS_LABEL = (s: string) => s.replace(/_/g, ' ');

interface IncidentFilters {
  statuses: string[];
  /** safety_incident_severities.id[] */
  severityIds: string[];
  /** safety_incident_types.id[] */
  typeIds: string[];
  /** business_units.id[] */
  buIds: string[];
  /** Resolved type names (snapshot at submit time) — drives whether the
   *  fetcher hydrates involved-person profiles. NOT part of the WHERE clause. */
  typeNames: string[];
  slaStatuses: string[];
  search: string;
  datePreset: DateRangePreset;
  customFrom: string | null;
  customTo: string | null;
}

const INITIAL: IncidentFilters = {
  statuses: [],
  severityIds: [],
  typeIds: [],
  buIds: [],
  typeNames: [],
  slaStatuses: [],
  search: '',
  datePreset: 'all',
  customFrom: null,
  customTo: null,
};

async function fetchIncidentsPage({
  filters, range,
}: ManualQueryFetcherArgs<IncidentFilters>): Promise<{ rows: SafetyIncidentRow[]; total: number }> {
  let q = supabase
    .from('safety_incidents_with_sla' as never)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(range[0], range[1]);

  if (filters.statuses.length) q = q.in('status', filters.statuses);
  if (filters.severityIds.length) q = q.in('severity_id', filters.severityIds);
  if (filters.typeIds.length) q = q.in('incident_type_id', filters.typeIds);
  if (filters.slaStatuses.length) q = q.in('sla_status', filters.slaStatuses);
  if (filters.buIds.length) q = q.in('business_unit_id', filters.buIds);
  const { from, to } = resolveDateRange(filters.datePreset, {
    customFrom: filters.customFrom,
    customTo: filters.customTo,
  });
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  if (filters.search.trim()) {
    const needle = filters.search.trim();
    q = q.or(
      `title.ilike.%${needle}%,location.ilike.%${needle}%,incident_number.ilike.%${needle}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as SafetyIncidentRow[];

  // Hydrate Business Unit name/code for display. The SLA view exposes
  // `business_unit_id` only — join client-side to avoid widening the view.
  const buIds = Array.from(
    new Set(rows.map((r) => r.business_unit_id).filter(Boolean) as string[]),
  );
  if (buIds.length) {
    const { data: bus } = await supabase
      .from('business_units')
      .select('id, name, code')
      .in('id', buIds);
    const map = new Map((bus ?? []).map((b: any) => [b.id, b]));
    for (const r of rows as any[]) {
      const bu = map.get(r.business_unit_id);
      if (bu) {
        r.business_unit_name = bu.name;
        r.business_unit_code = bu.code;
      }
    }
  }

  // Hydrate involved-person profile (employee_code + full_name) so the
  // Accident-filtered grid can surface the involved employee inline.
  //
  // Performance: skip this round-trip entirely unless the active type
  // filter resolves to an accident-style type. Without this guard the
  // join fires on EVERY page fetch — including types that never need
  // it — wasting one full profiles query per page. (Perf CAPA Wave 1.)
  const needsPersonHydration =
    filters.typeNames.some((n) => /accident/i.test(n));
  const personIds = needsPersonHydration
    ? Array.from(
        new Set(rows.map((r) => r.involved_person_id).filter(Boolean) as string[]),
      )
    : [];
  if (personIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, employee_code')
      .in('id', personIds);
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    for (const r of rows as any[]) {
      const p = pmap.get(r.involved_person_id);
      if (p) {
        r.involved_person_full_name = p.full_name;
        r.involved_person_employee_code = p.employee_code;
      }
    }
  }

  // Hydrate the reporter's name + employee code for the "Reported" column.
  // Always runs (vs. involved-person which is type-gated) because every row
  // surfaces this column. Single batched IN() — one round-trip per page.
  const reporterIds = Array.from(
    new Set(rows.map((r) => r.reporter_id).filter(Boolean) as string[]),
  );
  // Also hydrate the optional "actual reporter" (file-on-behalf-of).
  const actualIds = Array.from(
    new Set(rows.map((r: any) => r.actual_reporter_id).filter(Boolean) as string[]),
  );
  const allReporterIds = Array.from(new Set([...reporterIds, ...actualIds]));
  if (allReporterIds.length) {
    const { data: reporters } = await supabase
      .from('profiles')
      .select('id, full_name, employee_code')
      .in('id', allReporterIds);
    const rmap = new Map((reporters ?? []).map((p: any) => [p.id, p]));
    for (const r of rows as any[]) {
      const p = rmap.get(r.reporter_id);
      if (p) {
        r.reporter_full_name = p.full_name;
        r.reporter_employee_code = p.employee_code;
      }
      if (r.actual_reporter_id) {
        const ap = rmap.get(r.actual_reporter_id);
        if (ap) {
          r.actual_reporter_full_name = ap.full_name;
          r.actual_reporter_employee_code = ap.employee_code;
        }
      }
    }
  }

  return { rows, total: count ?? 0 };
}

export default function SafetyIncidents() {
  // Scoped realtime: only the tables this page renders. Cuts per-user
  // realtime cost vs. the legacy shell-level 20-table subscription.
  useSafetyRealtimeSync(true, ['safety_incidents', 'safety_incident_status_history']);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<IncidentFilters>(INITIAL);
  const [orphanTarget, setOrphanTarget] = useState<SafetyIncidentRow | null>(null);
  const [submittedTypeIds, setSubmittedTypeIds] = useState<string[]>([]);
  const [applied, setApplied] = useState<IncidentFilters | null>(null);

  const {
    rows, total, page, pageSize, totalPages,
    hasSubmitted, isLoading, isFetching,
    submit, reset, setPage, setPageSize,
  } = useManualQuery<SafetyIncidentRow, IncidentFilters>(
    ['safety', 'incidents', 'list'],
    fetchIncidentsPage,
  );

  const handleSubmit = () => {
    setSubmittedTypeIds(draft.typeIds);
    const names = draft.typeIds
      .map((id) => typeOptions.find((t) => t.id === id)?.name)
      .filter(Boolean) as string[];
    const next = { ...draft, typeNames: names };
    setApplied(next);
    submit(next);
  };
  const handleReset = () => { setDraft(INITIAL); setSubmittedTypeIds([]); setApplied(null); reset(); };

  // Dynamic dropdown sources — replaces the hardcoded type/severity lists.
  const { data: typeOptions = [] } = useSafetyIncidentTypes({ activeOnly: false });
  // Severities scope to the FIRST selected type when exactly one is picked
  // (preserves the existing cascading dropdown UX); cleared when 0 or >1
  // types are selected so the user sees no misleading subset.
  const severityScopeTypeId = draft.typeIds.length === 1 ? draft.typeIds[0] : null;
  const { data: severityOptions = [] } = useSafetyIncidentSeverities(
    severityScopeTypeId,
    { activeOnly: false },
  );
  const { data: businessUnits = [] } = useBusinessUnits();

  // Excel export — visible to Safety Head and Admin only. Reuses the
  // same view + filters as the list, so RLS + scope stay consistent.
  const { effectiveRole } = useAuth();
  const { data: myRoles = [] } = useMySafetyRoleRows();
  const canExportExcel =
    effectiveRole === 'admin' || myRoles.some((r) => r.role === 'safety_head');
  const [isExporting, setIsExporting] = useState(false);
  const handleExportExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const t = toast.loading('Preparing Excel export…');
    try {
      const { from, to } = resolveDateRange(draft.datePreset, {
        customFrom: draft.customFrom,
        customTo: draft.customTo,
      });
      const res = await exportIncidentsToExcel({
        statuses: draft.statuses,
        severityIds: draft.severityIds,
        typeIds: draft.typeIds,
        slaStatuses: draft.slaStatuses,
        buIds: draft.buIds,
        search: draft.search,
        from: from ?? undefined,
        to: to ?? undefined,
      });
      toast.success(
        res.capped
          ? `Exported first ${MAX_INCIDENT_EXPORT_ROWS.toLocaleString()} rows (cap reached) → ${res.fileName}`
          : `Exported ${res.rowCount.toLocaleString()} incident${res.rowCount === 1 ? '' : 's'} → ${res.fileName}`,
        { id: t },
      );
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, { id: t });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Show the "Involved Person" column when the submitted Type filter resolves
   * to an Accident-style incident type. Match by name (case-insensitive) so
   * admins renaming or adding accident variants (e.g. "Accident — Major")
   * still benefit without code changes — Zero-Hardcoding Rule.
   */
  const showInvolvedPerson = useMemo(() => {
    if (!submittedTypeIds.length) return false;
    return submittedTypeIds.some((id) => {
      const t = typeOptions.find((x) => x.id === id);
      return !!t && /accident/i.test(t.name);
    });
  }, [submittedTypeIds, typeOptions]);

  const openRow = (i: SafetyIncidentRow) => {
    if (i.status === 'orphaned') setOrphanTarget(i);
    else navigate(`/safety/incidents/${i.id}`);
  };

  const activeCount = useMemo(() => {
    let n = 0;
    if (draft.statuses.length) n++;
    if (draft.severityIds.length) n++;
    if (draft.typeIds.length) n++;
    if (draft.slaStatuses.length) n++;
    if (draft.buIds.length) n++;
    if (draft.datePreset !== 'all') n++;
    if (draft.search.trim()) n++;
    return n;
  }, [draft]);

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Safety Incidents
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            7-stage workflow: Reported → Assigned → Investigation → RCA → CAPA → Verification → Closed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExportExcel && (
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="hidden md:inline-flex"
              title="Export filtered incidents to Excel (Safety Head / Admin)"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              Export Excel
            </Button>
          )}
          <Button asChild className="hidden md:inline-flex">
            <Link to="/safety/incidents/new">
              <Plus className="h-4 w-4 mr-2" />
              Report Incident
            </Link>
          </Button>
        </div>
      </div>

      <SafetyFilterSheet
        onSubmit={handleSubmit}
        onReset={handleReset}
        isSubmitting={isFetching}
        activeCount={activeCount}
      >
        <MultiSelectFilter
          options={STATUS_OPTIONS.map((s) => STATUS_LABEL(s))}
          value={draft.statuses.map(STATUS_LABEL)}
          onChange={(labels) =>
            setDraft((d) => ({
              ...d,
              statuses: STATUS_OPTIONS.filter((s) => labels.includes(STATUS_LABEL(s))) as unknown as string[],
            }))
          }
          placeholder="All statuses"
          searchPlaceholder="Filter statuses…"
        />
        <MultiSelectId
          options={typeOptions.map((t) => ({ id: t.id, label: t.name }))}
          value={draft.typeIds}
          onChange={(ids) => setDraft((d) => ({ ...d, typeIds: ids, severityIds: [] }))}
          placeholder="All types"
          searchPlaceholder="Filter types…"
        />
        <MultiSelectId
          options={severityOptions.map((s) => ({ id: s.id, label: s.label }))}
          value={draft.severityIds}
          onChange={(ids) => setDraft((d) => ({ ...d, severityIds: ids }))}
          placeholder={
            draft.typeIds.length === 0
              ? 'All severities'
              : draft.typeIds.length > 1
              ? 'Pick a single type for severity'
              : 'All severities'
          }
          searchPlaceholder="Filter severities…"
        />
        <MultiSelectFilter
          options={SLA_STATUS_OPTIONS.map((s) => SAFETY_SLA_STATUS_LABELS[s])}
          value={draft.slaStatuses.map((s) => SAFETY_SLA_STATUS_LABELS[s as keyof typeof SAFETY_SLA_STATUS_LABELS])}
          onChange={(labels) =>
            setDraft((d) => ({
              ...d,
              slaStatuses: SLA_STATUS_OPTIONS.filter((s) => labels.includes(SAFETY_SLA_STATUS_LABELS[s])) as unknown as string[],
            }))
          }
          placeholder="All SLA statuses"
          searchPlaceholder="Filter SLA…"
        />
        <MultiSelectId
          options={businessUnits.map((b) => ({ id: b.id, label: b.name }))}
          value={draft.buIds}
          onChange={(ids) => setDraft((d) => ({ ...d, buIds: ids }))}
          placeholder="All business units"
          searchPlaceholder="Filter BUs…"
        />
        <Select
          value={draft.datePreset}
          onValueChange={(v) => setDraft((d) => ({ ...d, datePreset: v as DateRangePreset }))}
        >
          <SelectTrigger><SelectValue placeholder="Date range (Created)" /></SelectTrigger>
          <SelectContent>
            {DATE_RANGE_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>{DATE_RANGE_PRESET_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {draft.datePreset === 'custom' && (
          <>
            <Input
              type="date"
              value={draft.customFrom ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, customFrom: e.target.value || null }))}
              aria-label="From date"
            />
            <Input
              type="date"
              value={draft.customTo ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, customTo: e.target.value || null }))}
              aria-label="To date"
            />
          </>
        )}
        <Input
          placeholder="Search title, location, or number…"
          value={draft.search}
          onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
        />
      </SafetyFilterSheet>

      <SafetyResponsiveList
        title="Incidents"
        hasSubmitted={hasSubmitted}
        isLoading={isLoading}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        mobileRender={(i) => (
          <SafetyMobileListCard
            onClick={() => openRow(i)}
            title={
              <span>
                <span className="font-mono text-xs text-muted-foreground mr-1">
                  {i.incident_number ?? '—'}
                </span>
                {i.title}
              </span>
            }
            subtitle={
              <>
                {(i as any).type_label_snapshot ?? SAFETY_TYPE_LABELS[i.incident_type]}
                {' · '}
                {(i as any).severity_label_snapshot ?? SAFETY_SEVERITY_LABELS[i.severity]}
                {(i as any).business_unit_name && (
                  <> · {(i as any).business_unit_name}</>
                )}
              </>
            }
            meta={
              <>
                {format(new Date(i.created_at), 'dd MMM yyyy, HH:mm')}
                {(i as any).reporter_full_name && (
                  <> · by {(i as any).reporter_full_name}
                    {(i as any).reporter_employee_code && (
                      <> ({(i as any).reporter_employee_code})</>
                    )}
                  </>
                )}
              </>
            }
            badges={
              <>
                <SafetyStatusBadge status={i.status} />
                <SlaBadge state={i.sla_state} />
                {(i as any).duplicate_of_id && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {i.status === 'closed' ? 'Duplicate' : 'Duplicate pending'}
                  </Badge>
                )}
              </>
            }
          />
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead className="hidden md:table-cell">Business Unit</TableHead>
              {showInvolvedPerson && (
                <TableHead>Involved Person</TableHead>
              )}
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead className="hidden md:table-cell">Due / Remaining</TableHead>
              <TableHead className="hidden lg:table-cell">Routing</TableHead>
              <TableHead>Reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow
                key={i.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => openRow(i)}
              >
                <TableCell className="font-mono text-xs">
                  {i.incident_number ?? '—'}
                </TableCell>
                <TableCell className="max-w-[280px] truncate">{i.title}</TableCell>
                <TableCell>{(i as any).type_label_snapshot ?? SAFETY_TYPE_LABELS[i.incident_type]}</TableCell>
                <TableCell>{(i as any).severity_label_snapshot ?? SAFETY_SEVERITY_LABELS[i.severity]}</TableCell>
                <TableCell className="hidden md:table-cell text-xs">
                  {(i as any).business_unit_name ? (
                    <div>
                      <div>{(i as any).business_unit_name}</div>
                      {(i as any).business_unit_code && (
                        <div className="text-muted-foreground font-mono">
                          {(i as any).business_unit_code}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {showInvolvedPerson && (
                  <TableCell className="text-xs">
                    {(i as any).involved_person_full_name || i.involved_person_name ? (
                      <div>
                        <div>
                          {(i as any).involved_person_full_name ?? i.involved_person_name}
                        </div>
                        {(i as any).involved_person_employee_code && (
                          <div className="text-muted-foreground font-mono">
                            {(i as any).involved_person_employee_code}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <SafetyStatusBadge status={i.status} />
                    {(i as any).duplicate_of_id && (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {i.status === 'closed' ? 'Duplicate' : 'Dup pending'}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {i.sla_status ? (
                    <Badge variant={SAFETY_SLA_STATUS_TONE[i.sla_status]}>
                      {SAFETY_SLA_STATUS_LABELS[i.sla_status]}
                    </Badge>
                  ) : (
                    <SlaBadge state={i.sla_state} />
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs">
                  {i.status === 'closed' || i.status === 'orphaned' ? (
                    i.closed_at ? (
                      <div className="text-muted-foreground">
                        Closed {format(new Date(i.closed_at), 'dd MMM yyyy, HH:mm')}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  ) : i.sla_due_at ? (
                    <div>
                      <div>{format(new Date(i.sla_due_at), 'dd MMM yyyy, HH:mm')}</div>
                      <div className="text-muted-foreground">
                        {new Date(i.sla_due_at) > new Date() ? 'in ' : 'overdue by '}
                        {formatDistanceToNowStrict(new Date(i.sla_due_at))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs">
                  {i.routing_status === 'unrouted' ? (
                    <span className="text-amber-600">Unrouted</span>
                  ) : i.routing_status === 'legacy' ? (
                    <span className="text-muted-foreground">Legacy</span>
                  ) : (
                    <span className="text-emerald-600">Routed</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{format(new Date(i.created_at), 'dd MMM yyyy, HH:mm')}</div>
                  {(i as any).reporter_full_name && (
                    <div className="text-foreground mt-0.5">
                      {(i as any).reporter_full_name}
                    </div>
                  )}
                  {(i as any).reporter_employee_code && (
                    <div className="font-mono">
                      {(i as any).reporter_employee_code}
                    </div>
                  )}
                  {(i as any).actual_reporter_id && (
                    <div className="mt-1 pt-1 border-t border-border/50">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        On behalf of
                      </div>
                      {(i as any).actual_reporter_full_name && (
                        <div className="text-foreground">
                          {(i as any).actual_reporter_full_name}
                        </div>
                      )}
                      {(i as any).actual_reporter_employee_code && (
                        <div className="font-mono">
                          {(i as any).actual_reporter_employee_code}
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SafetyResponsiveList>

      <SafetyStickyActionBar>
        <Button asChild className="h-11">
          <Link to="/safety/incidents/new">
            <Plus className="h-4 w-4 mr-2" /> Report Incident
          </Link>
        </Button>
      </SafetyStickyActionBar>

      <OrphanIncidentDialog
        incident={orphanTarget}
        open={!!orphanTarget}
        onOpenChange={(v) => { if (!v) setOrphanTarget(null); }}
      />
    </div>
  );
}
