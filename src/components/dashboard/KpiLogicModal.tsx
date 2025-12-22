import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Save, X } from 'lucide-react';
import type { KPI } from '@/hooks/useKpis';

interface KpiLogicModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
}

export function KpiLogicModal({ isOpen, onClose, kpi }: KpiLogicModalProps) {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    kpi_name: '',
    kra_name: '',
    target_value: '',
    uom: '',
    criteria: '',
    source_of_data: '',
    frequency: '',
    r5: '',
    r4: '',
    r3: '',
    r2: '',
    r1: '',
    r0: '',
  });

  const canEdit = role === 'admin';

  const updateKpiMutation = useMutation({
    mutationFn: async (data: typeof editData) => {
      const { error } = await supabase
        .from('kpis')
        .update({
          kpi_name: data.kpi_name,
          kra_name: data.kra_name,
          target_value: data.target_value ? parseFloat(data.target_value) : null,
          uom: data.uom || null,
          criteria: data.criteria || null,
          source_of_data: data.source_of_data || null,
          frequency: data.frequency || null,
          r5: data.r5 || null,
          r4: data.r4 || null,
          r3: data.r3 || null,
          r2: data.r2 || null,
          r1: data.r1 || null,
          r0: data.r0 || null,
        })
        .eq('id', kpi!.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      toast({ title: 'KPI updated successfully' });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update KPI', description: error.message, variant: 'destructive' });
    },
  });

  const startEditing = () => {
    if (!kpi) return;
    setEditData({
      kpi_name: kpi.kpi_name || '',
      kra_name: kpi.kra_name || '',
      target_value: kpi.target_value?.toString() || '',
      uom: kpi.uom || '',
      criteria: kpi.criteria || '',
      source_of_data: kpi.source_of_data || '',
      frequency: kpi.frequency || '',
      r5: kpi.r5 || '',
      r4: kpi.r4 || '',
      r3: kpi.r3 || '',
      r2: kpi.r2 || '',
      r1: kpi.r1 || '',
      r0: kpi.r0 || '',
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = () => {
    updateKpiMutation.mutate(editData);
  };

  if (!kpi) return null;

  const thresholds = [
    { rating: 5, label: 'Exceptional', value: isEditing ? editData.r5 : kpi.r5, key: 'r5', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' },
    { rating: 4, label: 'Exceeds', value: isEditing ? editData.r4 : kpi.r4, key: 'r4', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' },
    { rating: 3, label: 'Meets', value: isEditing ? editData.r3 : kpi.r3, key: 'r3', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200' },
    { rating: 2, label: 'Below', value: isEditing ? editData.r2 : kpi.r2, key: 'r2', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200' },
    { rating: 1, label: 'Needs Improvement', value: isEditing ? editData.r1 : kpi.r1, key: 'r1', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' },
    { rating: 0, label: 'Not Achieved', value: isEditing ? editData.r0 : kpi.r0, key: 'r0', color: 'bg-red-200 text-red-800 dark:bg-red-950 dark:text-red-200' },
  ];

  const displayValue = isEditing ? editData : {
    kpi_name: kpi.kpi_name,
    kra_name: kpi.kra_name,
    target_value: kpi.target_value?.toString() || '',
    uom: kpi.uom || '',
    criteria: kpi.criteria || 'Higher is Better',
    source_of_data: kpi.source_of_data || '',
    frequency: kpi.frequency || 'Monthly',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg">KPI Details</DialogTitle>
              {kpi.id && (
                <Badge variant="outline" className="text-xs font-mono">
                  {kpi.id.slice(0, 8).toUpperCase()}
                </Badge>
              )}
            </div>
            {canEdit && !isEditing && (
              <Button variant="ghost" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
          <DialogDescription className="sr-only">
            View KPI details and rating thresholds
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* KRA Name */}
          <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
            {isEditing ? (
              <div className="space-y-2">
                <Label>KRA Name</Label>
                <Input
                  value={editData.kra_name}
                  onChange={(e) => setEditData({ ...editData, kra_name: e.target.value })}
                  className="bg-background"
                />
              </div>
            ) : (
              <>
                <span className="text-xs text-muted-foreground block mb-1">KRA Name</span>
                <span className="font-semibold text-foreground">{kpi.kra_name}</span>
              </>
            )}
          </div>

          {/* KPI Name */}
          <div>
            {isEditing ? (
              <div className="space-y-2">
                <Label>KPI Name</Label>
                <Textarea
                  value={editData.kpi_name}
                  onChange={(e) => setEditData({ ...editData, kpi_name: e.target.value })}
                  rows={2}
                />
              </div>
            ) : (
              <>
                <span className="text-xs text-muted-foreground block mb-1">KPI Name</span>
                <p className="text-foreground">{kpi.kpi_name}</p>
              </>
            )}
          </div>

          {/* KPI Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Unit of Measure</span>
              {isEditing ? (
                <Input
                  value={editData.uom}
                  onChange={(e) => setEditData({ ...editData, uom: e.target.value })}
                  placeholder="e.g., %, Count"
                  className="h-8"
                />
              ) : (
                <span className="font-semibold">{kpi.uom || '-'}</span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Target</span>
              {isEditing ? (
                <Input
                  type="number"
                  value={editData.target_value}
                  onChange={(e) => setEditData({ ...editData, target_value: e.target.value })}
                  className="h-8"
                />
              ) : (
                <span className="font-semibold">{kpi.target_value ?? '-'} {kpi.uom}</span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Criteria</span>
              {isEditing ? (
                <Input
                  value={editData.criteria}
                  onChange={(e) => setEditData({ ...editData, criteria: e.target.value })}
                  placeholder="Higher is Better"
                  className="h-8"
                />
              ) : (
                <span className="font-semibold text-sm">{kpi.criteria || 'Higher is Better'}</span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Weightage</span>
              <span className="font-semibold">{kpi.weightage}%</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Frequency</span>
              {isEditing ? (
                <Input
                  value={editData.frequency}
                  onChange={(e) => setEditData({ ...editData, frequency: e.target.value })}
                  placeholder="Monthly"
                  className="h-8"
                />
              ) : (
                <span className="font-semibold">{kpi.frequency || 'Monthly'}</span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Category</span>
              <div className="flex items-center gap-1.5">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: kpi.kra_categories?.color || '#6B7280' }}
                />
                <span className="font-semibold text-sm">{kpi.kra_categories?.name || '-'}</span>
              </div>
            </div>
          </div>

          {/* Source of Data */}
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Source of Data</span>
            {isEditing ? (
              <Textarea
                value={editData.source_of_data}
                onChange={(e) => setEditData({ ...editData, source_of_data: e.target.value })}
                placeholder="Enter data source..."
                rows={2}
              />
            ) : (
              <p className="text-sm text-foreground bg-muted/50 p-3 rounded-lg">
                {kpi.source_of_data || 'Not specified'}
              </p>
            )}
          </div>

          {/* Rating Thresholds */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Rating Logic</h4>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Rating</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Threshold Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thresholds.map((t) => (
                    <TableRow key={t.rating}>
                      <TableCell>
                        <Badge className={t.color}>{t.rating}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{t.label}</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={t.value || ''}
                            onChange={(e) => setEditData({ ...editData, [t.key]: e.target.value })}
                            placeholder={`R${t.rating} threshold`}
                            className="h-8 w-32"
                          />
                        ) : (
                          t.value ? `${t.value} ${kpi.uom || ''}` : <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {isEditing && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelEditing} disabled={updateKpiMutation.isPending}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateKpiMutation.isPending}>
              <Save className="h-4 w-4 mr-1" />
              Save Changes
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
