import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useKraCategories } from '@/hooks/useOrganization';
import { KpiTemplate, useCreateKpiTemplate, useUpdateKpiTemplate } from '@/hooks/useKpiTemplates';
import { UomTypeSelector } from './UomTypeSelector';
import { TieredOptionsBuilder } from './TieredOptionsBuilder';
import { UomType, QualitativeOption, BINARY_OPTIONS, BINARY_OPTIONS_INVERTED, isBinaryInverted } from '@/lib/qualitativeUom';
import { Separator } from '@/components/ui/separator';
import { UOM_OPTIONS } from '@/lib/uomConstants';

interface TemplateFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  template?: KpiTemplate | null;
}

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
    is_active: true,
    uom_type: 'numeric' as UomType,
    qualitative_options: [
      { label: 'Yes', rating: 5, definition: 'Requirement fully met' },
      { label: 'No', rating: 0, definition: 'Requirement not met' },
    ] as QualitativeOption[],
    require_resubmit_reason: true,
    day_count_type: 'working_days' as 'working_days' | 'all_days',
    threshold_mode: 'absolute' as 'absolute' | 'ratio',
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
        is_active: template.is_active ?? true,
        uom_type: (template as any).uom_type || 'numeric',
        qualitative_options: (template as any).qualitative_options || [
          { label: 'Yes', rating: 5, definition: 'Requirement fully met' },
          { label: 'No', rating: 0, definition: 'Requirement not met' },
        ],
        require_resubmit_reason: template.require_resubmit_reason ?? true,
        day_count_type: (template as any).day_count_type || 'working_days',
        threshold_mode: (template as any).threshold_mode || 'absolute',
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
      is_active: true,
      uom_type: 'numeric',
      qualitative_options: [
        { label: 'Yes', rating: 5, definition: 'Requirement fully met' },
        { label: 'No', rating: 0, definition: 'Requirement not met' },
      ],
      require_resubmit_reason: true,
      day_count_type: 'working_days',
      threshold_mode: 'absolute',
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
      uom: formData.uom_type === 'numeric' ? (formData.uom || null) : formData.uom_type,
      target_value: formData.uom_type === 'numeric' ? (formData.target_value ? parseFloat(formData.target_value) : null) : null,
      weightage: formData.weightage ? parseFloat(formData.weightage) : null,
      criteria: formData.uom_type === 'numeric' ? (formData.criteria || null) : null,
      frequency: formData.frequency || null,
      source_of_data: formData.source_of_data || null,
      r5: formData.uom_type === 'numeric' ? (formData.r5 || null) : null,
      r4: formData.uom_type === 'numeric' ? (formData.r4 || null) : null,
      r3: formData.uom_type === 'numeric' ? (formData.r3 || null) : null,
      r2: formData.uom_type === 'numeric' ? (formData.r2 || null) : null,
      r1: formData.uom_type === 'numeric' ? (formData.r1 || null) : null,
      r0: formData.uom_type === 'numeric' ? (formData.r0 || null) : null,
      applicable_roles: [],
      is_active: formData.is_active,
      uom_type: formData.uom_type,
      qualitative_options: formData.uom_type === 'tiered' 
        ? formData.qualitative_options 
        : (formData.uom_type === 'binary' ? formData.qualitative_options : null),
      require_resubmit_reason: formData.require_resubmit_reason,
      threshold_mode: formData.uom_type === 'numeric' ? formData.threshold_mode : null,
    };

    try {
      if (template) {
        await updateTemplate.mutateAsync({ id: template.id, ...payload } as any);
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
            <Separator />

            {/* UOM Type Selector */}
            <UomTypeSelector 
              value={formData.uom_type} 
              onChange={(val) => setFormData({ ...formData, uom_type: val })} 
            />

            {/* Conditional fields based on UOM Type */}
            {formData.uom_type === 'numeric' && (
              <>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label>UOM</Label>
                    <Select
                      value={formData.uom}
                      onValueChange={(val) => setFormData({ ...formData, uom: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select UOM" />
                      </SelectTrigger>
                      <SelectContent>
                        {UOM_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Select
                      value={formData.frequency}
                      onValueChange={(val) => setFormData({ ...formData, frequency: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Daily', 'Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'].map((freq) => (
                          <SelectItem key={freq} value={freq}>
                            {freq}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {formData.frequency === 'Daily' && (
                  <div className="space-y-2">
                    <Label>Day Count Type</Label>
                    <Select
                      value={formData.day_count_type}
                      onValueChange={(val: 'working_days' | 'all_days') => setFormData({ ...formData, day_count_type: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="working_days">Working Days Only</SelectItem>
                        <SelectItem value="all_days">All Calendar Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {formData.day_count_type === 'working_days' 
                        ? 'Uses employee-specific working days for missed days calculation'
                        : 'Uses all calendar days (e.g., 31 days in January)'}
                    </p>
                  </div>
                )}

                {/* Threshold Mode Selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Threshold Mode</Label>
                  <Select
                    value={formData.threshold_mode}
                    onValueChange={(val: 'absolute' | 'ratio') => setFormData({ ...formData, threshold_mode: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="absolute">
                        Absolute (Recommended) - Thresholds are actual values
                      </SelectItem>
                      <SelectItem value="ratio">
                        Ratio / Percentage - Thresholds are % of target
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.threshold_mode === 'absolute' 
                      ? 'Thresholds are actual values (e.g., R5 = 100 means achieved ≥ 100)' 
                      : 'Thresholds are % of target (e.g., R5 = 100% means achieved ≥ target)'}
                  </p>
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
                          placeholder={formData.threshold_mode === 'absolute' ? '100' : '100%'}
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {formData.uom_type === 'binary' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                    <Select
                      value={formData.frequency}
                      onValueChange={(val) => setFormData({ ...formData, frequency: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Daily', 'Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'].map((freq) => (
                          <SelectItem key={freq} value={freq}>
                            {freq}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {formData.frequency === 'Daily' && (
                  <div className="space-y-2">
                    <Label>Day Count Type</Label>
                    <Select
                      value={formData.day_count_type}
                      onValueChange={(val: 'working_days' | 'all_days') => setFormData({ ...formData, day_count_type: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="working_days">Working Days Only</SelectItem>
                        <SelectItem value="all_days">All Calendar Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {formData.day_count_type === 'working_days' 
                        ? 'Uses employee-specific working days for missed days calculation'
                        : 'Uses all calendar days (e.g., 31 days in January)'}
                    </p>
                  </div>
                )}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <Label className="text-sm font-medium mb-2 block">Binary Scoring</Label>
                  <div className="flex gap-4">
                    <Badge variant="default">Yes = R5 (5)</Badge>
                    <Badge variant="destructive">No = R0 (0)</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Fixed scoring: Yes achieves maximum rating, No achieves minimum rating.
                  </p>
                </div>
              </div>
            )}

            {formData.uom_type === 'tiered' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                <TieredOptionsBuilder
                  options={formData.qualitative_options}
                  onChange={(opts) => setFormData({ ...formData, qualitative_options: opts })}
                />
              </div>
            )}

            {/* Source of Data */}
            <div>
              <Label>Source of Data</Label>
              <Input
                value={formData.source_of_data}
                onChange={(e) => setFormData({ ...formData, source_of_data: e.target.value })}
                placeholder="e.g., CRM System, Monthly Reports"
              />
            </div>

            <Separator />

            {/* Advanced Settings */}
            <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
              <h3 className="font-medium text-sm">Advanced Settings</h3>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Require Reason for Resubmission</Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, employees must provide a mandatory reason when editing previously submitted daily/weekly entries
                  </p>
                </div>
                <Switch
                  checked={formData.require_resubmit_reason}
                  onCheckedChange={(checked) => setFormData({ ...formData, require_resubmit_reason: checked })}
                />
              </div>
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
