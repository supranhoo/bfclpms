import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Save } from 'lucide-react';
import { useIncentiveSlabs, useUpsertSlab, useDeleteSlab } from '@/hooks/useIncentivePrograms';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SlabCategorySelector } from './SlabCategorySelector';
import { useIncentiveSlabCategories } from '@/hooks/useIncentiveSlabCategories';

interface Props {
  programId: string;
  programType: string;
}

// Slab categories are now DB-driven via incentive_slab_categories table

export function IncentiveSlabEditor({ programId, programType }: Props) {
  const { data: slabs = [], isLoading } = useIncentiveSlabs(programId);
  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units'],
    queryFn: async () => {
      const { data } = await supabase.from('business_units').select('id, name').order('name');
      return data || [];
    },
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return data || [];
    },
  });
  const upsertSlab = useUpsertSlab();
  const deleteSlab = useDeleteSlab();

  const [selectedCategory, setSelectedCategory] = useState('pms_score');
  const [selectedBU, setSelectedBU] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [newRow, setNewRow] = useState({ min_value: '', max_value: '', incentive_percent: '', rating_label: '', sub_category: '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredSlabs = slabs.filter((s: any) => {
    if (s.slab_category !== selectedCategory) return false;
    if (selectedBU && s.business_unit_id !== selectedBU) return false;
    if (selectedDept && s.department_id !== selectedDept) return false;
    return true;
  });

  const handleAddSlab = () => {
    if (!newRow.min_value || !newRow.max_value) return;
    upsertSlab.mutate({
      program_id: programId,
      slab_category: selectedCategory,
      business_unit_id: selectedBU || null,
      department_id: selectedDept || null,
      sub_category: newRow.sub_category || null,
      min_value: parseFloat(newRow.min_value),
      max_value: parseFloat(newRow.max_value),
      incentive_percent: parseFloat(newRow.incentive_percent || '0'),
      rating_label: newRow.rating_label || null,
      sort_order: filteredSlabs.length,
    });
    setNewRow({ min_value: '', max_value: '', incentive_percent: '', rating_label: '', sub_category: '' });
  };

  const { data: allCategories = [] } = useIncentiveSlabCategories();
  const allowedCategoryValues = programType === 'support'
    ? ['pms_score']
    : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Incentive Slabs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <SlabCategorySelector
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            allowedValues={allowedCategoryValues}
          />
          {programType === 'production' && (
            <Select value={selectedBU || 'all'} onValueChange={(v) => setSelectedBU(v === 'all' ? null : v)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All BUs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Business Units</SelectItem>
                {businessUnits.map((bu: any) => (
                  <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={selectedDept || 'all'} onValueChange={(v) => setSelectedDept(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {selectedCategory !== 'pms_score' && <TableHead>Sub-Category</TableHead>}
                <TableHead>Min Value</TableHead>
                <TableHead>Max Value</TableHead>
                <TableHead>Incentive %</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
              ) : filteredSlabs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No slabs configured</TableCell></TableRow>
              ) : (
                filteredSlabs.map((slab: any) => (
                  <TableRow key={slab.id}>
                    {selectedCategory !== 'pms_score' && <TableCell>{slab.sub_category || '—'}</TableCell>}
                    <TableCell>{slab.min_value}</TableCell>
                    <TableCell>{slab.max_value}</TableCell>
                    <TableCell><Badge variant="secondary">{slab.incentive_percent}%</Badge></TableCell>
                    <TableCell>{slab.rating_label || '—'}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => setDeletingId(slab.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {/* New row */}
              <TableRow>
                {selectedCategory !== 'pms_score' && (
                  <TableCell>
                    <Input placeholder="e.g. F1_F2" value={newRow.sub_category} onChange={e => setNewRow(p => ({ ...p, sub_category: e.target.value }))} className="h-8" />
                  </TableCell>
                )}
                <TableCell><Input type="number" placeholder="Min" value={newRow.min_value} onChange={e => setNewRow(p => ({ ...p, min_value: e.target.value }))} className="h-8 w-20" /></TableCell>
                <TableCell><Input type="number" placeholder="Max" value={newRow.max_value} onChange={e => setNewRow(p => ({ ...p, max_value: e.target.value }))} className="h-8 w-20" /></TableCell>
                <TableCell><Input type="number" placeholder="%" value={newRow.incentive_percent} onChange={e => setNewRow(p => ({ ...p, incentive_percent: e.target.value }))} className="h-8 w-20" /></TableCell>
                <TableCell><Input placeholder="R-5" value={newRow.rating_label} onChange={e => setNewRow(p => ({ ...p, rating_label: e.target.value }))} className="h-8 w-20" /></TableCell>
                <TableCell>
                  <Button size="icon" variant="outline" onClick={handleAddSlab} disabled={upsertSlab.isPending}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
