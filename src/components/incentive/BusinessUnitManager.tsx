import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save } from 'lucide-react';
import { useBusinessUnitSubUnits, useUpsertSubUnit, useDeleteSubUnit } from '@/hooks/useProductionTargets';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function BusinessUnitManager() {
  const [selectedBU, setSelectedBU] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units'],
    queryFn: async () => {
      const { data } = await supabase.from('business_units').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: subUnits = [], isLoading } = useBusinessUnitSubUnits(selectedBU || undefined);
  const upsertSubUnit = useUpsertSubUnit();
  const deleteSubUnit = useDeleteSubUnit();

  const handleAdd = () => {
    if (!selectedBU || !newLabel.trim()) return;
    upsertSubUnit.mutate({
      business_unit_id: selectedBU,
      label: newLabel.trim(),
      capacity: newCapacity || undefined,
      sort_order: subUnits.length,
    });
    setNewLabel('');
    setNewCapacity('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Business Unit Sub-Units</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedBU || 'none'} onValueChange={v => setSelectedBU(v === 'none' ? '' : v)}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select Business Unit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none" disabled>Select Business Unit</SelectItem>
            {businessUnits.map((bu: any) => (
              <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedBU && (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label / Name</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : subUnits.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No sub-units. Add furnaces, lines, etc. below.</TableCell></TableRow>
                  ) : (
                    (subUnits as any[]).map((su: any) => (
                      <TableRow key={su.id}>
                        <TableCell className="font-medium">{su.label}</TableCell>
                        <TableCell>{su.capacity || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={su.is_active ? 'default' : 'outline'}>
                            {su.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => setDeletingId(su.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {/* Add row */}
                  <TableRow>
                    <TableCell>
                      <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. F-1&2, 1050 TPD" className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Input value={newCapacity} onChange={e => setNewCapacity(e.target.value)} placeholder="e.g. 100 TPD" className="h-8" />
                    </TableCell>
                    <TableCell />
                    <TableCell>
                      <Button size="icon" variant="outline" onClick={handleAdd} disabled={upsertSubUnit.isPending || !newLabel.trim()}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
