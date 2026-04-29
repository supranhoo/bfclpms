import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, ArrowLeft, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  useUpsertSafetyHours,
  useDeleteSafetyHours,
} from '@/hooks/useSafetyAnalytics';
import { useBusinessUnits } from '@/hooks/useSafetyOrg';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useManualQuery, type ManualQueryFetcherArgs } from '@/hooks/useManualQuery';
import { SafetyFilterBar } from '@/components/safety/SafetyFilterBar';
import { SafetyDataTable } from '@/components/safety/SafetyDataTable';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * SafetyHoursWorked
 * -----------------
 * Admin page for entering monthly hours-worked per business unit. Feeds
 * the TRIR materialized view. Restricted to admin / safety_head via RLS.
 */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface HoursRow {
  id: string;
  business_unit_id: string | null;
  business_units?: { name?: string } | null;
  period_year: number;
  period_month: number;
  hours_worked: number;
  headcount: number | null;
}

interface HoursFilters {
  businessUnitId: string; // 'all' or BU id
  year: string;           // 'all' or numeric string
}

const INITIAL_FILTERS: HoursFilters = { businessUnitId: 'all', year: 'all' };

async function fetchHoursPage({
  filters, range,
}: ManualQueryFetcherArgs<HoursFilters>): Promise<{ rows: HoursRow[]; total: number }> {
  let q = supabase
    .from('safety_hours_worked')
    .select('*, business_units(name)', { count: 'exact' })
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .range(range[0], range[1]);
  if (filters.businessUnitId !== 'all') q = q.eq('business_unit_id', filters.businessUnitId);
  if (filters.year !== 'all') q = q.eq('period_year', Number(filters.year));
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as HoursRow[], total: count ?? 0 };
}

export default function SafetyHoursWorked() {
  const { data: bus = [] } = useBusinessUnits();
  const upsert = useUpsertSafetyHours();
  const del = useDeleteSafetyHours();

  const now = new Date();
  const [bu, setBu] = useState<string>('');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [hours, setHours] = useState<string>('');
  const [headcount, setHeadcount] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [draft, setDraft] = useState<HoursFilters>(INITIAL_FILTERS);

  const {
    rows, total, page, pageSize, totalPages,
    hasSubmitted, isLoading, isFetching,
    submit, reset, setPage, setPageSize, refetchLast,
  } = useManualQuery<HoursRow, HoursFilters>(
    ['safety', 'hours-worked', 'list'],
    fetchHoursPage,
  );

  const handleSubmit = () => submit(draft);
  const handleReset = () => { setDraft(INITIAL_FILTERS); reset(); };

  // Year options: current year ± 5
  const years: number[] = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 5; y--) years.push(y);

  function handleAdd() {
    if (!bu || !hours) {
      toast.error('Pick a business unit and enter hours.');
      return;
    }
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 0) {
      toast.error('Hours must be a non-negative number.');
      return;
    }
    upsert.mutate(
      {
        business_unit_id: bu,
        period_year: year,
        period_month: month,
        hours_worked: h,
        headcount: headcount ? Number(headcount) : null,
      },
      {
        onSuccess: () => {
          toast.success('Hours saved');
          setHours('');
          setHeadcount('');
          refetchLast();
        },
        onError: (e: unknown) =>
          toast.error((e as Error).message ?? 'Failed to save hours'),
      },
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <Activity className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Hours Worked</h1>
          <p className="text-muted-foreground">
            Monthly hours per business unit — used to compute TRIR (×200,000).
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/safety/analytics" className="flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Analytics
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add / update entry</CardTitle>
          <CardDescription>One row per BU × month. Re-entering overwrites.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Business Unit</Label>
            <Select value={bu} onValueChange={setBu}>
              <SelectTrigger><SelectValue placeholder="Select BU" /></SelectTrigger>
              <SelectContent>
                {bus.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Hours worked</Label>
            <Input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 16000"
            />
          </div>
          <div>
            <Label className="text-xs">Headcount (opt.)</Label>
            <Input
              type="number"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
            />
          </div>
          <div className="md:col-span-6">
            <Button onClick={handleAdd} disabled={upsert.isPending} size="sm">
              {upsert.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Save entry
            </Button>
          </div>
        </CardContent>
      </Card>

      <SafetyFilterBar
        title="Browse recorded entries"
        description="Filter by BU and/or year, then click Search to load."
        onSubmit={handleSubmit}
        onReset={handleReset}
        isSubmitting={isFetching}
      >
        <Select value={draft.businessUnitId} onValueChange={(v) => setDraft((d) => ({ ...d, businessUnitId: v }))}>
          <SelectTrigger><SelectValue placeholder="Business unit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All business units</SelectItem>
            {bus.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draft.year} onValueChange={(v) => setDraft((d) => ({ ...d, year: v }))}>
          <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SafetyFilterBar>

      <SafetyDataTable
        title="Recorded entries"
        hasSubmitted={hasSubmitted}
        isLoading={isLoading}
        rowCount={rows.length}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>BU</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Headcount</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.business_units?.name ?? '(unassigned)'}</TableCell>
                <TableCell>{MONTHS[r.period_month - 1]} {r.period_year}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(r.hours_worked).toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.headcount ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SafetyDataTable>

      <ConfirmDestructiveDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        title="Delete hours entry?"
        description="This will affect TRIR computation for the affected period."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!confirmDelete) return;
          del.mutate(confirmDelete, {
            onSuccess: () => {
              toast.success('Entry removed');
              setConfirmDelete(null);
              refetchLast();
            },
            onError: (e: unknown) =>
              toast.error((e as Error).message ?? 'Failed to delete'),
          });
        }}
      />
    </div>
  );
}