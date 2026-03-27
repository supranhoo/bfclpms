import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { useAllocationRules, useUpsertAllocationRule, useDeleteAllocationRule } from '@/hooks/useProductionTargets';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  programId: string;
}

export function AllocationRulesEditor({ programId }: Props) {
  const { data: rules = [], isLoading } = useAllocationRules(programId);
  const upsertRule = useUpsertAllocationRule();
  const deleteRule = useDeleteAllocationRule();

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units'],
    queryFn: async () => {
      const { data } = await supabase.from('business_units').select('id, name').order('name');
      return data || [];
    },
  });

  const [newRule, setNewRule] = useState({ source_label: '', target_bu_id: '', target_sub_unit: '', allocation_pct: '' });

  const handleAdd = () => {
    if (!newRule.source_label || !newRule.allocation_pct) return;
    upsertRule.mutate({
      program_id: programId,
      source_label: newRule.source_label,
      target_bu_id: newRule.target_bu_id || null,
      target_sub_unit: newRule.target_sub_unit || null,
      allocation_pct: parseFloat(newRule.allocation_pct),
      sort_order: (rules as any[]).length,
    });
    setNewRule({ source_label: '', target_bu_id: '', target_sub_unit: '', allocation_pct: '' });
  };

  // Group by source_label and compute totals
  const sourceTotals = (rules as any[]).reduce((acc: Record<string, number>, r: any) => {
    acc[r.source_label] = (acc[r.source_label] || 0) + Number(r.allocation_pct);
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Allocation Rules</CardTitle>
        <CardDescription>Define weighted splits for common employee incentive distribution. Each source label should sum to 100%.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source label totals */}
        {Object.keys(sourceTotals).length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {Object.entries(sourceTotals).map(([label, total]) => (
              <Badge key={label} variant={Math.abs(total - 100) < 0.01 ? 'default' : 'destructive'}>
                {label}: {total}%{Math.abs(total - 100) >= 0.01 && ' ⚠'}
              </Badge>
            ))}
          </div>
        )}

        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source Label</TableHead>
                <TableHead>Target BU</TableHead>
                <TableHead>Target Sub-Unit</TableHead>
                <TableHead>Allocation %</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : (rules as any[]).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No allocation rules configured.</TableCell></TableRow>
              ) : (
                (rules as any[]).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.source_label}</TableCell>
                    <TableCell>{r.business_units?.name || '—'}</TableCell>
                    <TableCell>{r.target_sub_unit || '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{r.allocation_pct}%</Badge></TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => deleteRule.mutate(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {/* Add row */}
              <TableRow>
                <TableCell>
                  <Input value={newRule.source_label} onChange={e => setNewRule(p => ({ ...p, source_label: e.target.value }))} placeholder="e.g. CPP Common" className="h-8" />
                </TableCell>
                <TableCell>
                  <Select value={newRule.target_bu_id || 'none'} onValueChange={v => setNewRule(p => ({ ...p, target_bu_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Select BU" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {businessUnits.map((bu: any) => (
                        <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input value={newRule.target_sub_unit} onChange={e => setNewRule(p => ({ ...p, target_sub_unit: e.target.value }))} placeholder="Sub-unit" className="h-8 w-28" />
                </TableCell>
                <TableCell>
                  <Input type="number" value={newRule.allocation_pct} onChange={e => setNewRule(p => ({ ...p, allocation_pct: e.target.value }))} placeholder="%" className="h-8 w-20" />
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="outline" onClick={handleAdd} disabled={upsertRule.isPending}>
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
