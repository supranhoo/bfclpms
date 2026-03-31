import { useState } from 'react';
import { useProductionRates, useUpsertProductionRate, useDeleteProductionRate } from '@/hooks/useProductionDailyEntries';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit, Check, X } from 'lucide-react';
import { formatEmployeeName } from '@/lib/utils';

interface Props {
  programId: string;
}

export function ProductionRatesTab({ programId }: Props) {
  const { data: rates = [], isLoading } = useProductionRates(programId);
  const upsert = useUpsertProductionRate();
  const remove = useDeleteProductionRate();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
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

  const assignedIds = new Set((rates as any[]).map((r: any) => r.employee_id));
  const availableProfiles = allProfiles.filter(p => !assignedIds.has(p.id));

  const handleAdd = () => {
    if (!selectedEmployee || !newRate) return;
    upsert.mutate({
      program_id: programId,
      employee_id: selectedEmployee,
      rate_per_ton: parseFloat(newRate) || 0,
      remarks: newRemarks || undefined,
    }, {
      onSuccess: () => {
        setShowAdd(false);
        setSelectedEmployee('');
        setNewRate('0');
        setNewRemarks('');
      },
    });
  };

  const handleSaveEdit = (r: any) => {
    upsert.mutate({
      id: r.id,
      program_id: programId,
      employee_id: r.employee_id,
      rate_per_ton: parseFloat(editRate) || 0,
      remarks: editRemarks || undefined,
    }, {
      onSuccess: () => setEditingId(null),
    });
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
          <div className="flex items-end gap-2 mb-4 flex-wrap">
            <div className="w-[200px]">
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
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
            <Input className="w-[120px]" type="number" placeholder="Rate/Ton" value={newRate} onChange={e => setNewRate(e.target.value)} />
            <Input className="w-[160px]" placeholder="Remarks" value={newRemarks} onChange={e => setNewRemarks(e.target.value)} />
            <Button size="sm" onClick={handleAdd} disabled={!selectedEmployee || upsert.isPending}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Rate / Ton (₹)</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : (rates as any[]).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No production rates configured. Add employees and set their per-ton rate.</TableCell></TableRow>
            ) : (rates as any[]).map((r: any) => {
              const profile = r.profiles;
              const isEditing = editingId === r.id;
              return (
                <TableRow key={r.id}>
                  <TableCell>{formatEmployeeName(profile?.full_name, profile?.email || '', profile?.employee_code)}</TableCell>
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
