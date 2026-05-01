import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Wrench, CheckCircle2, AlertTriangle, ArrowRight, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useKpiDefinitions, useCorrectMayKpis, KpiDefinition } from '@/hooks/useKpiRegistry';
import { useToast } from '@/hooks/use-toast';
import { AffectedKpisTable } from './AffectedKpisTable';

interface UnlinkedSignature {
  kra_name: string;
  kpi_name: string;
  category_id: string;
  employee_count: number;
  row_count: number;
}

const CURRENT_MONTHS = ['May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function CorrectMayKpisTab() {
  const { data: definitions, loading: defsLoading } = useKpiDefinitions();
  const { correctKpis, loading: correcting } = useCorrectMayKpis();
  const { toast } = useToast();

  const [period, setPeriod] = useState('May');
  const [year, setYear] = useState(2026);
  const [unlinked, setUnlinked] = useState<UnlinkedSignature[]>([]);
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [corrected, setCorrected] = useState<Set<string>>(new Set());
  const [viewingKey, setViewingKey] = useState<string | null>(null);

  const fetchUnlinked = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kpis' as any)
        .select('kra_name, kpi_name, category_id, employee_id')
        .eq('review_period', period)
        .eq('review_year', year)
        .is('kpi_definition_id', null);

      if (error) throw error;

      // Group by signature
      const sigMap = new Map<string, UnlinkedSignature>();
      for (const row of (data as any[] || [])) {
        const key = `${row.category_id}::${row.kra_name}::${row.kpi_name}`;
        if (!sigMap.has(key)) {
          sigMap.set(key, {
            kra_name: row.kra_name,
            kpi_name: row.kpi_name,
            category_id: row.category_id,
            employee_count: 0,
            row_count: 0,
          });
        }
        const sig = sigMap.get(key)!;
        sig.row_count++;
        // Rough unique count
        sig.employee_count = sig.row_count; // simplified
      }
      setUnlinked(Array.from(sigMap.values()));
    } catch (err: any) {
      toast({ title: 'Failed to fetch', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [period, year, toast]);

  useEffect(() => { fetchUnlinked(); }, [fetchUnlinked]);

  // Auto-match unlinked KPIs to definitions
  useEffect(() => {
    if (definitions.length === 0 || unlinked.length === 0) return;

    const newMappings: Record<string, string> = {};
    for (const sig of unlinked) {
      const key = `${sig.category_id}::${sig.kra_name}::${sig.kpi_name}`;
      // Try exact match first
      const exact = definitions.find(d =>
        d.category_id === sig.category_id &&
        d.canonical_kra_name === sig.kra_name &&
        d.canonical_kpi_name === sig.kpi_name
      );
      if (exact) {
        newMappings[key] = exact.id;
        continue;
      }
      // Fuzzy: normalized match
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const fuzzy = definitions.find(d =>
        d.category_id === sig.category_id &&
        norm(d.canonical_kpi_name).slice(0, 50) === norm(sig.kpi_name).slice(0, 50)
      );
      if (fuzzy) {
        newMappings[key] = fuzzy.id;
      }
    }
    setMappings(prev => ({ ...prev, ...newMappings }));
  }, [definitions, unlinked]);

  const handleCorrect = async (sig: UnlinkedSignature) => {
    const key = `${sig.category_id}::${sig.kra_name}::${sig.kpi_name}`;
    const defId = mappings[key];
    if (!defId) {
      toast({ title: 'No mapping selected', variant: 'destructive' });
      return;
    }
    const def = definitions.find(d => d.id === defId);
    if (!def) return;

    const success = await correctKpis(
      sig.category_id,
      sig.kra_name,
      sig.kpi_name,
      def.canonical_kra_name,
      def.canonical_kpi_name,
      defId,
      period,
      year
    );

    if (success) {
      setCorrected(prev => new Set([...prev, key]));
    }
  };

  const pendingUnlinked = unlinked.filter(sig => {
    const key = `${sig.category_id}::${sig.kra_name}::${sig.kpi_name}`;
    return !corrected.has(key);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Correct {period} {year} KPIs
          </CardTitle>
          <CardDescription>
            Match unlinked KPIs to registry entries and apply canonical names. Past data is never modified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENT_MONTHS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchUnlinked} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Refresh
            </Button>
            <Badge variant="secondary">
              {pendingUnlinked.length} unlinked signatures
            </Badge>
          </div>

          {loading || defsLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          ) : pendingUnlinked.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="font-medium">All KPIs for {period} {year} are linked!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {pendingUnlinked.map(sig => {
                const key = `${sig.category_id}::${sig.kra_name}::${sig.kpi_name}`;
                const selectedDefId = mappings[key];
                const selectedDef = definitions.find(d => d.id === selectedDefId);

                return (
                  <div key={key} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{sig.kra_name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {sig.kpi_name.slice(0, 150)}
                        </div>
                        <Badge variant="outline" className="text-xs mt-1">{sig.row_count} rows</Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Select
                        value={selectedDefId || ''}
                        onValueChange={v => setMappings(prev => ({ ...prev, [key]: v }))}
                      >
                        <SelectTrigger className="flex-1 h-8 text-xs">
                          <SelectValue placeholder="Select canonical definition..." />
                        </SelectTrigger>
                        <SelectContent>
                          {definitions
                            .filter(d => d.category_id === sig.category_id)
                            .map(d => (
                              <SelectItem key={d.id} value={d.id} className="text-xs">
                                {d.canonical_kra_name} → {d.canonical_kpi_name.slice(0, 80)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!selectedDefId || correcting}
                        onClick={() => handleCorrect(sig)}
                      >
                        {correcting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                      </Button>
                    </div>

                    {selectedDef && (
                      <div className="bg-green-50 dark:bg-green-950/30 rounded px-2 py-1 text-xs">
                        Will rename to: <strong>{selectedDef.canonical_kra_name}</strong> / {selectedDef.canonical_kpi_name.slice(0, 80)}
                      </div>
                    )}

                    {!selectedDefId && (
                      <div className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        No matching registry entry found — select manually or create one in Build Registry
                      </div>
                    )}

                    <div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => setViewingKey(viewingKey === key ? null : key)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {viewingKey === key ? 'Hide' : 'View'} affected employees
                      </Button>
                      {viewingKey === key && (
                        <div className="mt-2">
                          <AffectedKpisTable
                            categoryId={sig.category_id}
                            kraName={sig.kra_name}
                            kpiName={sig.kpi_name}
                            reviewPeriod={period}
                            reviewYear={year}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}