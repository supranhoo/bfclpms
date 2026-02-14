import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  useWorkflowTemplates, 
  useWorkflowConfigs, 
  useUpsertWorkflowConfig, 
  useDeleteWorkflowConfig,
  useDeleteWorkflowTemplate,
  useSetDefaultWorkflowTemplate,
  getStageLabel,
  type WorkflowTemplate,
} from '@/hooks/useWorkflowConfig';
import { useDepartments } from '@/hooks/useOrganization';
import { GitBranch, Users, Building2, Award, Trash2, Search, ArrowRight, Check, Plus, Pencil, Star } from 'lucide-react';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import CustomWorkflowDialog from '@/components/admin/CustomWorkflowDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// Stage color mapping
const stageColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  manager_check: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  audit: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  admin_review: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  management_review: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
};

function WorkflowStagesPreview({ stages }: { stages: string[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, index) => (
        <div key={stage} className="flex items-center gap-1">
          <Badge variant="outline" className={`text-xs ${stageColors[stage] || ''}`}>
            {getStageLabel(stage)}
          </Badge>
          {index < stages.length - 1 && (
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function WorkflowConfig() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);
  
  const { data: templates, isLoading: templatesLoading } = useWorkflowTemplates();
  const { data: configs, isLoading: configsLoading } = useWorkflowConfigs();
  const { data: departments } = useDepartments();
  const upsertConfig = useUpsertWorkflowConfig();
  const deleteConfig = useDeleteWorkflowConfig();
  const deleteTemplate = useDeleteWorkflowTemplate();
  const setDefaultTemplate = useSetDefaultWorkflowTemplate();
  
  // Fetch all profiles for employee tab
  const { data: profiles } = useQuery({
    queryKey: ['all-profiles-workflow'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code, pms_grade, department_id')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });
  
  // Get unique PMS grades
  const pmsGrades = useMemo(() => {
    if (!profiles) return [];
    const grades = profiles
      .map(p => p.pms_grade)
      .filter((g): g is string => !!g);
    return [...new Set(grades)].sort();
  }, [profiles]);
  
  // Filter employees by search
  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    if (!employeeSearch) return profiles;
    const search = employeeSearch.toLowerCase();
    return profiles.filter(p => 
      p.full_name?.toLowerCase().includes(search) ||
      p.email?.toLowerCase().includes(search) ||
      p.employee_code?.toLowerCase().includes(search)
    );
  }, [profiles, employeeSearch]);
  
  // Helper to get config for a specific type and value
  const getConfigFor = (type: string, value: string) => {
    return configs?.find(c => c.config_type === type && c.config_value === value);
  };
  
  // Helper to get template by id
  const getTemplate = (id: string) => {
    return templates?.find(t => t.id === id);
  };
  
  // Handle workflow assignment
  const handleAssignWorkflow = async (
    configType: 'employee' | 'department' | 'pms_grade',
    configValue: string,
    templateId: string
  ) => {
    try {
      await upsertConfig.mutateAsync({
        configType,
        configValue,
        workflowTemplateId: templateId,
      });
      toast({
        title: 'Workflow assigned',
        description: 'The workflow configuration has been saved.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to assign workflow.',
        variant: 'destructive',
      });
    }
  };
  
  // Handle config removal
  const handleRemoveConfig = async (configId: string) => {
    try {
      await deleteConfig.mutateAsync(configId);
      toast({
        title: 'Configuration removed',
        description: 'The workflow will now inherit from a higher level.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove configuration.',
        variant: 'destructive',
      });
    }
  };
  
  if (templatesLoading || configsLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workflow Configuration</h1>
        <p className="text-muted-foreground">
          Configure review workflows per employee, department, or PMS grade
        </p>
      </div>
      
      {/* Priority explanation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Priority Cascade
          </CardTitle>
          <CardDescription>
            Workflows are resolved in this order: Employee &gt; Department &gt; PMS Grade &gt; Default
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="templates">
            <Check className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="employee">
            <Users className="h-4 w-4 mr-2" />
            Per Employee
          </TabsTrigger>
          <TabsTrigger value="department">
            <Building2 className="h-4 w-4 mr-2" />
            Per Department
          </TabsTrigger>
          <TabsTrigger value="pms_grade">
            <Award className="h-4 w-4 mr-2" />
            Per PMS Grade
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Available Workflow Templates</CardTitle>
                  <CardDescription>
                    Predefined and custom workflows that can be assigned
                  </CardDescription>
                </div>
                <Button onClick={() => { setEditingTemplate(null); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Custom Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {templates?.map(template => (
                  <Card key={template.id} className={template.is_default ? 'border-primary' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{template.display_name}</h3>
                            {template.is_default && (
                              <Badge variant="secondary">Default</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingTemplate(template); setDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!template.is_default && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Set as Default"
                                disabled={setDefaultTemplate.isPending}
                                onClick={async () => {
                                  try {
                                    await setDefaultTemplate.mutateAsync(template.id);
                                    toast({
                                      title: 'Default updated',
                                      description: 'This only affects employees inheriting the default workflow.',
                                    });
                                  } catch {
                                    toast({ title: 'Error', description: 'Failed to set default.', variant: 'destructive' });
                                  }
                                }}
                              >
                                <Star className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTarget(template)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <WorkflowStagesPreview stages={template.stages} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Employee Tab */}
        <TabsContent value="employee" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Employee Workflow Overrides</CardTitle>
              <CardDescription>
                Assign specific workflows to individual employees (highest priority)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employees..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>PMS Grade</TableHead>
                    <TableHead>Assigned Workflow</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles?.slice(0, 50).map(profile => {
                    const config = getConfigFor('employee', profile.id);
                    const template = config ? getTemplate(config.workflow_template_id) : null;
                    
                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{profile.full_name}</div>
                            <div className="text-sm text-muted-foreground">{profile.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{profile.employee_code || '-'}</TableCell>
                        <TableCell>{profile.pms_grade || '-'}</TableCell>
                        <TableCell>
                          <Select
                            value={config?.workflow_template_id || ''}
                            onValueChange={(value) => handleAssignWorkflow('employee', profile.id, value)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Inherit (default)" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates?.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.display_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {template && (
                            <div className="mt-1">
                              <WorkflowStagesPreview stages={template.stages} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {config && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveConfig(config.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filteredProfiles && filteredProfiles.length > 50 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Showing 50 of {filteredProfiles.length} employees. Use search to find specific employees.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Department Tab */}
        <TabsContent value="department" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Workflows</CardTitle>
              <CardDescription>
                Assign workflows to entire departments (applies to all employees in that department)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Assigned Workflow</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments?.map(dept => {
                    const config = getConfigFor('department', dept.id);
                    const template = config ? getTemplate(config.workflow_template_id) : null;
                    
                    return (
                      <TableRow key={dept.id}>
                        <TableCell className="font-medium">{dept.name}</TableCell>
                        <TableCell>
                          <Select
                            value={config?.workflow_template_id || ''}
                            onValueChange={(value) => handleAssignWorkflow('department', dept.id, value)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Inherit (default)" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates?.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.display_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {template && (
                            <div className="mt-1">
                              <WorkflowStagesPreview stages={template.stages} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {config && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveConfig(config.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PMS Grade Tab */}
        <TabsContent value="pms_grade" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PMS Grade Workflows</CardTitle>
              <CardDescription>
                Assign workflows based on employee PMS grades
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pmsGrades.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No PMS grades found. Assign PMS grades to employees first.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PMS Grade</TableHead>
                      <TableHead>Employees</TableHead>
                      <TableHead>Assigned Workflow</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pmsGrades.map(grade => {
                      const config = getConfigFor('pms_grade', grade);
                      const template = config ? getTemplate(config.workflow_template_id) : null;
                      const employeeCount = profiles?.filter(p => p.pms_grade === grade).length || 0;
                      
                      return (
                        <TableRow key={grade}>
                          <TableCell className="font-medium">{grade}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{employeeCount}</Badge>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={config?.workflow_template_id || ''}
                              onValueChange={(value) => handleAssignWorkflow('pms_grade', grade, value)}
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Inherit (default)" />
                              </SelectTrigger>
                              <SelectContent>
                                {templates?.map(t => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.display_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {template && (
                              <div className="mt-1">
                                <WorkflowStagesPreview stages={template.stages} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {config && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveConfig(config.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Custom Workflow Dialog */}
      <CustomWorkflowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTemplate={editingTemplate}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.display_name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteTemplate.mutateAsync(deleteTarget.id);
                  toast({ title: 'Template deleted' });
                } catch (err: any) {
                  toast({
                    title: 'Cannot delete',
                    description: err?.message || 'Failed to delete template.',
                    variant: 'destructive',
                  });
                }
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
