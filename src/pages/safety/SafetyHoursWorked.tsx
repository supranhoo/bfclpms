import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, ArrowLeft, Activity } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSafetyHoursWorked,
  useUpsertSafetyHours,
  useDeleteSafetyHours,
} from '@/hooks/useSafetyAnalytics';
import { useBusinessUnits } from '@/hooks/useSafetyOrg';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

/**
 * SafetyHoursWorked
 * -----------------
 * Admin page for entering monthly hours-worked per business unit. Feeds
 * the TRIR materialized view. Restricted to admin / safety_head via RLS.
 */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function SafetyHoursWorked() {
  const { data: rows = [], isLoading } = useSafetyHoursWorked();
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
        },
        onError: (e: unknown) =>
          toast.error((e as Error).message ?? 'Failed to save hours'),
      },
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recorded entries</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No entries yet. Add one above to start TRIR tracking.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">BU</th>
                    <th className="py-2 pr-4">Period</th>
                    <th className="py-2 pr-4 text-right">Hours</th>
                    <th className="py-2 pr-4 text-right">Headcount</th>
                    <th className="py-2 pr-4 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: { id: string; business_unit_id: string | null; business_units?: { name?: string } | null; period_year: number; period_month: number; hours_worked: number; headcount: number | null }) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.business_units?.name ?? '(unassigned)'}</td>
                      <td className="py-2 pr-4">
                        {MONTHS[r.period_month - 1]} {r.period_year}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {Number(r.hours_worked).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.headcount ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
            },
            onError: (e: unknown) =>
              toast.error((e as Error).message ?? 'Failed to delete'),
          });
        }}
      />
    </div>
  );
}