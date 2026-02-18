import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle, AlertTriangle, Send, Info, Plus, Trash2, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useKraCategories } from '@/hooks/useOrganization';
import { sendKraAssignmentNotifications, KraNotificationItem } from '@/lib/kraNotifications';
import { AdminKpiCreateDialog } from './AdminKpiCreateDialog';

interface KraIssuanceConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onIssuanceComplete?: () => void;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  reviewPeriod: string;
  reviewYear: number;
}

export function KraIssuanceConfirmDialog({
  isOpen,
  onClose,
  onIssuanceComplete,
  employeeId,
  employeeName,
  employeeCode,
  reviewPeriod,
  reviewYear,
}: KraIssuanceConfirmDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: categories } = useKraCategories();
  const [allowNon100, setAllowNon100] = useState(false);
  const [weightageOverrides, setWeightageOverrides] = useState<Record<string, number>>({});
  const [selectedKpiIds, setSelectedKpiIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isAddKraOpen, setIsAddKraOpen] = useState(false);

  // Fetch all KPIs for this employee/period
  const { data: kpis, isLoading } = useQuery({
    queryKey: ['issuance-kpis', employeeId, reviewPeriod, reviewYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select('id, category_id, kra_name, kpi_name, uom, target_value, weightage, frequency, is_issued, is_org_level')
        .eq('employee_id', employeeId)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .order('kra_name');
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!employeeId,
  });

  const getEffectiveWeightage = useCallback((kpi: { id: string; weightage: number | null }) =>
    weightageOverrides[kpi.id] ?? kpi.weightage ?? 0, [weightageOverrides]);

  const totalWeightage = useMemo(() => {
    return kpis?.reduce((sum, k) => sum + getEffectiveWeightage(k), 0) || 0;
  }, [kpis, getEffectiveWeightage]);

  const alreadyIssued = useMemo(() => {
    return kpis?.some(k => k.is_issued) || false;
  }, [kpis]);

  const hasUnsavedChanges = Object.keys(weightageOverrides).length > 0;
  const isWeightageValid = totalWeightage === 100;
  const canIssue = (isWeightageValid || allowNon100) && (kpis?.length || 0) > 0;

  const weightageColor = isWeightageValid
    ? 'text-primary'
    : totalWeightage < 100
      ? 'text-warning'
      : 'text-destructive';

  const weightageIcon = isWeightageValid
    ? <CheckCircle className="h-5 w-5 text-primary" />
    : <AlertTriangle className="h-5 w-5 text-warning" />;

  // Save Draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const changed = Object.entries(weightageOverrides);
      if (changed.length === 0) throw new Error('No changes to save');
      for (const [id, newVal] of changed) {
        const { error } = await supabase.from('kpis').update({ weightage: newVal }).eq('id', id);
        if (error) throw error;
      }
      return changed.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['issuance-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      setWeightageOverrides({});
      toast({ title: 'Draft Saved', description: `${count} weightage(s) updated successfully.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Remove KPIs mutation
  const removeKpisMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('kpis').delete().in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['issuance-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      setSelectedKpiIds(new Set());
      // Clear weightage overrides for deleted KPIs
      setWeightageOverrides(prev => {
        const next = { ...prev };
        for (const id of selectedKpiIds) delete next[id];
        return next;
      });
      toast({ title: `${count} KPI(s) Removed`, description: 'The selected KPIs have been deleted.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Removal Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Issue mutation
  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!kpis || kpis.length === 0) throw new Error('No KPIs to issue');

      // Save changed weightages first
      const changed = Object.entries(weightageOverrides);
      for (const [id, newVal] of changed) {
        const { error } = await supabase.from('kpis').update({ weightage: newVal }).eq('id', id);
        if (error) throw error;
      }

      // Mark all KPIs as issued
      const kpiIds = kpis.map(k => k.id);
      const { error } = await supabase
        .from('kpis')
        .update({ is_issued: true } as any)
        .in('id', kpiIds);
      if (error) throw error;

      // Send consolidated notification
      const kraItems: KraNotificationItem[] = kpis.map(k => ({
        kra_name: k.kra_name,
        kpi_name: k.kpi_name,
        target_value: k.target_value,
        weightage: getEffectiveWeightage(k),
        uom: k.uom,
      }));
      await sendKraAssignmentNotifications(employeeId, kraItems, reviewPeriod, reviewYear);

      return kpiIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['issuance-kpis'] });
      toast({
        title: 'KRAs Issued Successfully',
        description: `${count} KPIs issued to ${employeeName}. Notification sent.`,
      });
      onClose();
      onIssuanceComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Issuance Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getCategoryName = (categoryId: string) => {
    return categories?.find(c => c.id === categoryId)?.name || '-';
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    setWeightageOverrides({});
    setSelectedKpiIds(new Set());
    setShowDiscardConfirm(false);
    onClose();
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && kpis) {
      setSelectedKpiIds(new Set(kpis.map(k => k.id)));
    } else {
      setSelectedKpiIds(new Set());
    }
  };

  const handleSelectOne = (kpiId: string, checked: boolean) => {
    setSelectedKpiIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(kpiId); else next.delete(kpiId);
      return next;
    });
  };

  const handleConfirmRemove = () => {
    const ids = Array.from(selectedKpiIds);
    removeKpisMutation.mutate(ids);
    setShowDeleteConfirm(false);
  };

  const handleAddKraClose = () => {
    setIsAddKraOpen(false);
    queryClient.invalidateQueries({ queryKey: ['issuance-kpis'] });
  };

  const selectedKpiNames = useMemo(() => {
    if (!kpis) return [];
    return kpis.filter(k => selectedKpiIds.has(k.id)).map(k => k.kpi_name);
  }, [kpis, selectedKpiIds]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Issue KRAs — Confirmation
              {selectedKpiIds.size > 0 && (
                <Badge variant="secondary" className="ml-2">{selectedKpiIds.size} selected</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Review all assigned KPIs for <strong>{employeeName}</strong>
              {employeeCode && <span> ({employeeCode})</span>}
              {' '}· {reviewPeriod} {reviewYear}
            </DialogDescription>
          </DialogHeader>

          {/* Already issued warning */}
          {alreadyIssued && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Some KPIs have already been issued. Confirming will re-issue and send a new notification.
              </AlertDescription>
            </Alert>
          )}

          {/* Weightage Summary + Action Buttons */}
          <Card className="border-2">
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {weightageIcon}
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Total Weightage</div>
                    <div className={`text-3xl font-bold ${weightageColor}`}>
                      {totalWeightage}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedKpiIds.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={removeKpisMutation.isPending}
                    >
                      {removeKpisMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      Remove Selected ({selectedKpiIds.size})
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddKraOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add KRA
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-sm text-muted-foreground">{kpis?.length || 0} KPIs assigned</div>
                {!isWeightageValid && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="allow-override"
                      checked={allowNon100}
                      onCheckedChange={setAllowNon100}
                    />
                    <Label htmlFor="allow-override" className="text-xs text-muted-foreground">
                      Allow non-100%
                    </Label>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KPI Table */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (kpis?.length || 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <p className="text-muted-foreground">No KPIs found for this employee and period.</p>
                <Button variant="outline" onClick={() => setIsAddKraOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add KRA
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={kpis!.length > 0 && selectedKpiIds.size === kpis!.length}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      />
                    </TableHead>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead className="min-w-[130px]">Category</TableHead>
                    <TableHead className="min-w-[200px]">KRA</TableHead>
                    <TableHead className="min-w-[200px]">KPI</TableHead>
                    <TableHead className="text-center w-20">UOM</TableHead>
                    <TableHead className="text-center w-20">Target</TableHead>
                    <TableHead className="text-center w-28">Weightage</TableHead>
                    <TableHead className="text-center w-24">Frequency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpis!.map((kpi, idx) => (
                    <TableRow key={kpi.id} data-state={selectedKpiIds.has(kpi.id) ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedKpiIds.has(kpi.id)}
                          onCheckedChange={(checked) => handleSelectOne(kpi.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {getCategoryName(kpi.category_id)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top font-medium whitespace-normal leading-snug">{kpi.kra_name}</TableCell>
                      <TableCell className="align-top whitespace-normal leading-snug text-muted-foreground">{kpi.kpi_name}</TableCell>
                      <TableCell className="text-center text-sm">{kpi.uom || '-'}</TableCell>
                      <TableCell className="text-center text-sm">{kpi.target_value ?? '-'}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Input
                            type="number"
                            className="w-16 h-8 text-center font-mono text-sm px-1"
                            value={getEffectiveWeightage(kpi)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setWeightageOverrides(prev => ({
                                ...prev,
                                [kpi.id]: isNaN(val) ? 0 : val,
                              }));
                            }}
                            min={0}
                            max={100}
                            step={1}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                          {weightageOverrides[kpi.id] != null && (
                            <span className="h-2 w-2 rounded-full bg-primary inline-block" title="Edited" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">{kpi.frequency || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => saveDraftMutation.mutate()}
              disabled={!hasUnsavedChanges || saveDraftMutation.isPending}
            >
              {saveDraftMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </>
              )}
            </Button>
            <Button
              onClick={() => issueMutation.mutate()}
              disabled={!canIssue || issueMutation.isPending}
            >
              {issueMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Issuing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Confirm & Issue KRAs
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add KRA Dialog */}
      <AdminKpiCreateDialog
        isOpen={isAddKraOpen}
        onClose={handleAddKraClose}
        defaultEmployeeId={employeeId}
        defaultReviewPeriod={reviewPeriod}
        defaultReviewYear={reviewYear}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedKpiIds.size} KPI(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              The following KPIs will be permanently deleted:
              <ul className="mt-2 list-disc pl-5 space-y-1 text-sm">
                {selectedKpiNames.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Changes Confirmation */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved weightage changes. Do you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={resetAndClose}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
