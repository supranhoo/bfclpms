import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Save, X, Bug, ChevronDown, Calculator } from 'lucide-react';
import type { KPI } from '@/hooks/useKpis';
import { parseThreshold, calculateRating, ratingToLevel, levelToText } from '@/lib/ratingCalculation';
import { normalizeKpiText } from '@/lib/textFormatting';

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
  const [debugAchieved, setDebugAchieved] = useState('');
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
                <span className="font-semibold text-foreground whitespace-pre-wrap">{normalizeKpiText(kpi.kra_name)}</span>
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
                <p className="text-foreground whitespace-pre-wrap">{normalizeKpiText(kpi.kpi_name)}</p>
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
                    {!isEditing && (
                      <TableHead className="w-[100px] text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 cursor-help text-muted-foreground">
                                <Bug className="h-3.5 w-3.5" />
                                Parsed
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <p className="text-xs">Shows how thresholds are parsed for calculation. Ratios are used when target ≠ 0.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thresholds.map((t) => {
                    const targetVal = parseThreshold(kpi.target_value, false) ?? 0;
                    const thresholdsAsRatio = targetVal !== 0;
                    const parsedValue = parseThreshold(t.value, thresholdsAsRatio);
                    
                    return (
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
                        {!isEditing && (
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {parsedValue !== null ? parsedValue.toFixed(6) : '-'}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Debug Info Collapsible */}
          {!isEditing && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    Debug: Calculation Details
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-4 bg-muted/50 rounded-lg border text-xs font-mono space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Target (raw):</span>
                    <span>{kpi.target_value ?? 'null'}</span>
                    
                    <span className="text-muted-foreground">Target (parsed):</span>
                    <span>{parseThreshold(kpi.target_value, false) ?? 'null'}</span>
                    
                    <span className="text-muted-foreground">Criteria:</span>
                    <span>{kpi.criteria || 'Higher is Better'}</span>
                    
                    <span className="text-muted-foreground">Thresholds mode:</span>
                    <span>{(parseThreshold(kpi.target_value, false) ?? 0) !== 0 ? 'Ratio (÷100)' : 'Absolute'}</span>
                  </div>
                  
                  <div className="border-t border-border pt-2 mt-2">
                    <span className="text-muted-foreground block mb-1">Parsed Thresholds:</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'r5', label: 'R5', val: kpi.r5 },
                        { key: 'r4', label: 'R4', val: kpi.r4 },
                        { key: 'r3', label: 'R3', val: kpi.r3 },
                        { key: 'r2', label: 'R2', val: kpi.r2 },
                        { key: 'r1', label: 'R1', val: kpi.r1 },
                        { key: 'r0', label: 'R0', val: kpi.r0 },
                      ].map(item => {
                        const targetVal = parseThreshold(kpi.target_value, false) ?? 0;
                        const asRatio = targetVal !== 0;
                        const parsed = parseThreshold(item.val, asRatio);
                        return (
                          <div key={item.key} className="flex justify-between">
                            <span className="text-muted-foreground">{item.label}:</span>
                            <span>{item.val ? `"${item.val}" → ${parsed?.toFixed(6) ?? 'null'}` : '-'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="border-t border-border pt-2 mt-2">
                    <span className="text-muted-foreground block mb-1">Calculation Formula:</span>
                    <code className="block bg-background p-2 rounded text-[10px]">
                      {kpi.criteria?.toLowerCase().includes('lower') 
                        ? 'achievedWeight = target / achieved'
                        : 'achievedWeight = achieved / target'}
                      <br />
                      Compare achievedWeight against thresholds (higher = better rating)
                    </code>
                  </div>

                  {/* Live Calculation Preview */}
                  <div className="border-t border-border pt-3 mt-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground font-semibold">Live Calculation Preview</span>
                    </div>
                    
                    <div className="flex items-center gap-3 mb-3">
                      <Label htmlFor="debug-achieved" className="text-muted-foreground whitespace-nowrap">
                        Achieved Value:
                      </Label>
                      <Input
                        id="debug-achieved"
                        type="number"
                        step="any"
                        placeholder={`Enter value (${kpi.uom || 'number'})`}
                        value={debugAchieved}
                        onChange={(e) => setDebugAchieved(e.target.value)}
                        className="h-8 w-40 font-mono"
                      />
                    </div>

                    {debugAchieved && (() => {
                      const achievedNum = parseFloat(debugAchieved);
                      if (isNaN(achievedNum)) return (
                        <div className="text-destructive text-xs">Invalid number</div>
                      );

                      const result = calculateRating(
                        achievedNum,
                        kpi.target_value,
                        { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 },
                        kpi.criteria || 'Higher is Better',
                        kpi.weightage || 0,
                        kpi.uom_type || 'numeric',
                        kpi.qualitative_options || null,
                        kpi.uom
                      );

                      const targetVal = parseThreshold(kpi.target_value, false) ?? 0;
                      const isLowerBetter = kpi.criteria?.toLowerCase().includes('lower');

                      const ratingColors: Record<string, string> = {
                        blue: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700',
                        green: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700',
                        yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-200 dark:border-yellow-700',
                        red: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-200 dark:border-red-700',
                      };

                      return (
                        <div className="space-y-3">
                          {/* Calculation Steps */}
                          <div className="bg-background p-3 rounded border space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Achieved:</span>
                              <span className="font-semibold">{achievedNum}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Target:</span>
                              <span className="font-semibold">{targetVal}</span>
                            </div>
                            {targetVal !== 0 && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Formula:</span>
                                  <span>{isLowerBetter ? `${targetVal} / ${achievedNum}` : `${achievedNum} / ${targetVal}`}</span>
                                </div>
                                <div className="flex justify-between border-t border-dashed pt-1 mt-1">
                                  <span className="text-muted-foreground">Achieved Weight:</span>
                                  <span className="font-semibold">{result.achievedWeight.toFixed(6)}</span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Result */}
                          <div className={`p-3 rounded border ${ratingColors[result.ratingLevel]}`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs opacity-75">Rating Result</span>
                                <div className="text-2xl font-bold">{result.rating}</div>
                              </div>
                              <div className="text-right">
                                <Badge className={ratingColors[result.ratingLevel]}>
                                  {levelToText(result.ratingLevel)}
                                </Badge>
                                <div className="text-xs mt-1 opacity-75">
                                  {result.percentage.toFixed(2)}% | Score: {result.weightedScore.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
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
