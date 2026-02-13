import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Library, Users, Search, CheckCircle } from 'lucide-react';
import { useKpiTemplates, KpiTemplate } from '@/hooks/useKpiTemplates';
import { useProfiles, useDepartments } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { sendKraAssignmentNotifications } from '@/lib/kraNotifications';

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
  const { data: settingsArray } = useSystemSettings();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Get current review period and year from system settings
  const currentPeriodSetting = useMemo(() => {
    const setting = settingsArray?.find(s => s.setting_key === 'current_review_period');
    return setting?.setting_value as string | undefined;
  }, [settingsArray]);
  
  const currentPeriod = currentPeriodSetting?.split(' ')[0] || 'January';
  const currentYear = currentPeriodSetting 
    ? parseInt(currentPeriodSetting.split(' ')[1]) 
    : new Date().getFullYear();

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  const filteredProfiles = useMemo(() => {
    return profiles?.filter(p => {
      const matchesSearch = !searchQuery || 
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const role = (p.user_roles as any)?.[0]?.role || 'employee';
      const matchesRole = roleFilter === 'all' || role === roleFilter;
      const matchesDept = departmentFilter === 'all' || p.department_id === departmentFilter;
      
      return matchesSearch && matchesRole && matchesDept;
    }) || [];
  }, [profiles, searchQuery, roleFilter, departmentFilter]);

  const toggleEmployee = (id: string) => {
    const newSet = new Set(selectedEmployeeIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedEmployeeIds(newSet);
  };

  const selectAllVisible = () => {
    setSelectedEmployeeIds(new Set(filteredProfiles.map(p => p.id)));
  };

  const clearSelection = () => {
    setSelectedEmployeeIds(new Set());
  };

  const assignToEmployees = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('No template selected');
      
      const kpisToInsert = Array.from(selectedEmployeeIds).map(employeeId => ({
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
        review_period: currentPeriod,
        review_year: currentYear,
        is_org_level: false,
      }));

      const { error } = await supabase
        .from('kpis')
        .insert(kpisToInsert);

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

      // Send consolidated notifications per employee
      if (selectedTemplate) {
        const kraItem = {
          kra_name: selectedTemplate.kra_name,
          kpi_name: selectedTemplate.kpi_name,
          target_value: selectedTemplate.target_value,
          weightage: selectedTemplate.weightage,
          uom: selectedTemplate.uom || null,
        };
        Array.from(selectedEmployeeIds).forEach(empId => {
          sendKraAssignmentNotifications(empId, [kraItem], currentPeriod, currentYear);
        });
      }

      handleClose();
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to assign KPIs', 
        description: error.message, 
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setSelectedTemplateId('');
    setSelectedEmployeeIds(new Set());
    setDepartmentFilter('all');
    setRoleFilter('all');
    setSearchQuery('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Bulk Assign from Template
          </DialogTitle>
          <DialogDescription>
            Select a template and assign it to multiple employees at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template Selection */}
          <div>
            <Label>Select Template</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a KPI template..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.filter(t => t.is_active).map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      <span>{t.title}</span>
                      {t.kra_categories && (
                        <Badge variant="outline" className="text-xs">
                          {t.kra_categories.name}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate && (
              <div className="mt-2 p-3 rounded-lg bg-muted/50 text-sm">
                <p><strong>KRA:</strong> {selectedTemplate.kra_name}</p>
                <p><strong>KPI:</strong> {selectedTemplate.kpi_name}</p>
                {selectedTemplate.target_value && (
                  <p><strong>Target:</strong> {selectedTemplate.target_value} {selectedTemplate.uom}</p>
                )}
              </div>
            )}
          </div>

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
                <Button variant="ghost" size="sm" onClick={selectAllVisible}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[200px] rounded-md border p-2">
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
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No employees match the filters
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={() => assignToEmployees.mutate()} 
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
