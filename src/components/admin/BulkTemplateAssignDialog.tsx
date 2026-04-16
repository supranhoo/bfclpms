import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Library, Users, Search, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { useKpiTemplates, KpiTemplate } from '@/hooks/useKpiTemplates';
import { useProfiles, useDepartments } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EffectiveMonthSelector } from './EffectiveMonthSelector';
import { getActiveMonthForCycle } from '@/lib/frequencyUtils';
import { formatKpiInsertError } from '@/lib/kpiErrorUtils';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface BulkTemplateAssignDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type AppRole = 'admin' | 'manager' | 'employee' | 'auditor' | 'management';

export function BulkTemplateAssignDialog({ isOpen, onClose }: BulkTemplateAssignDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: templates } = useKpiTemplates();
  const { data: profiles } = useProfiles();
  const { data: departments } = useDepartments();

  // Template selection state
  const [templateSearch, setTemplateSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [kraNameFilter, setKraNameFilter] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Employee selection state
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Duplicate detection state
  const [duplicateWarning, setDuplicateWarning] = useState<{ duplicates: string[]; newIds: string[] } | null>(null);

  // Effective month/year — defaults to current calendar month
  const [selectedMonth, setSelectedMonth] = useState(() => MONTH_NAMES[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  const currentPeriod = selectedMonth;
  const currentYear = selectedYear;

  const activeTemplates = useMemo(() => templates?.filter(t => t.is_active) || [], [templates]);

  // Cascading filter: categories with counts
  const categories = useMemo(() => {
    const cats = new Map<string, { id: string; name: string; color: string | null; count: number }>();
    activeTemplates.forEach(t => {
      if (t.kra_categories) {
        const existing = cats.get(t.kra_categories.id);
        cats.set(t.kra_categories.id, {
          id: t.kra_categories.id,
          name: t.kra_categories.name,
          color: t.kra_categories.color,
          count: (existing?.count || 0) + 1,
        });
      }
    });
    return Array.from(cats.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTemplates]);

  // Cascading filter: KRA names within selected category
  const kraNames = useMemo(() => {
    if (!categoryFilter) return [];
    const names = new Set<string>();
    activeTemplates
      .filter(t => t.category_id === categoryFilter)
      .forEach(t => names.add(t.kra_name));
    return Array.from(names).sort();
  }, [activeTemplates, categoryFilter]);

  // Cascading filter: KPI options matching all filters
  const kpiOptions = useMemo(() => {
    return activeTemplates.filter(t => {
      if (categoryFilter && t.category_id !== categoryFilter) return false;
      if (kraNameFilter && t.kra_name !== kraNameFilter) return false;
      if (templateSearch) {
        const q = templateSearch.toLowerCase();
        const matchesSearch =
          t.title.toLowerCase().includes(q) ||
          t.kra_name.toLowerCase().includes(q) ||
          t.kpi_name.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [activeTemplates, categoryFilter, kraNameFilter, templateSearch]);

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  // Employee filtering
  const filteredProfiles = useMemo(() => {
    return profiles?.filter(p => {
      const matchesSearch = !searchQuery ||
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email?.toLowerCase().includes(searchQuery.toLowerCase());
      const role = (p.user_roles as any)?.[0]?.role || 'employee';
      const matchesRole = roleFilter === 'all' || role === roleFilter;
      const matchesDept = departmentFilter === 'all' || p.department_id === departmentFilter;
      return matchesSearch && matchesRole && matchesDept;
    }) || [];
  }, [profiles, searchQuery, roleFilter, departmentFilter]);

  const toggleEmployee = (id: string) => {
    const newSet = new Set(selectedEmployeeIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedEmployeeIds(newSet);
    setDuplicateWarning(null);
  };

  const selectAllVisible = () => {
    setSelectedEmployeeIds(new Set(filteredProfiles.map(p => p.id)));
    setDuplicateWarning(null);
  };

  const clearSelection = () => {
    setSelectedEmployeeIds(new Set());
    setDuplicateWarning(null);
  };

  // Cascade resets
  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val === 'all' ? '' : val);
    setKraNameFilter('');
    setSelectedTemplateId('');
    setDuplicateWarning(null);
  };

  const handleKraChange = (val: string) => {
    setKraNameFilter(val === 'all' ? '' : val);
    setSelectedTemplateId('');
    setDuplicateWarning(null);
  };

  const handleKpiSelect = (id: string) => {
    setSelectedTemplateId(id);
    setDuplicateWarning(null);
  };

  const assignToEmployees = useMutation({
    mutationFn: async (employeeIds?: string[]) => {
      if (!selectedTemplate) throw new Error('No template selected');

      const idsToUse = employeeIds || Array.from(selectedEmployeeIds);
      if (idsToUse.length === 0) throw new Error('No employees to assign');

      const resolvedPeriod = getActiveMonthForCycle(selectedTemplate.frequency, currentPeriod, currentYear);
      const kpisToInsert = idsToUse.map(employeeId => ({
        employee_id: employeeId,
        category_id: selectedTemplate.category_id!,
        kra_name: selectedTemplate.kra_name,
        kpi_name: selectedTemplate.kpi_name,
        uom: selectedTemplate.uom,
        target_value: selectedTemplate.target_value,
        weightage: selectedTemplate.weightage,
        criteria: selectedTemplate.criteria,
        frequency: selectedTemplate.frequency,
        source_of_data: selectedTemplate.source_of_data,
        r5: selectedTemplate.r5,
        r4: selectedTemplate.r4,
        r3: selectedTemplate.r3,
        r2: selectedTemplate.r2,
        r1: selectedTemplate.r1,
        r0: selectedTemplate.r0,
        review_period: resolvedPeriod,
        review_year: currentYear,
        is_org_level: false,
        source_template_id: selectedTemplate.id,
      }));

      const { error } = await supabase.from('kpis').insert(kpisToInsert);
      if (error) throw error;
      return kpisToInsert.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      toast({
        title: 'Bulk Assignment Complete',
        description: `Assigned "${selectedTemplate?.kra_name}" to ${count} employees`,
      });
      handleClose();
    },
    onError: (error: any) => {
      const resolvedPeriod = selectedTemplate ? getActiveMonthForCycle(selectedTemplate.frequency, currentPeriod, currentYear) : currentPeriod;
      toast({ title: 'Failed to assign KPIs', description: formatKpiInsertError(error, { frequency: selectedTemplate?.frequency, selectedMonth: currentPeriod, resolvedMonth: resolvedPeriod, selectedYear: currentYear }), variant: 'destructive' });
    },
  });

  const handleAssign = async () => {
    if (!selectedTemplate) return;

    // Duplicate detection
    const { data: existing } = await supabase
      .from('kpis')
      .select('employee_id')
      .eq('kra_name', selectedTemplate.kra_name)
      .eq('kpi_name', selectedTemplate.kpi_name)
      .eq('review_period', getActiveMonthForCycle(selectedTemplate.frequency, currentPeriod, currentYear))
      .eq('review_year', currentYear)
      .in('employee_id', Array.from(selectedEmployeeIds));

    const duplicateIds = new Set(existing?.map(e => e.employee_id) || []);
    const newIds = Array.from(selectedEmployeeIds).filter(id => !duplicateIds.has(id));

    if (duplicateIds.size > 0) {
      const dupNames = profiles?.filter(p => duplicateIds.has(p.id)).map(p => p.full_name || p.email) || [];
      setDuplicateWarning({ duplicates: dupNames, newIds });
      return;
    }

    assignToEmployees.mutate(Array.from(selectedEmployeeIds));
  };

  const handleProceedSkipDuplicates = () => {
    if (!duplicateWarning) return;
    if (duplicateWarning.newIds.length === 0) {
      toast({ title: 'No new assignments', description: 'All selected employees already have this KPI.', variant: 'destructive' });
      setDuplicateWarning(null);
      return;
    }
    assignToEmployees.mutate(duplicateWarning.newIds);
    setDuplicateWarning(null);
  };

  const handleClose = () => {
    setTemplateSearch('');
    setCategoryFilter('');
    setKraNameFilter('');
    setSelectedTemplateId('');
    setSelectedEmployeeIds(new Set());
    setDepartmentFilter('all');
    setRoleFilter('all');
    setSearchQuery('');
    setDuplicateWarning(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Bulk Assign from Template
          </DialogTitle>
          <DialogDescription>
            Select a template using filters below, then assign to multiple employees
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 py-2">
            {/* Effective Month Selector */}
            <EffectiveMonthSelector
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
            />

            {/* Template Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates by name, KRA, or KPI..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {templateSearch && (
                <button onClick={() => setTemplateSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            {/* Cascading Filters */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
                <Select value={categoryFilter || 'all'} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          {c.name}
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">{c.count}</Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">KRA Name</Label>
                <Select
                  value={kraNameFilter || 'all'}
                  onValueChange={handleKraChange}
                  disabled={!categoryFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={categoryFilter ? 'Select KRA...' : 'Select category first'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All KRAs</SelectItem>
                    {kraNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">KPI Name</Label>
                <Select value={selectedTemplateId || 'none'} onValueChange={(v) => handleKpiSelect(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select KPI..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select KPI...</SelectItem>
                    {kpiOptions.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.kpi_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Matching count */}
            {!selectedTemplateId && (
              <p className="text-xs text-muted-foreground">
                {kpiOptions.length} template{kpiOptions.length !== 1 ? 's' : ''} match current filters
              </p>
            )}

            {/* Enhanced Preview Card */}
            {selectedTemplate && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1 border">
                <div className="flex items-center gap-2 mb-1">
                  {selectedTemplate.kra_categories && (
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={selectedTemplate.kra_categories.color ? { borderColor: selectedTemplate.kra_categories.color, color: selectedTemplate.kra_categories.color } : undefined}
                    >
                      {selectedTemplate.kra_categories.name}
                    </Badge>
                  )}
                  <span className="font-medium truncate">{selectedTemplate.title}</span>
                </div>
                <p><strong>KRA:</strong> {selectedTemplate.kra_name}</p>
                <p><strong>KPI:</strong> {selectedTemplate.kpi_name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground pt-1">
                  {selectedTemplate.target_value != null && <p>Target: {selectedTemplate.target_value} {selectedTemplate.uom}</p>}
                  {selectedTemplate.weightage != null && <p>Weightage: {selectedTemplate.weightage}%</p>}
                  {selectedTemplate.frequency && <p>Frequency: {selectedTemplate.frequency}</p>}
                  {selectedTemplate.criteria && <p>Criteria: {selectedTemplate.criteria}</p>}
                  {selectedTemplate.r5 && <p>R5: {selectedTemplate.r5}</p>}
                  {selectedTemplate.r4 && <p>R4: {selectedTemplate.r4}</p>}
                  {selectedTemplate.r3 && <p>R3: {selectedTemplate.r3}</p>}
                  {selectedTemplate.r2 && <p>R2: {selectedTemplate.r2}</p>}
                  {selectedTemplate.r1 && <p>R1: {selectedTemplate.r1}</p>}
                  {selectedTemplate.r0 && <p>R0: {selectedTemplate.r0}</p>}
                </div>
              </div>
            )}

            {/* Employee Filters */}
            <div className="grid grid-cols-3 gap-3">
              <div className="relative col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments?.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="management">Management</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Employee Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Select Employees ({selectedEmployeeIds.size} selected)
                </Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllVisible}>Select All</Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
                </div>
              </div>
              <ScrollArea className="h-[180px] rounded-md border p-2">
                <div className="space-y-1">
                  {filteredProfiles.map(profile => {
                    const role = (profile.user_roles as any)?.[0]?.role || 'employee';
                    return (
                      <label
                        key={profile.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedEmployeeIds.has(profile.id)}
                          onCheckedChange={() => toggleEmployee(profile.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{profile.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {(profile.departments as any)?.name || 'No dept'} · {role}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                  {filteredProfiles.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No employees match the filters</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Duplicate Warning */}
            {duplicateWarning && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">
                    {duplicateWarning.duplicates.length} employee{duplicateWarning.duplicates.length !== 1 ? 's' : ''} already ha{duplicateWarning.duplicates.length !== 1 ? 've' : 's'} this KPI:
                  </p>
                  <p className="text-xs mb-2">{duplicateWarning.duplicates.join(', ')}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDuplicateWarning(null)}>Cancel</Button>
                    <Button size="sm" onClick={handleProceedSkipDuplicates}>
                      Assign to {duplicateWarning.newIds.length} new employee{duplicateWarning.newIds.length !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedTemplateId || selectedEmployeeIds.size === 0 || assignToEmployees.isPending}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {assignToEmployees.isPending
              ? 'Assigning...'
              : `Assign to ${selectedEmployeeIds.size} Employees`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
