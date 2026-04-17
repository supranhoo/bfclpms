import { useState } from 'react';
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
import { Plus, Trash2, Edit, Check, X } from 'lucide-react';
import { formatEmployeeName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Props {
  programId: string;
}

type RateType = 'employee' | 'department' | 'bu' | 'company' | 'common';

export function ProductionRatesTab({ programId }: Props) {
  const { data: rates = [], isLoading } = useProductionRates(programId);
  const upsert = useUpsertProductionRate();
  const remove = useDeleteProductionRate();

  const [showAdd, setShowAdd] = useState(false);
  const [rateType, setRateType] = useState<RateType>('employee');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [newRate, setNewRate] = useState('0');
  const [newRemarks, setNewRemarks] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');

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

  const assignedEmployeeIds = new Set(
    (rates as any[]).filter((r: any) => r.rate_type === 'employee').map((r: any) => r.employee_id)
  );
  const availableProfiles = allProfiles.filter(p => !assignedEmployeeIds.has(p.id));

  const assignedDeptIds = new Set(
    (rates as any[]).filter((r: any) => r.rate_type === 'department').map((r: any) => r.entity_id)
  );
  const availableDepts = departments.filter(d => !assignedDeptIds.has(d.id));

  const assignedBUIds = new Set(
    (rates as any[]).filter((r: any) => r.rate_type === 'bu').map((r: any) => r.entity_id)
  );
  const availableBUs = businessUnits.filter(b => !assignedBUIds.has(b.id));

  const assignedCompanyIds = new Set(
    (rates as any[]).filter((r: any) => r.rate_type === 'company').map((r: any) => r.entity_id)
  );
  const availableCompanies = companies.filter(c => !assignedCompanyIds.has(c.id));

  const hasCommon = (rates as any[]).some((r: any) => r.rate_type === 'common');

  const handleAdd = () => {
    if (rateType === 'common') {
      if (!newRate) return;
      upsert.mutate({
        program_id: programId,
        rate_type: 'common',
        rate_per_ton: parseFloat(newRate) || 0,
        remarks: newRemarks || undefined,
      }, { onSuccess: resetAddForm });
    } else if (rateType === 'employee') {
      if (!selectedEntity || !newRate) return;
      upsert.mutate({
        program_id: programId,
        employee_id: selectedEntity,
        rate_type: 'employee',
        rate_per_ton: parseFloat(newRate) || 0,
        remarks: newRemarks || undefined,
      }, { onSuccess: resetAddForm });
    } else {
      if (!selectedEntity || !newRate) return;
      upsert.mutate({
        program_id: programId,
        rate_type: rateType,
        entity_id: selectedEntity,
        rate_per_ton: parseFloat(newRate) || 0,
        remarks: newRemarks || undefined,
      }, { onSuccess: resetAddForm });
    }
  };

  const resetAddForm = () => {
    setShowAdd(false);
    setSelectedEntity('');
    setNewRate('0');
    setNewRemarks('');
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
                      {availableProfiles.map(p => (
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
                      {availableDepts.map(d => (
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
                      {availableBUs.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Input className="w-[120px]" type="number" placeholder="Rate/Ton" value={newRate} onChange={e => setNewRate(e.target.value)} />
              <Input className="w-[160px]" placeholder="Remarks" value={newRemarks} onChange={e => setNewRemarks(e.target.value)} />
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={
                  upsert.isPending ||
                  (rateType !== 'common' && !selectedEntity) ||
                  (rateType === 'common' && hasCommon)
                }
              >
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
            {rateType === 'common' && hasCommon && (
              <p className="text-xs text-muted-foreground">A common rate already exists. Edit or delete it first.</p>
            )}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Type</TableHead>
              <TableHead>Applies To</TableHead>
              <TableHead>Rate / Ton (₹)</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : (rates as any[]).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No production rates configured. Add rates by employee, department, BU, or a common rate.</TableCell></TableRow>
            ) : (rates as any[]).map((r: any) => {
              const isEditing = editingId === r.id;
              return (
                <TableRow key={r.id}>
                  <TableCell>{rateTypeBadge(r.rate_type || 'employee')}</TableCell>
                  <TableCell>{getAppliesTo(r)}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input className="w-[100px]" type="number" value={editRate} onChange={e => setEditRate(e.target.value)} />
                    ) : (
                      `₹${Number(r.rate_per_ton).toLocaleString('en-IN')}`
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
                        <Button size="icon" variant="ghost" onClick={() => { setEditingId(r.id); setEditRate(String(r.rate_per_ton)); setEditRemarks(r.remarks || ''); }}><Edit className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate({ id: r.id, programId })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
