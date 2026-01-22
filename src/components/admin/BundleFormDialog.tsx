import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useDepartments, useDesignations } from '@/hooks/useOrganization';
import { useKpiTemplates } from '@/hooks/useKpiTemplates';
import { useCreateTemplateBundle, useUpdateTemplateBundle, TemplateBundle } from '@/hooks/useTemplateBundles';
import { Loader2, GripVertical } from 'lucide-react';

interface BundleFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bundle?: TemplateBundle | null;
}

export function BundleFormDialog({ isOpen, onClose, bundle }: BundleFormDialogProps) {
  const { data: departments } = useDepartments();
  const { data: designations } = useDesignations();
  const { data: templates } = useKpiTemplates();
  const createBundle = useCreateTemplateBundle();
  const updateBundle = useUpdateTemplateBundle();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    department_id: '',
    designation: '',
    is_active: true,
    template_ids: [] as string[],
  });

  useEffect(() => {
    if (bundle) {
      const templateIds = bundle.template_bundle_items
        ?.sort((a, b) => a.sort_order - b.sort_order)
        .map(item => item.template_id) || [];
      
      setFormData({
        name: bundle.name,
        description: bundle.description || '',
        department_id: bundle.department_id || '',
        designation: bundle.designation || '',
        is_active: bundle.is_active,
        template_ids: templateIds,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        department_id: '',
        designation: '',
        is_active: true,
        template_ids: [],
      });
    }
  }, [bundle, isOpen]);

  const activeTemplates = useMemo(() => 
    templates?.filter(t => t.is_active) || [], 
    [templates]
  );

  const totalWeightage = useMemo(() => {
    return formData.template_ids.reduce((sum, id) => {
      const template = activeTemplates.find(t => t.id === id);
      return sum + (template?.weightage || 0);
    }, 0);
  }, [formData.template_ids, activeTemplates]);

  const toggleTemplate = (templateId: string) => {
    setFormData(prev => ({
      ...prev,
      template_ids: prev.template_ids.includes(templateId)
        ? prev.template_ids.filter(id => id !== templateId)
        : [...prev.template_ids, templateId],
    }));
  };

  const handleSubmit = async () => {
    const payload = {
      name: formData.name,
      description: formData.description || null,
      department_id: formData.department_id || null,
      designation: formData.designation || null,
      is_active: formData.is_active,
      template_ids: formData.template_ids,
    };

    if (bundle) {
      await updateBundle.mutateAsync({ id: bundle.id, ...payload });
    } else {
      await createBundle.mutateAsync(payload);
    }
    onClose();
  };

  const isSubmitting = createBundle.isPending || updateBundle.isPending;
  const canSubmit = formData.name.trim() && formData.template_ids.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{bundle ? 'Edit Bundle' : 'Create KRA Bundle'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Bundle Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., CPP Mech - Standard KRAs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description for this bundle..."
                  rows={2}
                />
              </div>
            </div>

            {/* Department & Designation Mapping */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Linked Department</Label>
                <Select
                  value={formData.department_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, department_id: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {departments?.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Linked Designation</Label>
                <Select
                  value={formData.designation}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, designation: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select designation..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {designations?.map(des => (
                      <SelectItem key={des.id} value={des.name}>{des.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active Bundle</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>

            {/* Template Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Templates *</Label>
                <div className="text-sm text-muted-foreground">
                  {formData.template_ids.length} selected • Total weightage: {totalWeightage}%
                </div>
              </div>

              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                {activeTemplates.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No active templates available
                  </div>
                ) : (
                  <div className="divide-y">
                    {activeTemplates.map((template) => {
                      const isSelected = formData.template_ids.includes(template.id);
                      return (
                        <div
                          key={template.id}
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
                          onClick={() => toggleTemplate(template.id)}
                        >
                          <Checkbox checked={isSelected} />
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{template.title}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {template.kra_name} → {template.kpi_name}
                            </div>
                          </div>
                          {template.kra_categories && (
                            <Badge variant="outline" className="text-xs">
                              {template.kra_categories.name}
                            </Badge>
                          )}
                          <div className="text-sm text-muted-foreground w-12 text-right">
                            {template.weightage || 0}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {bundle ? 'Update Bundle' : 'Create Bundle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
