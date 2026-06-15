import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useReportAccess } from '@/hooks/useReportAccess';
import {
  useDevReportEntries,
  useDevReportSummary,
  useDeleteDevReportEntry,
  useDevReportMonths,
  monthBounds,
  formatEntryDateCell,
  type DevReportEntry,
  type DevReportEntryType,
} from '@/hooks/useDevReportEntries';
import { DevReportEntryDialog } from '@/components/reports/DevReportEntryDialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { downloadDevReportWorkbook } from '@/lib/devReportExport';

function useDevReportCoverMeta() {
  return useQuery({
    queryKey: ['system-settings', 'dev_report.cover'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'dev_report.project_name',
          'dev_report.tech_stack',
          'dev_report.repository',
          'dev_report.workstreams',
        ]);
      if (error) throw error;
      const map = new Map(
        (data ?? []).map((r) => [r.setting_key, r.setting_value as unknown]),
      );
      const text = (k: string, fb: string) => {
        const v = map.get(k);
        if (typeof v === 'string') return v;
        return fb;
      };
      const arr = (k: string): string[] => {
        const v = map.get(k);
        return Array.isArray(v) ? (v as string[]) : [];
      };
      return {
        project_name: text('dev_report.project_name', 'BFCL PMS'),
        tech_stack: text('dev_report.tech_stack', ''),
        repository: text('dev_report.repository', ''),
        workstreams: arr('dev_report.workstreams'),
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

const SEVERITY_TONE: Record<string, string> = {
  Critical: 'bg-destructive/15 text-destructive border-destructive/30',
  High: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  Major: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  Medium: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  Low: 'bg-muted text-muted-foreground',
};

export default function DevelopmentReport() {
  const { effectiveRole } = useAuth();
  const isAdmin = effectiveRole === 'admin';
  const { canDownload } = useReportAccess();
  const canExport = canDownload('dev-report') || isAdmin;

  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month'); // 'YYYY-MM' or null = all
  const month = monthBounds(monthParam) ? monthParam : null;
  const bounds = monthBounds(month);

  const [tab, setTab] = useState<DevReportEntryType | 'cover'>('cover');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DevReportEntry | null>(null);
  const [adding, setAdding] = useState<DevReportEntryType | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const entriesQ = useDevReportEntries({ month });
  const summaryQ = useDevReportSummary(
    bounds?.from,
    // RPC uses inclusive end; convert exclusive next-month-1st to last day of selected month.
    bounds ? lastDayOfMonth(month!) : undefined,
  );
  const monthsQ = useDevReportMonths();
  const coverQ = useDevReportCoverMeta();
  const del = useDeleteDevReportEntry();

  const allEntries = entriesQ.data ?? [];
  const filteredByTab = useMemo(() => {
    if (tab === 'cover') return allEntries;
    return allEntries.filter((e) => e.entry_type === tab);
  }, [allEntries, tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredByTab;
    return filteredByTab.filter((e) =>
      [e.title, e.description, e.module_area, e.period_label, e.severity, e.status, e.timeline_type]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [filteredByTab, search]);

  const summary = summaryQ.data;
  const cover = coverQ.data;

  const reportingPeriod = summary?.min_entry_date && summary?.max_entry_date
    ? `${summary.min_entry_date} – ${summary.max_entry_date}`
    : '—';

  const setMonth = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('month');
    else next.set('month', value);
    setSearchParams(next, { replace: true });
  };

  const handleExport = () => {
    if (!cover || !summary) return;
    const today = new Date().toISOString().slice(0, 10);
    const suffix = month ? `_${month.replace('-', '')}` : `_${today.replace(/-/g, '')}`;
    const fname = `BFCL_PMS_Digitalisation_Self_Evidence${suffix}.xlsx`;
    downloadDevReportWorkbook(
      {
        cover,
        summary,
        reportingPeriod,
        generatedOn: today,
        entries: allEntries,
      },
      fname,
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Development Report"
        description="In-system source of truth for the BFCL PMS development evidence file (features, bugs, timeline)."
        backTo="/reports"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Features" value={summary?.feature_count ?? 0} loading={summaryQ.isLoading} />
        <SummaryCard label="Bug Fixes" value={summary?.bug_count ?? 0} loading={summaryQ.isLoading} />
        <SummaryCard label="Timeline Entries" value={summary?.timeline_count ?? 0} loading={summaryQ.isLoading} />
        <SummaryCard label="Reporting Period" value={reportingPeriod} loading={summaryQ.isLoading} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month ?? 'all'} onValueChange={setMonth}>
            <SelectTrigger className="w-[170px]" aria-label="Filter by month">
              <SelectValue placeholder="All months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {(monthsQ.data ?? []).map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search title, description, module…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="flex gap-2">
          {isAdmin && tab !== 'cover' && (
            <Button onClick={() => setAdding(tab)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add entry
            </Button>
          )}
          <Button onClick={handleExport} disabled={!canExport || !cover || !summary} size="sm" variant="outline">
            <Download className="h-4 w-4 mr-1" /> Export XLSX
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="cover">Cover</TabsTrigger>
          <TabsTrigger value="feature">Features</TabsTrigger>
          <TabsTrigger value="bug">Bugs Fixed</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="cover" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Cover / Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Project" value={cover?.project_name} />
              <Row label="Tech Stack" value={cover?.tech_stack} />
              <Row label="Repository" value={cover?.repository} />
              <Row label="Reporting Period" value={reportingPeriod} />
              <Row
                label="Major Workstreams"
                value={cover?.workstreams?.length ? cover.workstreams.join(', ') : '—'}
              />
              <Row label="New Features Logged" value={String(summary?.feature_count ?? 0)} />
              <Row label="Bugs / Fixes Logged" value={String(summary?.bug_count ?? 0)} />
              <Row label="Total Timeline Entries" value={String(summary?.timeline_count ?? 0)} />
            </CardContent>
          </Card>
        </TabsContent>

        {(['feature', 'bug', 'timeline'] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <EntriesTable
              entries={filtered.filter((e) => e.entry_type === t)}
              type={t}
              loading={entriesQ.isLoading}
              isAdmin={isAdmin}
              onEdit={(e) => setEditing(e)}
              onDelete={(id) => setDeletingId(id)}
            />
          </TabsContent>
        ))}
      </Tabs>

      {(adding || editing) && (
        <DevReportEntryDialog
          open
          onOpenChange={(v) => {
            if (!v) {
              setAdding(null);
              setEditing(null);
            }
          }}
          entryType={editing?.entry_type ?? (adding as DevReportEntryType)}
          initial={editing}
        />
      )}

      <ConfirmDestructiveDialog
        open={!!deletingId}
        title="Delete entry?"
        description="This permanently removes the development report entry."
        confirmLabel="Delete"
        isLoading={del.isPending}
        onCancel={() => setDeletingId(null)}
        onConfirm={async () => {
          if (deletingId) await del.mutateAsync(deletingId);
          setDeletingId(null);
        }}
      />
    </div>
  );
}

function SummaryCard({ label, value, loading }: { label: string; value: string | number; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-20" /> : <div className="text-2xl font-semibold">{value}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-3 py-1 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '—'}</span>
    </div>
  );
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function EntriesTable({
  entries,
  type,
  loading,
  isAdmin,
  onEdit,
  onDelete,
}: {
  entries: DevReportEntry[];
  type: DevReportEntryType;
  loading: boolean;
  isAdmin: boolean;
  onEdit: (e: DevReportEntry) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!entries.length) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground">No entries yet.</CardContent></Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Date / Period</TableHead>
              <TableHead>{type === 'feature' ? 'Feature' : type === 'bug' ? 'Bug / Issue' : 'Item'}</TableHead>
              {type !== 'timeline' && <TableHead className="w-[180px]">Module / Area</TableHead>}
              <TableHead>{type === 'feature' ? 'What Was Built' : type === 'bug' ? 'Fix Description' : 'Summary'}</TableHead>
              <TableHead className="w-[120px]">
                {type === 'feature' ? 'Status' : type === 'bug' ? 'Severity' : 'Type'}
              </TableHead>
              {isAdmin && <TableHead className="w-[90px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {formatEntryDateCell(e)}
                </TableCell>
                <TableCell className="font-medium">{e.title}</TableCell>
                {type !== 'timeline' && <TableCell>{e.module_area ?? '—'}</TableCell>}
                <TableCell className="text-sm whitespace-pre-wrap">{e.description}</TableCell>
                <TableCell>
                  {type === 'bug' && e.severity ? (
                    <Badge variant="outline" className={SEVERITY_TONE[e.severity] ?? ''}>{e.severity}</Badge>
                  ) : type === 'feature' ? (
                    <Badge variant="outline">{e.status ?? '—'}</Badge>
                  ) : (
                    <Badge variant="outline">{e.timeline_type ?? '—'}</Badge>
                  )}
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(e)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(e.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}