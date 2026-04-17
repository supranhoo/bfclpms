import { useState } from 'react';
import { useVesselRates, useUpsertVesselRate, useDeleteVesselRate } from '@/hooks/useIncentiveVesselRates';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit, Check, X, Info } from 'lucide-react';
import { formatEmployeeName } from '@/lib/utils';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

interface Props {
  programId: string;
  minKraScore?: number;
}

export function VesselRateEditor({ programId, minKraScore = 3 }: Props) {
  const { data: rates = [], isLoading } = useVesselRates(programId);
  const upsert = useUpsertVesselRate();
  const remove = useDeleteVesselRate();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [newRate, setNewRate] = useState('10000');
  const [newRemarks, setNewRemarks] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Fetch all profiles for the employee selector
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-for-vessel'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, email')
        .order('full_name');
      return data || [];
    },
  });

  const assignedIds = new Set(rates.map((r: any) => r.employee_id));
  const availableProfiles = allProfiles.filter(p => !assignedIds.has(p.id));

  const handleAdd = () => {
    if (!selectedEmployee || !newRate) return;
    upsert.mutate({
      program_id: programId,
      employee_id: selectedEmployee,
      rate_per_vessel: parseFloat(newRate),
      remarks: newRemarks || undefined,
    }, {
      onSuccess: () => {
        setShowAdd(false);
        setSelectedEmployee('');
        setNewRate('10000');
        setNewRemarks('');
      },
    });
  };

  const startEdit = (rate: any) => {
    setEditingId(rate.id);
    setEditRate(String(rate.rate_per_vessel));
    setEditRemarks(rate.remarks || '');
  };

  const saveEdit = (rate: any) => {
    upsert.mutate({
      program_id: programId,
      employee_id: rate.employee_id,
      rate_per_vessel: parseFloat(editRate),
      remarks: editRemarks || undefined,
    }, {
      onSuccess: () => setEditingId(null),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-md bg-accent/30 border text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>
          Min KRA Score: <strong>{minKraScore}</strong> (auto-fetched from system) · Incentive Base: Fixed Amount per Vessel
        </span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm">Employee-wise Vessel Rates</h4>
              <p className="text-xs text-muted-foreground">Configure fixed ₹ amount per vessel for each eligible employee</p>
            </div>
            {!showAdd && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Employee
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {showAdd && (
            <div className="border rounded-md p-3 mb-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Employee</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {availableProfiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {formatEmployeeName(p.full_name, p.email, p.employee_code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Rate per Vessel (₹)</Label>
                  <Input type="number" className="mt-1" value={newRate} onChange={e => setNewRate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Remarks</Label>
                  <Input className="mt-1" value={newRemarks} onChange={e => setNewRemarks(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAdd} disabled={!selectedEmployee || !newRate || upsert.isPending}>
                  Add
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
          ) : rates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No vessel rates configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Rate / Vessel (₹)</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.profile?.full_name || r.employee_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{r.profile?.employee_code || '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === r.id ? (
                        <Input type="number" className="w-28 ml-auto" value={editRate} onChange={e => setEditRate(e.target.value)} />
                      ) : (
                        `₹${Number(r.rate_per_vessel).toLocaleString('en-IN')}`
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === r.id ? (
                        <Input className="w-40" value={editRemarks} onChange={e => setEditRemarks(e.target.value)} placeholder="Optional" />
                      ) : (
                        <span className="text-muted-foreground text-xs">{r.remarks || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === r.id ? (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => saveEdit(r)} title="Save">
                            <Check className="h-4 w-4 text-primary" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} title="Cancel">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => startEdit(r)} title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setConfirmDeleteId(r.id)} title="Remove">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ConfirmDestructiveDialog
        open={!!confirmDeleteId}
        onConfirm={() => {
          if (confirmDeleteId) {
            remove.mutate(confirmDeleteId, { onSuccess: () => setConfirmDeleteId(null) });
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
        title="Delete Vessel Rate?"
        description="This will permanently delete this vessel rate entry. Historical compute results that already used this rate are preserved. This cannot be undone."
        confirmLabel="Delete Rate"
        isLoading={remove.isPending}
      />
    </div>
  );
}
