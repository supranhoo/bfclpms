import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Plus, Trash2 } from 'lucide-react';
import { useProductionTargets, useUpsertProductionTargets } from '@/hooks/useProductionTargets';
import { useIncentivePrograms } from '@/hooks/useIncentivePrograms';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SlabCategorySelector } from './SlabCategorySelector';
import { useIncentiveSlabCategories } from '@/hooks/useIncentiveSlabCategories';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface LocalRow {
  _key: string;
  id?: string;
  sub_unit_label: string;
  slab_category: string;
  target_value: string;
  achieved_value: string;
  incentive_percent: string;
  remarks: string;
}

export function ProductionTargetGrid({ controlledProgramId, onMonthYearChange }: { controlledProgramId?: string; onMonthYearChange?: (month: string, year: number) => void } = {}) {
  const { user } = useAuth();
  const now = new Date();
  const [internalProgram, setInternalProgram] = useState('');
  const selectedProgram = controlledProgramId || internalProgram;
  const setSelectedProgram = controlledProgramId ? () => {} : setInternalProgram;
  const [selectedBU, setSelectedBU] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[now.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [localRows, setLocalRows] = useState<LocalRow[]>([]);

  const { data: programs = [] } = useIncentivePrograms();
  const { data: slabCategories = [] } = useIncentiveSlabCategories();

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units'],
    queryFn: async () => {
      const { data } = await supabase.from('business_units').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: targets = [], isLoading } = useProductionTargets(
    selectedProgram || undefined,
    selectedBU || undefined,
    selectedMonth,
    selectedYear,
  );

  const upsert = useUpsertProductionTargets();

  // Sync DB data into local state
  useEffect(() => {
    if (targets.length > 0) {
      setLocalRows(targets.map((t: any) => ({
        _key: t.id,
        id: t.id,
        sub_unit_label: t.sub_unit_label || '',
        slab_category: t.slab_category,
        target_value: String(t.target_value),
        achieved_value: String(t.achieved_value),
        incentive_percent: String(t.incentive_percent),
        remarks: t.remarks || '',
      })));
    } else {
      setLocalRows([]);
    }
  }, [targets]);

  const addRow = () => {
    setLocalRows(prev => [...prev, {
      _key: crypto.randomUUID(),
      sub_unit_label: '',
      slab_category: 'production',
      target_value: '',
      achieved_value: '',
      incentive_percent: '',
      remarks: '',
    }]);
  };

  const removeRow = (key: string) => {
    setLocalRows(prev => prev.filter(r => r._key !== key));
  };

  const updateRow = (key: string, field: keyof LocalRow, value: string) => {
    setLocalRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  };

  const handleSaveAll = () => {
    if (!selectedProgram) return;
    const rows = localRows.map(r => ({
      ...(r.id ? { id: r.id } : {}),
      program_id: selectedProgram,
      business_unit_id: selectedBU || null,
      sub_unit_label: r.sub_unit_label || null,
      slab_category: r.slab_category,
      month: selectedMonth,
      year: selectedYear,
      target_value: parseFloat(r.target_value) || 0,
      achieved_value: parseFloat(r.achieved_value) || 0,
      incentive_percent: parseFloat(r.incentive_percent) || 0,
      remarks: r.remarks || null,
      updated_by: user?.id || null,
    }));
    upsert.mutate(rows);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Production Data Entry</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          {!controlledProgramId && (
            <Select value={selectedProgram} onValueChange={setSelectedProgram}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select Program" /></SelectTrigger>
              <SelectContent>
                {(programs as any[]).filter((p: any) => p.is_active).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={selectedBU || 'all'} onValueChange={v => setSelectedBU(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All BUs" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Business Units</SelectItem>
              {businessUnits.map((bu: any) => (
                <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {!selectedProgram ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Select a program to enter production data.</p>
        ) : (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sub-Unit / Furnace</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Achieved</TableHead>
                    <TableHead>Incentive %</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : localRows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No data yet. Click "+ Add Row" to begin.</TableCell></TableRow>
                  ) : (
                    localRows.map(row => (
                      <TableRow key={row._key}>
                        <TableCell>
                          <Input value={row.sub_unit_label} onChange={e => updateRow(row._key, 'sub_unit_label', e.target.value)} placeholder="e.g. F-1&2" className="h-8 w-28" />
                        </TableCell>
                        <TableCell>
                          <Select value={row.slab_category} onValueChange={v => updateRow(row._key, 'slab_category', v)}>
                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {slabCategories.filter((c: any) => c.value !== 'pms_score').map((c: any) => <SelectItem key={c.id} value={c.value}>{c.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={row.target_value} onChange={e => updateRow(row._key, 'target_value', e.target.value)} className="h-8 w-24" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={row.achieved_value} onChange={e => updateRow(row._key, 'achieved_value', e.target.value)} className="h-8 w-24" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={row.incentive_percent} onChange={e => updateRow(row._key, 'incentive_percent', e.target.value)} className="h-8 w-20" />
                        </TableCell>
                        <TableCell>
                          <Input value={row.remarks} onChange={e => updateRow(row._key, 'remarks', e.target.value)} className="h-8 w-32" />
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeRow(row._key)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1" /> Add Row</Button>
              <Button size="sm" onClick={handleSaveAll} disabled={upsert.isPending || localRows.length === 0}>
                <Save className="h-4 w-4 mr-1" /> Save All
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
