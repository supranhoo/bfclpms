import { useState } from 'react';
import { format } from 'date-fns';
import { useProductionRates, useUpsertProductionRate, useDeleteProductionRate } from '@/hooks/useProductionDailyEntries';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, Trash2, Edit, Check, X, CalendarIcon } from 'lucide-react';
import { formatEmployeeName, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

interface Props {
  programId: string;
}

type RateType = 'employee' | 'department' | 'bu' | 'company' | 'common';

const firstOfThisMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const toDateStr = (d: Date) => format(d, 'yyyy-MM-dd');

export function ProductionRatesTab({ programId }: Props) {
  const { data: rates = [], isLoading } = useProductionRates(programId);
  const upsert = useUpsertProductionRate();
  const remove = useDeleteProductionRate();

  const [showAdd, setShowAdd] = useState(false);
  const [rateType, setRateType] = useState<RateType>('employee');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [newRate, setNewRate] = useState('0');
  const [newRemarks, setNewRemarks] = useState('');
  const [newEffective, setNewEffective] = useState<Date>(firstOfThisMonth());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editEffective, setEditEffective] = useState<Date | undefined>(undefined);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-for-production-rates'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, email')
        .order('full_name');
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-for-rates'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units-for-rates'],
    queryFn: async () => {
      const { data } = await supabase.from('business_units').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-for-rates'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  // Build "latest per scope" map so we can mark superseded rows.
  const scopeKey = (r: any) =>
    `${r.rate_type}|${r.employee_id || ''}|${r.entity_id || ''}`;
  const latestPerScope = new Map<string, string>(); // key -> latest effective_from
  (rates as any[]).forEach((r: any) => {
    const k = scopeKey(r);
    const cur = latestPerScope.get(k);
    if (!cur || String(r.effective_from || '') > cur) {
      latestPerScope.set(k, r.effective_from || '');
    }
  });

  const handleAdd = () => {
    const eff = toDateStr(newEffective);
    if (rateType === 'common') {
      if (!newRate) return;
      upsert.mutate({
        program_id: programId,
        rate_type: 'common',
        rate_per_ton: parseFloat(newRate) || 0,
        remarks: newRemarks || undefined,
        effective_from: eff,
      }, { onSuccess: resetAddForm });
    } else if (rateType === 'employee') {
      if (!selectedEntity || !newRate) return;
      upsert.mutate({
        program_id: programId,
        employee_id: selectedEntity,
        rate_type: 'employee',
        rate_per_ton: parseFloat(newRate) || 0,
        remarks: newRemarks || undefined,
        effective_from: eff,
      }, { onSuccess: resetAddForm });
    } else {
      if (!selectedEntity || !newRate) return;
      upsert.mutate({
        program_id: programId,
        rate_type: rateType,
        entity_id: selectedEntity,
        rate_per_ton: parseFloat(newRate) || 0,
        remarks: newRemarks || undefined,
        effective_from: eff,
      }, { onSuccess: resetAddForm });
    }
  };

  const resetAddForm = () => {
    setShowAdd(false);
    setSelectedEntity('');
    setNewRate('0');
    setNewRemarks('');
    setNewEffective(firstOfThisMonth());
  };

  const handleSaveEdit = (r: any) => {
    upsert.mutate({
      id: r.id,
      program_id: programId,
      employee_id: r.employee_id || undefined,
      rate_type: r.rate_type,
      entity_id: r.entity_id || undefined,
      rate_per_ton: parseFloat(editRate) || 0,
      remarks: editRemarks || undefined,
      effective_from: editEffective ? toDateStr(editEffective) : undefined,
    }, {
      onSuccess: () => setEditingId(null),
    });
  };

  const getAppliesTo = (r: any): string => {
    if (r.rate_type === 'common') return 'All Employees';
    if (r.rate_type === 'employee') {
      const profile = r.profiles;
      return formatEmployeeName(profile?.full_name, profile?.email || '', profile?.employee_code);
    }
    if (r.rate_type === 'department') {
      const dept = departments.find(d => d.id === r.entity_id);
      return dept?.name || r.entity_id?.slice(0, 8) || '—';
    }
    if (r.rate_type === 'bu') {
      const bu = businessUnits.find(b => b.id === r.entity_id);
      return bu?.name || r.entity_id?.slice(0, 8) || '—';
    }
    if (r.rate_type === 'company') {
      const c = companies.find(co => co.id === r.entity_id);
      return c?.name || r.entity_id?.slice(0, 8) || '—';
    }
    return '—';
  };

  const rateTypeBadge = (type: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      employee: { label: 'Employee', variant: 'default' },
      department: { label: 'Dept', variant: 'secondary' },
      bu: { label: 'BU', variant: 'outline' },
      company: { label: 'Company', variant: 'secondary' },
      common: { label: 'Common', variant: 'destructive' },
    };
    const m = map[type] || { label: type, variant: 'default' as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <h4 className="text-sm font-semibold">Production Rates (Per Ton)</h4>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Rate
        </Button>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="space-y-3 mb-4 p-3 border rounded-md bg-muted/30">
            <RadioGroup
              value={rateType}
              onValueChange={v => { setRateType(v as RateType); setSelectedEntity(''); }}
              className="flex flex-wrap gap-4"
            >
              {(['employee', 'department', 'bu', 'company', 'common'] as RateType[]).map(t => (
                <div key={t} className="flex items-center space-x-2">
                  <RadioGroupItem value={t} id={`rt-${t}`} />
                  <Label htmlFor={`rt-${t}`} className="text-sm capitalize">{t === 'bu' ? 'Business Unit' : t}</Label>
                </div>
              ))}
            </RadioGroup>

            <div className="flex items-end gap-2 flex-wrap">
              {rateType === 'employee' && (
                <div className="w-[220px]">
                  <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {allProfiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {formatEmployeeName(p.full_name, p.email, p.employee_code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {rateType === 'department' && (
                <div className="w-[220px]">
                  <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {rateType === 'bu' && (
                <div className="w-[220px]">
                  <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                    <SelectTrigger><SelectValue placeholder="Select business unit" /></SelectTrigger>
                    <SelectContent>
                      {businessUnits.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {rateType === 'company' && (
                <div className="w-[220px]">
                  <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Input className="w-[120px]" type="number" placeholder="Rate/Ton" value={newRate} onChange={e => setNewRate(e.target.value)} />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(newEffective, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newEffective}
                    onSelect={(d) => d && setNewEffective(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Input className="w-[160px]" placeholder="Remarks" value={newRemarks} onChange={e => setNewRemarks(e.target.value)} />
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={
                  upsert.isPending ||
                  (rateType !== 'common' && !selectedEntity)
                }
              >
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              "With Effect From" controls which rate applies to a given month (latest effective date ≤ period end wins). Older rates remain as history.
            </p>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Type</TableHead>
              <TableHead>Applies To</TableHead>
              <TableHead>Rate / Ton (₹)</TableHead>
              <TableHead>With Effect From</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : (rates as any[]).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No production rates configured. Add rates by employee, department, BU, company, or a common rate.</TableCell></TableRow>
            ) : (rates as any[]).map((r: any) => {
              const isEditing = editingId === r.id;
              const isSuperseded = latestPerScope.get(scopeKey(r)) !== (r.effective_from || '');
              const effDateStr = r.effective_from
                ? format(new Date(r.effective_from), 'dd MMM yyyy')
                : '—';
              return (
                <TableRow key={r.id} className={isSuperseded ? 'opacity-60' : ''}>
                  <TableCell>{rateTypeBadge(r.rate_type || 'employee')}</TableCell>
                  <TableCell>
                    {getAppliesTo(r)}
                    {isSuperseded && <Badge variant="outline" className="ml-2 text-[10px]">superseded</Badge>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input className="w-[100px]" type="number" value={editRate} onChange={e => setEditRate(e.target.value)} />
                    ) : (
                      `₹${Number(r.rate_per_ton).toLocaleString('en-IN')}`
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-[150px] justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                            {editEffective ? format(editEffective, 'dd MMM yyyy') : 'Pick date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={editEffective}
                            onSelect={(d) => d && setEditEffective(d)}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      effDateStr
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input className="w-[140px]" value={editRemarks} onChange={e => setEditRemarks(e.target.value)} />
                    ) : (
                      r.remarks || '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleSaveEdit(r)}><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => {
                          setEditingId(r.id);
                          setEditRate(String(r.rate_per_ton));
                          setEditRemarks(r.remarks || '');
                          setEditEffective(r.effective_from ? new Date(r.effective_from) : new Date());
                        }}><Edit className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setConfirmDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <ConfirmDestructiveDialog
        open={!!confirmDeleteId}
        onConfirm={() => {
          if (confirmDeleteId) {
            remove.mutate(
              { id: confirmDeleteId, programId },
              { onSuccess: () => setConfirmDeleteId(null) }
            );
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
        title="Delete Production Rate?"
        description="This will permanently delete this rate entry. Historical compute results that already used this rate are preserved, but future recomputes will fall back to the next available rate. This cannot be undone."
        confirmLabel="Delete Rate"
        isLoading={remove.isPending}
      />
    </Card>
  );
}
