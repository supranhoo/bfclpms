import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Library, CheckCircle, Target } from 'lucide-react';
import { KpiTemplate } from '@/hooks/useKpiTemplates';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSystemSettings } from '@/hooks/useSystemSettings';

interface TemplateAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  templates: KpiTemplate[];
  employeeId: string;
  employeeName: string;
}

export function TemplateAssignmentDialog({
  isOpen,
  onClose,
  templates,
  employeeId,
  employeeName,
}: TemplateAssignmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settingsArray } = useSystemSettings();
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(
    new Set(templates.map(t => t.id))
  );

  // Get current review period and year from system settings
  const currentPeriodSetting = useMemo(() => {
    const setting = settingsArray?.find(s => s.setting_key === 'current_review_period');
    return setting?.setting_value as string | undefined;
  }, [settingsArray]);
  
  const currentPeriod = currentPeriodSetting?.split(' ')[0] || 'January';
  const currentYear = currentPeriodSetting 
    ? parseInt(currentPeriodSetting.split(' ')[1]) 
    : new Date().getFullYear();

  const toggleTemplate = (id: string) => {
    const newSet = new Set(selectedTemplateIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTemplateIds(newSet);
  };

  const toggleAll = () => {
    if (selectedTemplateIds.size === templates.length) {
      setSelectedTemplateIds(new Set());
    } else {
      setSelectedTemplateIds(new Set(templates.map(t => t.id)));
    }
  };

  const assignTemplates = useMutation({
    mutationFn: async (templateIds: string[]) => {
      const selectedTemplates = templates.filter(t => templateIds.includes(t.id));
      
      const kpisToInsert = selectedTemplates.map(template => ({
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
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      toast({ 
        title: 'KPIs Assigned Successfully',
        description: `${count} KPIs have been assigned to ${employeeName}`,
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to assign KPIs', 
        description: error.message, 
        variant: 'destructive',
      });
    },
  });

  const handleAssign = () => {
    if (selectedTemplateIds.size === 0) return;
    assignTemplates.mutate(Array.from(selectedTemplateIds));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Recommended KPIs Found
          </DialogTitle>
          <DialogDescription>
            We found <strong>{templates.length}</strong> standard KPI templates for this role.
            Would you like to assign them to <strong>{employeeName}</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              {selectedTemplateIds.size} of {templates.length} selected
            </span>
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selectedTemplateIds.size === templates.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          <ScrollArea className="h-[280px] rounded-md border p-3">
            <div className="space-y-3">
              {templates.map(template => (
                <label
                  key={template.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
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
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Skip
          </Button>
          <Button 
            onClick={handleAssign} 
            disabled={selectedTemplateIds.size === 0 || assignTemplates.isPending}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {assignTemplates.isPending 
              ? 'Assigning...' 
              : `Assign ${selectedTemplateIds.size} KPIs`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
