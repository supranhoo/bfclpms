import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTemplateBundles, useLogBundleAssignment, TemplateBundle } from '@/hooks/useTemplateBundles';
import { useProfiles, useDepartments } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Package, Users, FileCheck, Sparkles } from 'lucide-react';
import { EffectiveMonthSelector } from './EffectiveMonthSelector';
import { getActiveMonthForCycle } from '@/lib/frequencyUtils';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface BundleAssignDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedEmployeeId?: string;
}

type AppRole = 'employee' | 'manager' | 'auditor' | 'admin' | 'management';

export function BundleAssignDialog({ isOpen, onClose, preselectedEmployeeId }: BundleAssignDialogProps) {
  const { data: bundles } = useTemplateBundles();
  const { data: profiles } = useProfiles();
  const { data: departments } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logAssignment = useLogBundleAssignment();

  const [step, setStep] = useState<'select-bundle' | 'select-employees' | 'preview'>(
    preselectedEmployeeId ? 'select-bundle' : 'select-employees'
  );
  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(
    preselectedEmployeeId ? [preselectedEmployeeId] : []
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  // Effective month/year — defaults to current calendar month
  const [selectedMonth, setSelectedMonth] = useState(() => MONTH_NAMES[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  const currentPeriod = selectedMonth;
  const currentYear = selectedYear;

  const selectedBundle = useMemo(() => 
    bundles?.find(b => b.id === selectedBundleId),
    [bundles, selectedBundleId]
  );

  // Get preselected employee's department for auto-suggestion
  const preselectedEmployee = useMemo(() => 
    preselectedEmployeeId ? profiles?.find(p => p.id === preselectedEmployeeId) : null,
    [profiles, preselectedEmployeeId]
  );

  const activeBundles = useMemo(() => 
    bundles?.filter(b => b.is_active) || [],
    [bundles]
  );

  // Sort bundles: matching department first, then by name
  const sortedBundles = useMemo(() => {
    if (!activeBundles.length) return [];
    const employeeDeptId = preselectedEmployee?.department_id;
    
    return [...activeBundles].sort((a, b) => {
      const aMatches = a.department_id === employeeDeptId;
      const bMatches = b.department_id === employeeDeptId;
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [activeBundles, preselectedEmployee?.department_id]);

  // Auto-select matching bundle on dialog open
  useMemo(() => {
    if (isOpen && preselectedEmployee?.department_id && !selectedBundleId) {
      const matchingBundle = activeBundles.find(
        b => b.department_id === preselectedEmployee.department_id
      );
      if (matchingBundle) {
        setSelectedBundleId(matchingBundle.id);
      }
    }
  }, [isOpen, preselectedEmployee?.department_id, activeBundles, selectedBundleId]);

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    return profiles.filter(p => {
      const matchesSearch = !searchQuery || 
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.employee_code?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDepartment = !departmentFilter || departmentFilter === 'all' || p.department_id === departmentFilter;
      const matchesRole = !roleFilter || roleFilter === 'all' || 
        p.user_roles?.some(r => r.role === roleFilter);
      return matchesSearch && matchesDepartment && matchesRole;
    });
  }, [profiles, searchQuery, departmentFilter, roleFilter]);

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const assignBundle = useMutation({
    mutationFn: async () => {
      if (!selectedBundle?.template_bundle_items) return { kpisCreated: 0 };

      const kpisToInsert = [];
      
      for (const employeeId of selectedEmployeeIds) {
        for (const item of selectedBundle.template_bundle_items) {
          const template = item.kpi_templates;
          const resolvedPeriod = getActiveMonthForCycle(template.frequency, currentPeriod, currentYear);
          kpisToInsert.push({
            employee_id: employeeId,
            kra_name: template.kra_name,
            kpi_name: template.kpi_name,
            category_id: template.kra_categories?.id || null,
            weightage: template.weightage,
            review_period: resolvedPeriod,
            review_year: currentYear,
            status: 'kra_set',
          });
        }
      }

      const { error } = await supabase
        .from('kpis')
        .insert(kpisToInsert);

      if (error) throw error;

      // Return info for logging
      return {
        kpisCreated: selectedBundle.template_bundle_items.length,
      };
    },
    onSuccess: (data) => {
      // Log assignment history for each employee
      const logs = selectedEmployeeIds.map(employeeId => ({
        bundle_id: selectedBundleId,
        employee_id: employeeId,
        review_period: currentPeriod,
        review_year: currentYear,
        kpis_created: data?.kpisCreated || 0,
      }));
      
      logAssignment.mutate(logs);

      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      toast({
        title: 'Bundle assigned successfully',
        description: `${selectedBundle?.template_bundle_items?.length || 0} KPIs assigned to ${selectedEmployeeIds.length} employee(s)`,
      });

      // Email deferred to "Issue KRAs" confirmation step

      handleClose();
    },
    onError: (error) => {
      toast({
        title: 'Failed to assign bundle',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setStep(preselectedEmployeeId ? 'select-bundle' : 'select-employees');
    setSelectedBundleId('');
    setSelectedEmployeeIds(preselectedEmployeeId ? [preselectedEmployeeId] : []);
    setSearchQuery('');
    setDepartmentFilter('');
    setRoleFilter('');
    onClose();
  };

  const canProceedToPreview = selectedBundleId && selectedEmployeeIds.length > 0;

  const selectedEmployeeNames = useMemo(() => {
    return profiles?.filter(p => selectedEmployeeIds.includes(p.id))
      .map(p => p.full_name || p.email) || [];
  }, [profiles, selectedEmployeeIds]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Assign KRA Bundle
          </DialogTitle>
          <DialogDescription>
            {step === 'select-bundle' && 'Step 1: Select a bundle to assign'}
            {step === 'select-employees' && 'Step 2: Select employees to receive the KPIs'}
            {step === 'preview' && 'Step 3: Review and confirm assignment'}
          </DialogDescription>
        </DialogHeader>

        <EffectiveMonthSelector
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onMonthChange={setSelectedMonth}
          onYearChange={setSelectedYear}
        />

        <ScrollArea className="flex-1 pr-4 mt-3">
          {/* Step 1: Select Bundle */}
          {step === 'select-bundle' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <Label>Select Bundle</Label>
                {preselectedEmployee?.department_id && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Sparkles className="h-3 w-3" />
                    Matching bundles shown first
                  </Badge>
                )}
              </div>
              {sortedBundles.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No active bundles available. Create one first.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {sortedBundles.map(bundle => {
                    const isRecommended = preselectedEmployee?.department_id && 
                      bundle.department_id === preselectedEmployee.department_id;
                    return (
                      <Card
                        key={bundle.id}
                        className={`cursor-pointer transition-colors hover:border-primary ${selectedBundleId === bundle.id ? 'border-primary bg-primary/5' : ''} ${isRecommended ? 'ring-1 ring-primary/30' : ''}`}
                        onClick={() => setSelectedBundleId(bundle.id)}
                      >
                        <CardHeader className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base">{bundle.name}</CardTitle>
                              {isRecommended && (
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
                            <p className="text-sm text-muted-foreground">{bundle.description}</p>
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
            </div>
          )}

          {/* Step 2: Select Employees */}
          {step === 'select-employees' && (
            <div className="space-y-4 py-4">
              {/* Filters */}
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or employee code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments?.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedEmployeeIds.length} employee(s) selected
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedEmployeeIds(filteredProfiles.map(p => p.id))}
                  >
                    Select All Visible
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedEmployeeIds([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="border rounded-md max-h-[350px] overflow-y-auto">
                {filteredProfiles.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No employees match your filters
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredProfiles.map((profile) => {
                      const isSelected = selectedEmployeeIds.includes(profile.id);
                      return (
                        <div
                          key={profile.id}
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
                          onClick={() => toggleEmployee(profile.id)}
                        >
                          <Checkbox checked={isSelected} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">
                              {profile.full_name || profile.email}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {profile.employee_code} • {profile.departments?.name || 'No Department'}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {profile.user_roles?.map(r => (
                              <Badge key={r.role} variant="outline" className="text-xs capitalize">
                                {r.role}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && selectedBundle && (
            <div className="space-y-6 py-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Bundle
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="font-semibold">{selectedBundle.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedBundle.template_bundle_items?.length || 0} KPIs
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Employees
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="font-semibold">{selectedEmployeeIds.length} selected</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {selectedEmployeeNames.slice(0, 2).join(', ')}
                      {selectedEmployeeNames.length > 2 && ` +${selectedEmployeeNames.length - 2} more`}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* KPIs to be assigned */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  KPIs to be Assigned
                </Label>
                <div className="border rounded-md max-h-[200px] overflow-y-auto">
                  <div className="divide-y">
                    {selectedBundle.template_bundle_items?.sort((a, b) => a.sort_order - b.sort_order).map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-3 p-3">
                        <span className="text-muted-foreground text-sm w-6">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{item.kpi_templates.kpi_name}</div>
                          <div className="text-xs text-muted-foreground">{item.kpi_templates.kra_name}</div>
                        </div>
                        {item.kpi_templates.kra_categories && (
                          <Badge variant="outline" className="text-xs">
                            {item.kpi_templates.kra_categories.name}
                          </Badge>
                        )}
                        <div className="text-sm text-muted-foreground">
                          {item.kpi_templates.weightage || 0}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Total */}
              <Card className="bg-muted/50">
                <CardContent className="py-4">
                  <div className="flex justify-between text-sm">
                    <span>Total KPIs to create:</span>
                    <span className="font-semibold">
                      {(selectedBundle.template_bundle_items?.length || 0) * selectedEmployeeIds.length}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>Review Period:</span>
                    <span className="font-semibold">{currentPeriod} {currentYear}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          {step !== 'select-bundle' && step !== 'select-employees' && (
            <Button variant="outline" onClick={() => setStep(preselectedEmployeeId ? 'select-bundle' : 'select-employees')}>
              Back
            </Button>
          )}
          
          {step === 'select-bundle' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button 
                onClick={() => setStep(preselectedEmployeeId ? 'preview' : 'select-employees')} 
                disabled={!selectedBundleId}
              >
                {preselectedEmployeeId ? 'Preview' : 'Next: Select Employees'}
              </Button>
            </>
          )}
          
          {step === 'select-employees' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button 
                onClick={() => setStep('select-bundle')} 
                disabled={selectedEmployeeIds.length === 0}
              >
                Next: Select Bundle
              </Button>
            </>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => assignBundle.mutate()} disabled={assignBundle.isPending}>
                {assignBundle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign Bundle
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
