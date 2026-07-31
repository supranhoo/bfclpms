import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, History, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useDepartments } from '@/hooks/useOrganization';
import { useReportAccess } from '@/hooks/useReportAccess';
import {
  useChangeHistory,
  fetchChangeHistoryForExport,
  CHANGE_HISTORY_PAGE_SIZE,
  type ChangeHistoryFilters,
} from '@/hooks/useChangeHistory';
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  displayValue,
  fieldLabel,
  formatWhen,
  toExportRow,
} from '@/lib/reports/changeHistory';

const CATEGORY_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  employee_details: 'secondary',
  status: 'default',
  workflow_mapping: 'outline',
  annual_review: 'outline',
};

export default function ChangeHistoryReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('change-history');
  const { data: departments = [] } = useDepartments();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [department, setDepartment] = useState('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const filters: ChangeHistoryFilters = useMemo(() => ({
    from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
    // exclusive upper bound → include the whole selected end day
    to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString() : null,
    categories: category === 'all' ? [] : [category],
    search,
    departmentId: department === 'all' ? null : department,
  }), [from, to, category, search, department]);

  const { data, isLoading, isError, error } = useChangeHistory(filters, page);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CHANGE_HISTORY_PAGE_SIZE));

  const applySearch = () => { setSearch(searchInput); setPage(1); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { rows: all, truncated } = await fetchChangeHistoryForExport(filters);
      if (all.length === 0) { toast.info('Nothing to export for the current filters.'); return; }
      const ws = XLSX.utils.aoa_to_sheet([
        ['Master Change History Report'],
        [`Generated: ${new Date().toLocaleString()} | Records: ${all.length}${truncated ? ' (capped)' : ''}`],
        [],
      ]);
      XLSX.utils.sheet_add_json(ws, all.map(toExportRow), { origin: 'A4' });
      ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 26 }, { wch: 26 }, { wch: 22 }, { wch: 40 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Change History');
      XLSX.writeFile(wb, `Change_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
      if (truncated) toast.warning('Export capped at 5,000 rows — narrow the date range for a complete extract.');
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Change History"
        description="Every employee-detail, active/inactive, workflow-mapping and annual-review change — with the exact time and the person who made it."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Department</Label>
            <Select value={department} onValueChange={(v) => { setDepartment(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d: { id: string; name: string }) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Employee / Changed by</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Name or code"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
              />
              <Button variant="secondary" size="icon" onClick={applySearch} aria-label="Search">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">
            {isLoading ? 'Loading…' : `${total.toLocaleString()} change${total === 1 ? '' : 's'}`}
          </CardTitle>
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || total === 0}>
              <Download className="h-4 w-4 mr-2" />{exporting ? 'Exporting…' : 'Export Excel'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {isError && (
            <p className="text-sm text-destructive">
              Could not load change history: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Date &amp; Time</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>What Changed</TableHead>
                  <TableHead>Old Value</TableHead>
                  <TableHead>New Value</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Context</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No changes recorded for the selected filters.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.map((r) => (
                  <TableRow key={r.event_id}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">{formatWhen(r.occurred_at)}</TableCell>
                    <TableCell>
                      <Badge variant={CATEGORY_VARIANT[r.category] ?? 'outline'} className="text-[10px]">
                        {categoryLabel(r.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.employee_name ?? '—'}
                      {r.employee_code && <span className="text-muted-foreground text-xs"> · {r.employee_code}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{fieldLabel(r.field_label)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{displayValue(r.old_value)}</TableCell>
                    <TableCell className="text-sm font-medium">{displayValue(r.new_value)}</TableCell>
                    <TableCell className="text-sm">{r.changed_by_name ?? (r.changed_by ? 'System user' : 'System')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={r.context ?? ''}>
                      {displayValue(r.context)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            Workflow-mapping changes are captured from 31 Jul 2026 onward; earlier mapping edits were never recorded and cannot be shown.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
