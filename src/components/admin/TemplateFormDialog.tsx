import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useKraCategories } from '@/hooks/useOrganization';
import { KpiTemplate, useCreateKpiTemplate, useUpdateKpiTemplate } from '@/hooks/useKpiTemplates';

interface TemplateFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  template?: KpiTemplate | null;
}

const AVAILABLE_ROLES = ['employee', 'manager', 'auditor', 'management', 'admin'];

export function TemplateFormDialog({ isOpen, onClose, template }: TemplateFormDialogProps) {
  const { data: categories } = useKraCategories();
  const createTemplate = useCreateKpiTemplate();
  const updateTemplate = useUpdateKpiTemplate();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category_id: '',
    kra_name: '',
    kpi_name: '',
    uom: '',
    target_value: '',
    weightage: '',
    criteria: 'Higher is Better',
    frequency: '',
    source_of_data: '',
    r5: '',
    r4: '',
    r3: '',
    r2: '',
    r1: '',
    r0: '',
    applicable_roles: [] as string[],
    is_active: true,
  });

  useEffect(() => {
    if (template) {
      setFormData({
        title: template.title || '',
        description: template.description || '',
        category_id: template.category_id || '',
        kra_name: template.kra_name || '',
        kpi_name: template.kpi_name || '',
        uom: template.uom || '',
        target_value: template.target_value?.toString() || '',
        weightage: template.weightage?.toString() || '',
        criteria: template.criteria || 'Higher is Better',
        frequency: template.frequency || '',
        source_of_data: template.source_of_data || '',
        r5: template.r5 || '',
        r4: template.r4 || '',
        r3: template.r3 || '',
        r2: template.r2 || '',
        r1: template.r1 || '',
        r0: template.r0 || '',
        applicable_roles: template.applicable_roles || [],
        is_active: template.is_active ?? true,
      });
    } else {
      resetForm();
    }
  }, [template, isOpen]);

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category_id: '',
      kra_name: '',
      kpi_name: '',
      uom: '',
      target_value: '',
      weightage: '',
      criteria: 'Higher is Better',
      frequency: '',
      source_of_data: '',
      r5: '',
      r4: '',
      r3: '',
      r2: '',
      r1: '',
      r0: '',
      applicable_roles: [],
      is_active: true,
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleRole = (role: string) => {
    setFormData(prev => ({
      ...prev,
      applicable_roles: prev.applicable_roles.includes(role)
        ? prev.applicable_roles.filter(r => r !== role)
        : [...prev.applicable_roles, role],
    }));
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.kra_name || !formData.kpi_name) {
      return;
    }

    const payload = {
      title: formData.title,
      description: formData.description || null,
      category_id: formData.category_id || null,
      kra_name: formData.kra_name,
      kpi_name: formData.kpi_name,
      uom: formData.uom || null,
      target_value: formData.target_value ? parseFloat(formData.target_value) : null,
      weightage: formData.weightage ? parseFloat(formData.weightage) : null,
      criteria: formData.criteria || null,
      frequency: formData.frequency || null,
      source_of_data: formData.source_of_data || null,
      r5: formData.r5 || null,
      r4: formData.r4 || null,
      r3: formData.r3 || null,
      r2: formData.r2 || null,
      r1: formData.r1 || null,
      r0: formData.r0 || null,
      applicable_roles: formData.applicable_roles,
      is_active: formData.is_active,
    };

    try {
      if (template) {
        await updateTemplate.mutateAsync({ id: template.id, ...payload });
      } else {
        await createTemplate.mutateAsync(payload as any);
      }
      handleClose();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isSubmitting = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'Create Template'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-2">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Template Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Sales Manager KRA Template"
                />
              </div>

              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this template..."
                  rows={2}
                />
              </div>
            </div>

            {/* Category & KRA/KPI */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(val) => setFormData({ ...formData, category_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Criteria</Label>
                <Select
                  value={formData.criteria}
                  onValueChange={(val) => setFormData({ ...formData, criteria: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Higher is Better">Higher is Better</SelectItem>
                    <SelectItem value="Lower is Better">Lower is Better</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>KRA Name *</Label>
                <Input
                  value={formData.kra_name}
                  onChange={(e) => setFormData({ ...formData, kra_name: e.target.value })}
                  placeholder="Key Result Area"
                />
              </div>

              <div>
                <Label>KPI Name *</Label>
                <Input
                  value={formData.kpi_name}
                  onChange={(e) => setFormData({ ...formData, kpi_name: e.target.value })}
                  placeholder="Key Performance Indicator"
                />
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>UOM</Label>
                <Input
                  value={formData.uom}
                  onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                  placeholder="%"
                />
              </div>
              <div>
                <Label>Target Value</Label>
                <Input
                  type="number"
                  value={formData.target_value}
                  onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                />
              </div>
              <div>
                <Label>Weightage</Label>
                <Input
                  type="number"
                  value={formData.weightage}
                  onChange={(e) => setFormData({ ...formData, weightage: e.target.value })}
                />
              </div>
              <div>
                <Label>Frequency</Label>
                <Input
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  placeholder="Monthly"
                />
              </div>
            </div>

            {/* Rating Thresholds */}
            <div>
              <Label className="text-sm font-medium">Rating Thresholds</Label>
              <div className="grid grid-cols-6 gap-2 mt-2">
                {(['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const).map((key) => (
                  <div key={key}>
                    <Label className="text-xs uppercase text-muted-foreground">{key}</Label>
                    <Input
                      value={formData[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      placeholder={key === 'r5' ? '≥100' : ''}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Applicable Roles */}
            <div>
              <Label>Applicable Roles</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select roles this template is recommended for
              </p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_ROLES.map((role) => (
                  <Badge
                    key={role}
                    variant={formData.applicable_roles.includes(role) ? 'default' : 'outline'}
                    className="cursor-pointer capitalize"
                    onClick={() => toggleRole(role)}
                  >
                    {role}
                    {formData.applicable_roles.includes(role) && (
                      <X className="h-3 w-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Source of Data */}
            <div>
              <Label>Source of Data</Label>
              <Input
                value={formData.source_of_data}
                onChange={(e) => setFormData({ ...formData, source_of_data: e.target.value })}
                placeholder="e.g., CRM System, Monthly Reports"
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.title || !formData.kra_name || !formData.kpi_name}
          >
            {isSubmitting ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
