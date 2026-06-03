/**
 * Platform Settings → Data Governance → Overview (Phase 3B).
 *
 * Read-only aggregation across the 6 Phase 3A registries plus the last 10
 * audit events scoped to those entity types. No writes, no enforcement.
 */
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, ShieldAlert, FileLock2, Download, ClipboardList, Archive, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type TabId =
  | 'classifications'
  | 'sensitive-fields'
  | 'export-policies'
  | 'audit-policy'
  | 'retention-policy'
  | 'privacy-consent';

interface Props {
  onNavigate: (tab: TabId) => void;
}

interface RegistrySummary {
  total: number;
  active: number;
  inactive: number;
  lastUpdated: string | null;
}

interface OverviewData {
  classifications: RegistrySummary & { byKey: Record<string, number> };
  sensitiveFields: RegistrySummary & { byModule: Record<string, number> };
  exportPolicies: RegistrySummary & { byClassification: Record<string, number> };
  auditPolicies: RegistrySummary & { byRetentionBucket: Record<string, number> };
  retentionPolicies: RegistrySummary & { byPurge: Record<string, number> };
  privacyConsent: RegistrySummary & { byBasis: Record<string, number> };
  recent: Array<{
    id: string;
    created_at: string;
    event_type: string;
    entity_type: string;
    entity_key: string | null;
    reason: string | null;
    actor_id: string | null;
  }>;
}

const ENTITY_TYPES = [
  'data_classification',
  'sensitive_field',
  'export_policy',
  'audit_policy',
  'retention_policy',
  'privacy_consent_setting',
] as const;

const ENTITY_TO_TAB: Record<string, TabId> = {
  data_classification: 'classifications',
  sensitive_field: 'sensitive-fields',
  export_policy: 'export-policies',
  audit_policy: 'audit-policy',
  retention_policy: 'retention-policy',
  privacy_consent_setting: 'privacy-consent',
};

function summarize<T extends { is_active: boolean | null; updated_at: string | null }>(rows: T[]): RegistrySummary {
  let active = 0;
  let inactive = 0;
  let last: string | null = null;
  for (const r of rows) {
    if (r.is_active === false) inactive += 1; else active += 1;
    if (r.updated_at && (!last || r.updated_at > last)) last = r.updated_at;
  }
  return { total: rows.length, active, inactive, lastUpdated: last };
}

function groupCount<T>(rows: T[], pick: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = (pick(r) ?? '—') || '—';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function retentionBucket(days: number | null | undefined): string {
  if (days == null) return 'forever';
  if (days <= 90) return '≤ 90d';
  if (days <= 365) return '≤ 1y';
  return '> 1y';
}

async function fetchOverview(): Promise<OverviewData> {
  const [
    classifications,
    sensitiveFields,
    exportPolicies,
    auditPolicies,
    retentionPolicies,
    privacyConsent,
    recent,
  ] = await Promise.all([
    supabase.from('data_classifications').select('classification_key, is_active, updated_at'),
    supabase.from('sensitive_fields').select('module_key, is_active, updated_at'),
    supabase.from('export_policies').select('classification_key, is_active, updated_at'),
    supabase.from('audit_policies').select('retention_days, is_active, updated_at'),
    supabase.from('retention_policies').select('purge_strategy, is_active, updated_at'),
    supabase.from('privacy_consent_settings').select('lawful_basis, is_active, updated_at'),
    supabase
      .from('entitlement_audit')
      .select('id, created_at, event_type, entity_type, entity_key, reason, actor_id')
      .in('entity_type', ENTITY_TYPES as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const cls = (classifications.data ?? []) as Array<{ classification_key: string; is_active: boolean; updated_at: string }>;
  const sf = (sensitiveFields.data ?? []) as Array<{ module_key: string; is_active: boolean; updated_at: string }>;
  const ep = (exportPolicies.data ?? []) as Array<{ classification_key: string; is_active: boolean; updated_at: string }>;
  const ap = (auditPolicies.data ?? []) as Array<{ retention_days: number | null; is_active: boolean; updated_at: string }>;
  const rp = (retentionPolicies.data ?? []) as Array<{ purge_strategy: string; is_active: boolean; updated_at: string }>;
  const pc = (privacyConsent.data ?? []) as Array<{ lawful_basis: string; is_active: boolean; updated_at: string }>;

  return {
    classifications: { ...summarize(cls), byKey: groupCount(cls, (r) => r.classification_key) },
    sensitiveFields: { ...summarize(sf), byModule: groupCount(sf, (r) => r.module_key) },
    exportPolicies: { ...summarize(ep), byClassification: groupCount(ep, (r) => r.classification_key) },
    auditPolicies: { ...summarize(ap), byRetentionBucket: groupCount(ap, (r) => retentionBucket(r.retention_days)) },
    retentionPolicies: { ...summarize(rp), byPurge: groupCount(rp, (r) => r.purge_strategy) },
    privacyConsent: { ...summarize(pc), byBasis: groupCount(pc, (r) => r.lawful_basis) },
    recent: (recent.data ?? []) as OverviewData['recent'],
  };
}

function RegistryCard({
  title,
  icon,
  summary,
  onManage,
}: {
  title: string;
  icon: React.ReactNode;
  summary: RegistrySummary;
  onManage: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold">{summary.total}</span>
          <span className="text-xs text-muted-foreground">total</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{summary.active} active</Badge>
          {summary.inactive > 0 && <Badge variant="outline">{summary.inactive} inactive</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          {summary.lastUpdated
            ? `Updated ${formatDistanceToNow(new Date(summary.lastUpdated), { addSuffix: true })}`
            : 'No entries yet'}
        </div>
        <Button size="sm" variant="ghost" className="px-2 -ml-2" onClick={onManage}>
          Manage <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

function CoverageRow({ label, items }: { label: string; items: Record<string, number> }) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground min-w-[180px]">{label}</span>
      {entries.length === 0 ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        entries.map(([k, n]) => (
          <Badge key={k} variant="outline" className="font-normal">
            {k}: {n}
          </Badge>
        ))
      )}
    </div>
  );
}

export function DataGovernanceOverviewSubTab({ onNavigate }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['data-governance', 'overview'],
    queryFn: fetchOverview,
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RegistryCard
          title="Classifications"
          icon={<ShieldAlert className="h-4 w-4" />}
          summary={data.classifications}
          onManage={() => onNavigate('classifications')}
        />
        <RegistryCard
          title="Sensitive Fields"
          icon={<FileLock2 className="h-4 w-4" />}
          summary={data.sensitiveFields}
          onManage={() => onNavigate('sensitive-fields')}
        />
        <RegistryCard
          title="Export Policies"
          icon={<Download className="h-4 w-4" />}
          summary={data.exportPolicies}
          onManage={() => onNavigate('export-policies')}
        />
        <RegistryCard
          title="Audit Policies"
          icon={<ClipboardList className="h-4 w-4" />}
          summary={data.auditPolicies}
          onManage={() => onNavigate('audit-policy')}
        />
        <RegistryCard
          title="Retention Policies"
          icon={<Archive className="h-4 w-4" />}
          summary={data.retentionPolicies}
          onManage={() => onNavigate('retention-policy')}
        />
        <RegistryCard
          title="Privacy &amp; Consent"
          icon={<ShieldCheck className="h-4 w-4" />}
          summary={data.privacyConsent}
          onManage={() => onNavigate('privacy-consent')}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <CoverageRow label="Classifications by key" items={data.classifications.byKey} />
          <CoverageRow label="Sensitive fields by module" items={data.sensitiveFields.byModule} />
          <CoverageRow label="Export policies by classification" items={data.exportPolicies.byClassification} />
          <CoverageRow label="Audit policies by retention" items={data.auditPolicies.byRetentionBucket} />
          <CoverageRow label="Retention by purge strategy" items={data.retentionPolicies.byPurge} />
          <CoverageRow label="Privacy/Consent by lawful basis" items={data.privacyConsent.byBasis} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent changes</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((row) => {
                  const tab = ENTITY_TO_TAB[row.entity_type];
                  return (
                    <TableRow
                      key={row.id}
                      className={tab ? 'cursor-pointer' : ''}
                      onClick={() => tab && onNavigate(tab)}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.event_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.entity_type}</TableCell>
                      <TableCell className="text-xs font-mono">{row.entity_key ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.reason ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}