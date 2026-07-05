import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBusinessUnits, useDepartments } from '@/hooks/useSafetyOrg';
import { useBusinessUnitSubUnits } from '@/hooks/useProductionTargets';
import {
  listSystemKpis, listSystemKpiWeights, saveSystemKpiWeight,
} from '@/services/annualReview/systemKpiLibrary';

/**
 * Weight Matrix editor (P2).
 *
 * Grid: KPI (rows) × Grade bucket (cols) scoped by BU / Department / Sub-unit.
 * Wildcards: leave the scope filter as "Any". Row totals must sum ≤ 100.
 * Empty / 0 cell means "inherit the next wildcard row" — the resolver picks
 * the most specific non-null match at runtime.
 */

const GRADE_BUCKETS: { key: string; label: string }[] = [
  { key: 'M', label: 'M (M1–M7)' },
  { key: 'W', label: 'W (W1–W5)' },
  { key: 'T', label: 'T' },
  { key: 'other', label: 'Other' },
];

export function SystemKpiWeightMatrix() {
  const qc = useQueryClient();
  const [buId, setBuId] = useState<string>('');
  const [deptId, setDeptId] = useState<string>('');
  const [subUnitId, setSubUnitId] = useState<string>('');

  const { data: bus = [] } = useBusinessUnits();
  const { data: depts = [] } = useDepartments(buId || undefined);
  const { data: subs = [] } = useBusinessUnitSubUnits(buId || undefined);
  const { data: kpis = [], isLoading: kpisLoading } = useQuery({
    queryKey: ['annual-review-system-kpis'],
    queryFn: listSystemKpis,
  });
  const { data: weights = [], isLoading: wLoading } = useQuery({
    queryKey: ['annual-review-system-kpi-weights'],
    queryFn: listSystemKpiWeights,
  });

  const scopeDept = deptId || null;
  const scopeSub = subUnitId || null;

  // Build a lookup keyed by kpiId + bucket, containing ONLY rows that match the
  // exact selected scope (so the admin sees / edits the current-scope override).
  const exact = useMemo(() => {
    const map = new Map<string, { id: string; weight: number }>();
    for (const w of weights) {
      if ((w.department_id ?? null) !== scopeDept) continue;
      if ((w.sub_unit_id ?? null) !== scopeSub) continue;
      const bucket = w.grade_bucket ?? '__any__';
      map.set(`${w.system_kpi_id}::${bucket}`, { id: w.id, weight: Number(w.weight_pct) });
    }
    return map;
  }, [weights, scopeDept, scopeSub]);

  const activeKpis = kpis.filter((k) => k.is_active);

  // Column totals per bucket (only rows in the current scope).
  const bucketTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    GRADE_BUCKETS.forEach((g) => { totals[g.key] = 0; });
    activeKpis.forEach((k) => {
      GRADE_BUCKETS.forEach((g) => {
        totals[g.key] += exact.get(`${k.id}::${g.key}`)?.weight ?? 0;
      });
    });
    return totals;
  }, [activeKpis, exact]);

  const saveMut = useMutation({
    mutationFn: (v: { kpiId: string; bucket: string; weight: number }) =>
      saveSystemKpiWeight({
        system_kpi_id: v.kpiId,
        department_id: scopeDept,
        sub_unit_id: scopeSub,
        grade_bucket: v.bucket,
        weight_pct: v.weight,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annual-review-system-kpi-weights'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>System KPI Weight Matrix</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Assign each KPI a weight (%) per grade bucket for the selected scope. Leave a scope filter as
          <em> Any </em> to author a wildcard row that any department / sub-unit inherits. The runtime
          resolver always picks the most specific match. Column total per bucket must be ≤ 100.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scope pickers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Business Unit</Label>
            <Select value={buId || 'any'} onValueChange={(v) => { setBuId(v === 'any' ? '' : v); setDeptId(''); setSubUnitId(''); }}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">— Any —</SelectItem>
                {bus.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={deptId || 'any'} onValueChange={(v) => setDeptId(v === 'any' ? '' : v)} disabled={!buId}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">— Any —</SelectItem>
                {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sub-unit</Label>
            <Select value={subUnitId || 'any'} onValueChange={(v) => setSubUnitId(v === 'any' ? '' : v)} disabled={!buId}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">— Any —</SelectItem>
                {subs.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s as { sub_unit_label?: string; name?: string }).sub_unit_label ??
                      (s as { name?: string }).name ?? s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Editing scope:{' '}
          <Badge variant="outline" className="mr-1">Dept: {scopeDept ? depts.find((d) => d.id === scopeDept)?.name ?? '?' : 'ANY'}</Badge>
          <Badge variant="outline" className="mr-1">Sub-unit: {scopeSub ? '(selected)' : 'ANY'}</Badge>
        </div>

        {(kpisLoading || wLoading) ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : activeKpis.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No active KPIs. Add some in the KPI Library first.
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-muted/40 z-10">KPI</TableHead>
                  {GRADE_BUCKETS.map((g) => (
                    <TableHead key={g.key} className="text-center min-w-[120px]">{g.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeKpis.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="sticky left-0 bg-background z-10">
                      <div className="font-medium text-sm">{k.name_en}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{k.key}</div>
                    </TableCell>
                    {GRADE_BUCKETS.map((g) => (
                      <WeightCell
                        key={g.key}
                        initial={exact.get(`${k.id}::${g.key}`)?.weight ?? 0}
                        onSave={(w) => saveMut.mutate({ kpiId: k.id, bucket: g.key, weight: w })}
                      />
                    ))}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="sticky left-0 bg-muted/40 z-10">Column total</TableCell>
                  {GRADE_BUCKETS.map((g) => {
                    const t = bucketTotals[g.key] ?? 0;
                    const bad = t > 100;
                    return (
                      <TableCell key={g.key} className={`text-center ${bad ? 'text-destructive' : ''}`}>
                        {t}%
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeightCell({
  initial, onSave,
}: { initial: number; onSave: (w: number) => void }) {
  const [val, setVal] = useState<string>(initial ? String(initial) : '');

  // Keep local state in sync when the row is re-rendered with a different value.
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) { setSeed(initial); setVal(initial ? String(initial) : ''); }

  const commit = () => {
    const n = val === '' ? 0 : Number(val);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error('Weight must be 0 – 100.');
      setVal(initial ? String(initial) : '');
      return;
    }
    if (n === initial) return;
    onSave(n);
  };

  return (
    <TableCell className="p-1">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="—"
        className="h-9 text-center text-sm"
        inputMode="decimal"
      />
    </TableCell>
  );
}

// Preserve `supabase` import (keeps tree-shake sane if we later add a direct call).
void supabase;