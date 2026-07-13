import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type Row = {
  employee_id: string;
  full_name: string | null;
  employee_code: string | null;
  designation: string | null;
  department_name: string | null;
  business_unit_name: string | null;
  company_name: string | null;
  doj: string | null;
  first_kra_period: string | null;
  first_kra_year: number | null;
  first_kra_at: string | null;
  first_kra_by: string | null;
  first_kra_by_name: string | null;
  source: 'bundle' | 'rollover' | 'manual' | null;
  kpis_in_first_batch: number;
  total_kpis: number;
  total_count: number;
};

const PAGE_SIZE = 50;

const sourceLabel: Record<string, { label: string; cls: string }> = {
  bundle:   { label: 'Bundle',       cls: 'bg-blue-100 text-blue-800' },
  rollover: { label: 'Auto Rollover',cls: 'bg-purple-100 text-purple-800' },
  manual:   { label: 'Manual',       cls: 'bg-amber-100 text-amber-800' },
};

export default function FirstKraRolloutReport() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<string>('all');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [page, setPage] = useState(0);

  const filters = useMemo(() => ({
    p_search: search.trim() || null,
    p_company_id: null,
    p_bu_id: null,
    p_dept_id: null,
    p_from: from ? new Date(from).toISOString() : null,
    p_to: to ? new Date(to + 'T23:59:59').toISOString() : null,
    p_source: source === 'all' ? null : source,
    p_only_missing: onlyMissing,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  }), [search, source, onlyMissing, from, to, page]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['first-kra-rollout', filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_first_kra_rollout' as never, filters as never);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 60_000,
  });

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  const applyFilters = () => setPage(0);

  const exportCsv = async () => {
    try {
      const { data, error } = await supabase.rpc(
        'get_first_kra_rollout' as never,
        { ...filters, p_limit: 10_000, p_offset: 0 } as never,
      );
      if (error) throw error;
      const all = (data ?? []) as Row[];
      const headers = [
        'Employee','Employee Code','Designation','Department','Business Unit','Company',
        'DOJ','First KRA Period','First KRA At','Rolled Out By','Source','KPIs (first batch)','Total KPIs',
      ];
      const csv = [
        headers.join(','),
        ...all.map(r => [
          r.full_name ?? '',
          r.employee_code ?? '',
          r.designation ?? '',
          r.department_name ?? '',
          r.business_unit_name ?? '',
          r.company_name ?? '',
          r.doj ?? '',
          r.first_kra_period ? `${r.first_kra_period} ${r.first_kra_year}` : '',
          r.first_kra_at ? format(new Date(r.first_kra_at), 'yyyy-MM-dd HH:mm') : '',
          r.first_kra_by_name ?? (r.first_kra_by ? 'system' : ''),
          r.source ?? '',
          r.kpis_in_first_batch ?? 0,
          r.total_kpis ?? 0,
        ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `first_kra_rollout_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: `${all.length} rows exported.` });
    } catch (e) {
      toast({ title: 'Export failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="First KRA Rollout"
        description="See when KRAs were first issued for each employee — useful for tracking new joiners."
        backTo="/reports"
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        }
      />

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-2 space-y-2">
              <Label>Search (name or code)</Label>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. 100017 or Satyam" />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="bundle">Bundle</SelectItem>
                  <SelectItem value="rollover">Auto Rollover</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rolled out from</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Rolled out to</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2 pb-2">
                <Switch id="missing" checked={onlyMissing} onCheckedChange={setOnlyMissing} />
                <Label htmlFor="missing" className="text-sm cursor-pointer">Only employees without any KRA</Label>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={applyFilters}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Results {total ? <span className="text-muted-foreground text-sm font-normal">({total} employees)</span> : null}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : isError ? (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" /> {(error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No employees match these filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>DOJ</TableHead>
                      <TableHead>First KRA Period</TableHead>
                      <TableHead>Rolled Out On</TableHead>
                      <TableHead>Rolled Out By</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">KPIs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.employee_id}>
                        <TableCell className="font-medium">{r.full_name ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{r.employee_code ?? '—'}</TableCell>
                        <TableCell>{r.department_name ?? '—'}</TableCell>
                        <TableCell>{r.doj ?? '—'}</TableCell>
                        <TableCell>
                          {r.first_kra_period ? `${r.first_kra_period} ${r.first_kra_year}` : (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">No KRA yet</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.first_kra_at ? format(new Date(r.first_kra_at), 'dd MMM yyyy, HH:mm') : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{r.first_kra_by_name ?? (r.first_kra_at ? 'System' : '—')}</TableCell>
                        <TableCell>
                          {r.source ? (
                            <Badge className={sourceLabel[r.source]?.cls}>{sourceLabel[r.source]?.label ?? r.source}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.first_kra_at ? `${r.kpis_in_first_batch} / ${r.total_kpis}` : '0'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}