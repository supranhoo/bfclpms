import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTemplateBundles, useLogBundleAssignment, TemplateBundle } from '@/hooks/useTemplateBundles';
import { useKpiTemplates, KpiTemplate } from '@/hooks/useKpiTemplates';
import { useDepartments } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Package, FileText, Target, Sparkles, CheckCircle, AlertTriangle, Copy } from 'lucide-react';
import { EffectiveMonthSelector } from './EffectiveMonthSelector';
import { getActiveMonthForCycle } from '@/lib/frequencyUtils';
import { formatKpiInsertError } from '@/lib/kpiErrorUtils';
import { useCanonicalResolver } from '@/hooks/useCanonicalResolver';
import { isCanonicalEnforcementPeriod } from '@/lib/canonicalEnforcementPeriod';
import { RegistryBadgePreset } from './kpi-standardization/RegistryBadge';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type AppRole = 'employee' | 'manager' | 'auditor' | 'admin' | 'management';

interface SmartAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  employeeDepartmentId?: string | null;
  employeeRole?: string;
}

export function SmartAssignmentDialog({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  employeeDepartmentId,
  employeeRole = 'employee',
}: SmartAssignmentDialogProps) {
  const { data: bundles } = useTemplateBundles();
  const { data: templates } = useKpiTemplates();
  const { data: departments } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logAssignment = useLogBundleAssignment();

  // Effective month/year — defaults to current calendar month
  const [selectedMonth, setSelectedMonth] = useState(() => MONTH_NAMES[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  const currentPeriod = selectedMonth;
  const currentYear = selectedYear;

  // State
  const [activeTab, setActiveTab] = useState<'bundles' | 'templates'>('bundles');
  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Fetch existing KPIs for this employee across all months in the year
  // (needed because multi-month frequencies resolve to different months)
  const { data: existingKpis } = useQuery({
    queryKey: ['employee-kpis-year', employeeId, currentYear],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('kpis')
        .select('id, kra_name, kpi_name, review_period')
        .eq('employee_id', employeeId)
        .eq('review_year', currentYear);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!employeeId,
  });

  // Create a set of existing KPI signatures for quick lookup (period-aware)
  const existingKpiSignatures = useMemo(() => {
    return new Set(
      existingKpis?.map(kpi => `${kpi.review_period}::${kpi.kra_name}::${kpi.kpi_name}`.toLowerCase()) || []
    );
  }, [existingKpis]);

  // Get active bundles, prioritize department matches
  const activeBundles = useMemo(() => {
    const active = bundles?.filter(b => b.is_active) || [];
    return [...active].sort((a, b) => {
      const aMatches = a.department_id === employeeDepartmentId;
      const bMatches = b.department_id === employeeDepartmentId;
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [bundles, employeeDepartmentId]);

  // Get suggested bundle
  const suggestedBundle = useMemo(() => {
    return activeBundles.find(b => b.department_id === employeeDepartmentId);
  }, [activeBundles, employeeDepartmentId]);

  // Get role-matching templates
  const roleTemplates = useMemo(() => {
    return templates?.filter(t => 
      t.is_active && 
      (t.applicable_roles.length === 0 || t.applicable_roles.includes(employeeRole as AppRole))
    ) || [];
  }, [templates, employeeRole]);

  // Selected bundle details
  const selectedBundle = useMemo(() => 
    bundles?.find(b => b.id === selectedBundleId),
    [bundles, selectedBundleId]
  );

  // Calculate total weightage for templates
  const totalTemplateWeightage = useMemo(() => {
    return Array.from(selectedTemplateIds).reduce((sum, id) => {
      const template = templates?.find(t => t.id === id);
      return sum + (template?.weightage || 0);
    }, 0);
  }, [selectedTemplateIds, templates]);

  // Detect duplicates in selected bundle (using resolved period)
  const bundleDuplicates = useMemo(() => {
    if (!selectedBundle?.template_bundle_items) return [];
    return selectedBundle.template_bundle_items.filter(item => {
      const resolvedPeriod = getActiveMonthForCycle(item.kpi_templates.frequency, currentPeriod, currentYear);
      const signature = `${resolvedPeriod}::${item.kpi_templates.kra_name}::${item.kpi_templates.kpi_name}`.toLowerCase();
      return existingKpiSignatures.has(signature);
    }).map(item => ({
      kra_name: item.kpi_templates.kra_name,
      kpi_name: item.kpi_templates.kpi_name,
    }));
  }, [selectedBundle, existingKpiSignatures, currentPeriod, currentYear]);

  // Detect duplicates in selected templates (using resolved period)
  const templateDuplicates = useMemo(() => {
    return Array.from(selectedTemplateIds)
      .map(id => templates?.find(t => t.id === id))
      .filter(template => {
        if (!template) return false;
        const resolvedPeriod = getActiveMonthForCycle(template.frequency, currentPeriod, currentYear);
        const signature = `${resolvedPeriod}::${template.kra_name}::${template.kpi_name}`.toLowerCase();
        return existingKpiSignatures.has(signature);
      })
      .map(template => ({
        id: template!.id,
        kra_name: template!.kra_name,
        kpi_name: template!.kpi_name,
      }));
  }, [selectedTemplateIds, templates, existingKpiSignatures, currentPeriod, currentYear]);

  // Check if template is a duplicate (using resolved period)
  const isTemplateDuplicate = (templateId: string) => {
    const template = templates?.find(t => t.id === templateId);
    if (!template) return false;
    const resolvedPeriod = getActiveMonthForCycle(template.frequency, currentPeriod, currentYear);
    const signature = `${resolvedPeriod}::${template.kra_name}::${template.kpi_name}`.toLowerCase();
    return existingKpiSignatures.has(signature);
  };

  // Current duplicates based on active tab
  const hasDuplicates = activeTab === 'bundles' 
    ? bundleDuplicates.length > 0 
    : templateDuplicates.length > 0;

  // Auto-select based on what's available
  useEffect(() => {
    if (!isOpen) return;
    
    // Reset state on open
    setSelectedBundleId('');
    setSelectedTemplateIds(new Set());
    
    // Determine best default tab
    if (suggestedBundle) {
      setActiveTab('bundles');
      setSelectedBundleId(suggestedBundle.id);
    } else if (roleTemplates.length > 0) {
      setActiveTab('templates');
      setSelectedTemplateIds(new Set(roleTemplates.map(t => t.id)));
    } else if (activeBundles.length > 0) {
      setActiveTab('bundles');
    }
  }, [isOpen, suggestedBundle, roleTemplates, activeBundles.length]);

  // Toggle template selection
  const toggleTemplate = (id: string) => {
    const newSet = new Set(selectedTemplateIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTemplateIds(newSet);
  };

  const toggleAllTemplates = () => {
    if (selectedTemplateIds.size === roleTemplates.length) {
      setSelectedTemplateIds(new Set());
    } else {
      setSelectedTemplateIds(new Set(roleTemplates.map(t => t.id)));
    }
  };

  // Assign bundle mutation
  const assignBundle = useMutation({
    mutationFn: async () => {
      if (!selectedBundle?.template_bundle_items) return { kpisCreated: 0, skipped: 0 };

      // Filter out duplicates if skipDuplicates is enabled
      const itemsToInsert = skipDuplicates 
        ? selectedBundle.template_bundle_items.filter(item => {
            const resolvedPeriod = getActiveMonthForCycle(item.kpi_templates.frequency, currentPeriod, currentYear);
            const signature = `${resolvedPeriod}::${item.kpi_templates.kra_name}::${item.kpi_templates.kpi_name}`.toLowerCase();
            return !existingKpiSignatures.has(signature);
          })
        : selectedBundle.template_bundle_items;

      if (itemsToInsert.length === 0) {
        return { kpisCreated: 0, skipped: selectedBundle.template_bundle_items.length };
      }

      const kpisToInsert = itemsToInsert.map(item => {
        const resolvedPeriod = getActiveMonthForCycle(item.kpi_templates.frequency, currentPeriod, currentYear);
        return {
          employee_id: employeeId,
          kra_name: item.kpi_templates.kra_name,
          kpi_name: item.kpi_templates.kpi_name,
          category_id: item.kpi_templates.kra_categories?.id || null,
          weightage: item.kpi_templates.weightage,
          uom: item.kpi_templates.uom,
          target_value: item.kpi_templates.target_value,
          criteria: item.kpi_templates.criteria,
          frequency: item.kpi_templates.frequency,
          source_of_data: item.kpi_templates.source_of_data,
          r5: item.kpi_templates.r5,
          r4: item.kpi_templates.r4,
          r3: item.kpi_templates.r3,
          r2: item.kpi_templates.r2,
          r1: item.kpi_templates.r1,
          r0: item.kpi_templates.r0,
          review_period: resolvedPeriod,
          review_year: currentYear,
          status: 'kra_set' as const,
          is_org_level: false,
          source_template_id: item.kpi_templates.id,
        };
      });

      const { error } = await supabase.from('kpis').insert(kpisToInsert);
      if (error) throw error;

      const skipped = selectedBundle.template_bundle_items.length - itemsToInsert.length;
      return { kpisCreated: kpisToInsert.length, skipped };
    },
    onSuccess: (data) => {
      // Log bundle assignment
      logAssignment.mutate([{
        bundle_id: selectedBundleId,
        employee_id: employeeId,
        review_period: currentPeriod,
        review_year: currentYear,
        kpis_created: data?.kpisCreated || 0,
      }]);

      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['employee-kpis'] });
      
      const skippedMsg = data?.skipped ? ` (${data.skipped} duplicates skipped)` : '';
      toast({
        title: 'KPIs Assigned Successfully',
        description: `${data?.kpisCreated} KPIs from "${selectedBundle?.name}" assigned to ${employeeName}${skippedMsg}`,
      });

      // Email deferred to "Issue KRAs" confirmation step

      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to assign KPIs',
        description: formatKpiInsertError(error, { selectedMonth: currentPeriod, selectedYear: currentYear }),
        variant: 'destructive',
      });
    },
  });

  // Assign templates mutation
  const assignTemplates = useMutation({
    mutationFn: async (templateIds: string[]) => {
      let selectedTemplates = templates?.filter(t => templateIds.includes(t.id)) || [];
      
      // Filter out duplicates if skipDuplicates is enabled
      if (skipDuplicates) {
        selectedTemplates = selectedTemplates.filter(template => {
          const resolvedPeriod = getActiveMonthForCycle(template.frequency, currentPeriod, currentYear);
          const signature = `${resolvedPeriod}::${template.kra_name}::${template.kpi_name}`.toLowerCase();
          return !existingKpiSignatures.has(signature);
        });
      }

      const skipped = templateIds.length - selectedTemplates.length;

      if (selectedTemplates.length === 0) {
        return { created: 0, skipped };
      }

      const kpisToInsert = selectedTemplates.map(template => {
        const resolvedPeriod = getActiveMonthForCycle(template.frequency, currentPeriod, currentYear);
        return {
          employee_id: employeeId,
          category_id: template.category_id!,
          kra_name: template.kra_name,
          kpi_name: template.kpi_name,
          uom: template.uom,
          target_value: template.target_value,
          weightage: template.weightage,
          criteria: template.criteria,
          frequency: template.frequency,
          source_of_data: template.source_of_data,
          r5: template.r5,
          r4: template.r4,
          r3: template.r3,
          r2: template.r2,
          r1: template.r1,
          r0: template.r0,
          review_period: resolvedPeriod,
          review_year: currentYear,
          is_org_level: false,
          status: 'kra_set' as const,
          source_template_id: template.id,
        };
      });

      const { error } = await supabase.from('kpis').insert(kpisToInsert);
      if (error) throw error;

      return { created: kpisToInsert.length, skipped };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['employee-kpis'] });
      
      const skippedMsg = data?.skipped ? ` (${data.skipped} duplicates skipped)` : '';
      toast({
        title: 'KPIs Assigned Successfully',
        description: `${data?.created} KPIs have been assigned to ${employeeName}${skippedMsg}`,
      });

      // Email deferred to "Issue KRAs" confirmation step

      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to assign KPIs',
        description: formatKpiInsertError(error, { selectedMonth: currentPeriod, selectedYear: currentYear }),
        variant: 'destructive',
      });
    },
  });

  const handleAssign = () => {
    if (activeTab === 'bundles' && selectedBundleId) {
      assignBundle.mutate();
    } else if (activeTab === 'templates' && selectedTemplateIds.size > 0) {
      assignTemplates.mutate(Array.from(selectedTemplateIds));
    }
  };

  const handleClose = () => {
    setSelectedBundleId('');
    setSelectedTemplateIds(new Set());
    setActiveTab('bundles');
    onClose();
  };

  const isPending = assignBundle.isPending || assignTemplates.isPending;
  const canAssign = activeTab === 'bundles' 
    ? !!selectedBundleId 
    : selectedTemplateIds.size > 0;
  
  // Calculate actual count (excluding duplicates if skipDuplicates is on)
  const bundleCount = selectedBundle?.template_bundle_items?.length || 0;
  const bundleNewCount = bundleCount - bundleDuplicates.length;
  const templateNewCount = selectedTemplateIds.size - templateDuplicates.length;
  
  const assignCount = activeTab === 'bundles'
    ? (skipDuplicates ? bundleNewCount : bundleCount)
    : (skipDuplicates ? templateNewCount : selectedTemplateIds.size);

  // Get department name
  const deptName = departments?.find(d => d.id === employeeDepartmentId)?.name;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Smart KRA Assignment
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            Assign KPIs to <strong>{employeeName}</strong>
            {deptName && <Badge variant="outline">{deptName}</Badge>}
            <Badge variant="secondary" className="capitalize">{employeeRole}</Badge>
          </DialogDescription>
        </DialogHeader>

        <EffectiveMonthSelector
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onMonthChange={setSelectedMonth}
          onYearChange={setSelectedYear}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'bundles' | 'templates')} className="flex-1 flex flex-col overflow-hidden mt-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bundles" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Bundles
              {suggestedBundle && (
                <Badge variant="default" className="text-xs ml-1">
                  <Sparkles className="h-3 w-3 mr-1" />1 Suggested
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
              {roleTemplates.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {roleTemplates.length} Available
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Bundles Tab */}
          <TabsContent value="bundles" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-[350px] pr-4">
              {activeBundles.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No active bundles available.</p>
                    <p className="text-sm">Create bundles in the KRA Library first.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {activeBundles.map(bundle => {
                    const isSelected = selectedBundleId === bundle.id;
                    const isSuggested = bundle.department_id === employeeDepartmentId;
                    return (
                      <Card
                        key={bundle.id}
                        className={`cursor-pointer transition-all hover:border-primary ${
                          isSelected ? 'border-primary ring-1 ring-primary bg-primary/5' : ''
                        } ${isSuggested && !isSelected ? 'border-primary/50' : ''}`}
                        onClick={() => setSelectedBundleId(bundle.id)}
                      >
                        <CardHeader className="py-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {isSelected && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                              <CardTitle className="text-base">{bundle.name}</CardTitle>
                              {isSuggested && (
                                <Badge variant="default" className="text-xs gap-1">
                                  <Sparkles className="h-3 w-3" />
                                  Suggested
                                </Badge>
                              )}
                            </div>
                            <Badge variant="secondary">
                              {bundle.template_bundle_items?.length || 0} KPIs
                            </Badge>
                          </div>
                          {bundle.description && (
                            <p className="text-sm text-muted-foreground mt-1">{bundle.description}</p>
                          )}
                          <div className="flex gap-2 mt-2">
                            {bundle.departments && (
                              <Badge variant="outline">{bundle.departments.name}</Badge>
                            )}
                            {bundle.designation && (
                              <Badge variant="outline">{bundle.designation}</Badge>
                            )}
                          </div>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="flex-1 overflow-hidden mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedTemplateIds.size} of {roleTemplates.length} selected
                </span>
                {totalTemplateWeightage > 0 && (
                  <Badge variant={totalTemplateWeightage > 100 ? 'destructive' : 'secondary'}>
                    {totalTemplateWeightage}% total
                    {totalTemplateWeightage > 100 && (
                      <AlertTriangle className="h-3 w-3 ml-1" />
                    )}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={toggleAllTemplates}>
                {selectedTemplateIds.size === roleTemplates.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <ScrollArea className="h-[310px] rounded-md border p-3">
              {roleTemplates.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No templates match this employee's role.</p>
                  <p className="text-sm">Create role-based templates in the KRA Library.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {roleTemplates.map(template => {
                    const isDuplicate = isTemplateDuplicate(template.id);
                    return (
                      <label
                        key={template.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors ${
                          selectedTemplateIds.has(template.id) ? 'border-primary bg-primary/5' : ''
                        } ${isDuplicate ? 'opacity-60' : ''}`}
                      >
                        <Checkbox
                          checked={selectedTemplateIds.has(template.id)}
                          onCheckedChange={() => toggleTemplate(template.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium truncate">{template.kra_name}</span>
                            {isDuplicate && (
                              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 gap-1">
                                <Copy className="h-3 w-3" />
                                Exists
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {template.kpi_name}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            {template.kra_categories && (
                              <Badge variant="outline" className="text-xs">
                                {template.kra_categories.name}
                              </Badge>
                            )}
                            {template.weightage && (
                              <Badge variant="secondary" className="text-xs">
                                {template.weightage}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Duplicate Warning */}
        {hasDuplicates && (
          <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <Copy className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <strong>
                    {activeTab === 'bundles' ? bundleDuplicates.length : templateDuplicates.length} duplicate(s) detected
                  </strong>
                  <span className="text-sm block mt-0.5">
                    This employee already has these KPIs assigned for {currentPeriod} {currentYear}:
                    <span className="font-medium ml-1">
                      {(activeTab === 'bundles' ? bundleDuplicates : templateDuplicates)
                        .slice(0, 2)
                        .map(d => d.kpi_name)
                        .join(', ')}
                      {(activeTab === 'bundles' ? bundleDuplicates : templateDuplicates).length > 2 && 
                        ` +${(activeTab === 'bundles' ? bundleDuplicates : templateDuplicates).length - 2} more`}
                    </span>
                  </span>
                </div>
                <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                  <Checkbox 
                    checked={skipDuplicates} 
                    onCheckedChange={(checked) => setSkipDuplicates(checked === true)}
                  />
                  <span className="text-sm">Skip duplicates</span>
                </label>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Skip
          </Button>
          <Button 
            onClick={handleAssign} 
            disabled={!canAssign || isPending || (hasDuplicates && skipDuplicates && assignCount === 0)}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                {assignCount === 0 ? 'No KPIs to Assign' : `Assign ${assignCount} KPIs`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
