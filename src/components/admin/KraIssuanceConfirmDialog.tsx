import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertTriangle, Send, Info } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useKraCategories } from '@/hooks/useOrganization';
import { sendKraAssignmentNotifications, KraNotificationItem } from '@/lib/kraNotifications';

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

  const getEffectiveWeightage = (kpi: { id: string; weightage: number | null }) =>
    weightageOverrides[kpi.id] ?? kpi.weightage ?? 0;

  const totalWeightage = useMemo(() => {
    return kpis?.reduce((sum, k) => sum + getEffectiveWeightage(k), 0) || 0;
  }, [kpis, weightageOverrides]);

  const alreadyIssued = useMemo(() => {
    return kpis?.some(k => k.is_issued) || false;
  }, [kpis]);

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

      // Send consolidated notification (use updated weightage values)
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Issue KRAs — Confirmation
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

        {/* Weightage Summary */}
        <Card className="border-2">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {weightageIcon}
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Total Weightage</div>
                  <div className={`text-3xl font-bold ${weightageColor}`}>
                    {totalWeightage}%
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">{kpis?.length || 0} KPIs assigned</div>
                {!isWeightageValid && (
                  <div className="flex items-center gap-2 mt-2">
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
            </div>
          </CardContent>
        </Card>

        {/* KPI Table */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto border rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>KRA</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead className="text-center">UOM</TableHead>
                  <TableHead className="text-center">Target</TableHead>
                  <TableHead className="text-center">Weightage</TableHead>
                  <TableHead className="text-center">Frequency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis?.map((kpi, idx) => (
                  <TableRow key={kpi.id}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs max-w-[100px] truncate" title={getCategoryName(kpi.category_id)}>
                        {getCategoryName(kpi.category_id)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium max-w-[150px] truncate">{kpi.kra_name}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{kpi.kpi_name}</TableCell>
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
                {(!kpis || kpis.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No KPIs found for this employee and period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
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
  );
}
