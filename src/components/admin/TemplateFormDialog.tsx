import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useKraCategories } from '@/hooks/useOrganization';
import { KpiTemplate, useCreateKpiTemplate, useUpdateKpiTemplate, useLinkedEmployees, usePropagateTemplateChange } from '@/hooks/useKpiTemplates';
import { UomTypeSelector } from './UomTypeSelector';
import { TieredOptionsBuilder } from './TieredOptionsBuilder';
import { UomType, QualitativeOption, BINARY_OPTIONS, BINARY_OPTIONS_INVERTED, isBinaryInverted } from '@/lib/qualitativeUom';
import { Separator } from '@/components/ui/separator';
import { UOM_OPTIONS } from '@/lib/uomConstants';
import { TemplatePropagationPreview } from './TemplatePropagationPreview';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, ArrowRight, Loader2, Users } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1];

interface TemplateFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  template?: KpiTemplate | null;
}

export function TemplateFormDialog({ isOpen, onClose, template }: TemplateFormDialogProps) {
  const { data: categories } = useKraCategories();
  const createTemplate = useCreateKpiTemplate();
  const updateTemplate = useUpdateKpiTemplate();
  const propagate = usePropagateTemplateChange();

  // Propagation state
  const [shouldPropagate, setShouldPropagate] = useState(false);
  const [includeWeightage, setIncludeWeightage] = useState(false);
  const [effectiveMonth, setEffectiveMonth] = useState(() => MONTH_NAMES[new Date().getMonth()]);
  const [effectiveYear, setEffectiveYear] = useState(() => new Date().getFullYear());
  const [propagationScope, setPropagationScope] = useState<'all' | 'selected'>('all');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { data: linkedEmployees } = useLinkedEmployees(template?.id || null);

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
      setShouldPropagate(false);
      setIncludeWeightage(false);
      setShowPreview(false);
      setPreviewData(null);
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
    setShouldPropagate(false);
    setIncludeWeightage(false);
    setShowPreview(false);
    setPreviewData(null);
    setSelectedEmployeeIds(new Set());
  };

  // Detect which fields changed compared to original template
  const changedFields = useMemo(() => {
    if (!template) return {};
    const changes: Record<string, { old: any; new: any }> = {};

    const compareMap: Record<string, { formKey: keyof typeof formData; templateKey: keyof KpiTemplate; isNumeric?: boolean; isJson?: boolean; isBoolean?: boolean }> = {
      kra_name: { formKey: 'kra_name', templateKey: 'kra_name' },
      kpi_name: { formKey: 'kpi_name', templateKey: 'kpi_name' },
      target_value: { formKey: 'target_value', templateKey: 'target_value', isNumeric: true },
      weightage: { formKey: 'weightage', templateKey: 'weightage', isNumeric: true },
      uom: { formKey: 'uom', templateKey: 'uom' },
      criteria: { formKey: 'criteria', templateKey: 'criteria' },
      frequency: { formKey: 'frequency', templateKey: 'frequency' },
      source_of_data: { formKey: 'source_of_data', templateKey: 'source_of_data' },
      r5: { formKey: 'r5', templateKey: 'r5' },
      r4: { formKey: 'r4', templateKey: 'r4' },
      r3: { formKey: 'r3', templateKey: 'r3' },
      r2: { formKey: 'r2', templateKey: 'r2' },
      r1: { formKey: 'r1', templateKey: 'r1' },
      r0: { formKey: 'r0', templateKey: 'r0' },
      uom_type: { formKey: 'uom_type', templateKey: 'uom_type' as any },
      threshold_mode: { formKey: 'threshold_mode', templateKey: 'threshold_mode' as any },
      qualitative_options: { formKey: 'qualitative_options', templateKey: 'qualitative_options' as any, isJson: true },
      require_resubmit_reason: { formKey: 'require_resubmit_reason', templateKey: 'require_resubmit_reason' as any, isBoolean: true },
    };

    for (const [field, config] of Object.entries(compareMap)) {
      const oldVal = (template as any)[config.templateKey];
      let newVal: any = formData[config.formKey];
      if (config.isNumeric) {
        newVal = newVal ? parseFloat(newVal) : null;
      }
      if (config.isJson) {
        const oldJson = JSON.stringify(oldVal ?? null);
        const newJson = JSON.stringify(newVal ?? null);
        if (oldJson !== newJson) {
          changes[field] = { old: oldVal ?? null, new: newVal ?? null };
        }
        continue;
      }
      if (config.isBoolean) {
        if ((oldVal ?? null) !== (newVal ?? null)) {
          changes[field] = { old: oldVal ?? null, new: newVal ?? null };
        }
        continue;
      }
      const normalizedOld = oldVal ?? null;
      const normalizedNew = newVal === '' ? null : newVal;
      if (String(normalizedOld) !== String(normalizedNew)) {
        changes[field] = { old: normalizedOld, new: normalizedNew };
      }
    }

    return changes;
  }, [template, formData]);

  const weightageChanged = 'weightage' in changedFields;

  // Fields to propagate — excludes weightage unless explicitly included
  const propagationChangedFields = useMemo(() => {
    if (includeWeightage) return changedFields;
    const { weightage, ...rest } = changedFields;
    return rest;
  }, [changedFields, includeWeightage]);

  const hasChanges = Object.keys(changedFields).length > 0;
  const hasPropagableChanges = Object.keys(propagationChangedFields).length > 0;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handlePreview = async () => {
    if (!template || !hasPropagableChanges) return;
    const result = await propagate.mutateAsync({
      template_id: template.id,
      fields_changed: propagationChangedFields,
      effective_month: effectiveMonth,
      effective_year: effectiveYear,
      employee_ids: propagationScope === 'selected' ? Array.from(selectedEmployeeIds) : undefined,
      dry_run: true,
    });
    setPreviewData(result);
    setShowPreview(true);
  };

  const handleSubmitClick = () => {
    if (!formData.title || !formData.kra_name || !formData.kpi_name) return;
    // Show confirmation if propagating
    if (template && shouldPropagate && hasPropagableChanges) {
      setShowConfirmDialog(true);
      return;
    }
    handleSubmit();
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

        // Propagate if requested and there are propagable changes
        if (shouldPropagate && hasPropagableChanges) {
          await propagate.mutateAsync({
            template_id: template.id,
            fields_changed: propagationChangedFields,
            effective_month: effectiveMonth,
            effective_year: effectiveYear,
            employee_ids: propagationScope === 'selected' ? Array.from(selectedEmployeeIds) : undefined,
            dry_run: false,
          });
        }
      } else {
        await createTemplate.mutateAsync(payload as any);
      }
      handleClose();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isSubmitting = createTemplate.isPending || updateTemplate.isPending || propagate.isPending;
  const linkedCount = linkedEmployees?.length || 0;

  const toggleEmployee = (empId: string) => {
    setSelectedEmployeeIds(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

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
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Binary Polarity</Label>
                    <Select
                      value={isBinaryInverted(formData.qualitative_options) ? 'inverted' : 'standard'}
                      onValueChange={(val) => {
                        setFormData({ 
                          ...formData, 
                          qualitative_options: val === 'inverted' ? BINARY_OPTIONS_INVERTED : BINARY_OPTIONS 
                        });
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard (Yes = 5)</SelectItem>
                        <SelectItem value="inverted">Inverted (No = 5)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-4">
                    {isBinaryInverted(formData.qualitative_options) ? (
                      <>
                        <Badge variant="destructive">Yes = R0 (0)</Badge>
                        <Badge variant="default">No = R5 (5)</Badge>
                      </>
                    ) : (
                      <>
                        <Badge variant="default">Yes = R5 (5)</Badge>
                        <Badge variant="destructive">No = R0 (0)</Badge>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use "Inverted" for safety KPIs where "No" (e.g., no injuries) is the desired outcome.
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

            {/* Propagation Settings — only in edit mode with linked employees */}
            {template && linkedCount > 0 && (
              <>
                <Separator />
                <div className="p-4 border rounded-lg border-primary/30 bg-primary/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Propagate Changes to Linked KPIs
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {linkedCount} employee{linkedCount !== 1 ? 's' : ''} linked to this template
                      </p>
                    </div>
                    <Switch
                      checked={shouldPropagate}
                      onCheckedChange={setShouldPropagate}
                      disabled={!hasChanges}
                    />

                  </div>

                  {!hasChanges && (
                    <p className="text-xs text-muted-foreground italic">
                      Make changes to the template fields above to enable propagation.
                    </p>
                  )}

                  {shouldPropagate && hasChanges && (
                    <div className="space-y-4">
                      {/* Weightage include/exclude toggle */}
                      {weightageChanged && (
                        <div className="p-3 border rounded-md border-yellow-500/30 bg-yellow-500/5 space-y-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="include-weightage"
                              checked={includeWeightage}
                              onCheckedChange={(checked) => setIncludeWeightage(checked === true)}
                            />
                            <Label htmlFor="include-weightage" className="text-sm font-medium cursor-pointer">
                              Include weightage changes
                            </Label>
                          </div>
                          <div className="flex items-start gap-1.5 ml-6">
                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground">
                              Caution: This will overwrite individual employee weightages that may have been customized in the Weightage Dashboard.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* No propagable fields warning */}
                      {!hasPropagableChanges && (
                        <p className="text-xs text-muted-foreground italic">
                          No fields selected for propagation. Only weightage was changed and it is excluded by default.
                        </p>
                      )}
                      {/* Effective Month */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Effective From Month</Label>
                          <Select value={effectiveMonth} onValueChange={setEffectiveMonth}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MONTH_NAMES.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Year</Label>
                          <Select value={String(effectiveYear)} onValueChange={v => setEffectiveYear(Number(v))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {YEAR_OPTIONS.map(y => (
                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Scope */}
                      <div>
                        <Label className="text-xs mb-2 block">Scope</Label>
                        <RadioGroup value={propagationScope} onValueChange={(v: 'all' | 'selected') => setPropagationScope(v)}>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="all" id="scope-all" />
                            <Label htmlFor="scope-all" className="text-sm font-normal">
                              All linked employees ({linkedCount})
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="selected" id="scope-selected" />
                            <Label htmlFor="scope-selected" className="text-sm font-normal">
                              Selected employees only
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {/* Employee selector */}
                      {propagationScope === 'selected' && linkedEmployees && (
                        <ScrollArea className="max-h-[150px] border rounded-md p-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 py-1 border-b mb-1 pb-2">
                              <Checkbox
                                checked={linkedEmployees.length > 0 && selectedEmployeeIds.size === linkedEmployees.length}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedEmployeeIds(new Set(linkedEmployees.map(e => e.id)));
                                  } else {
                                    setSelectedEmployeeIds(new Set());
                                  }
                                }}
                              />
                              <span className="text-sm font-medium">Select All ({linkedEmployees.length})</span>
                            </div>
                            {linkedEmployees.map(emp => (
                              <div key={emp.id} className="flex items-center gap-2 py-1">
                                <Checkbox
                                  checked={selectedEmployeeIds.has(emp.id)}
                                  onCheckedChange={() => toggleEmployee(emp.id)}
                                />
                                <span className="text-sm">{emp.name}</span>
                                <Badge variant="secondary" className="text-xs ml-auto">{emp.kpi_count} KPIs</Badge>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}

                      {/* Changed fields summary */}
                      {hasPropagableChanges && (
                        <div>
                          <Label className="text-xs mb-1 block">Fields to Propagate</Label>
                          <div className="space-y-1">
                            {Object.entries(propagationChangedFields).map(([field, change]) => (
                              <div key={field} className="text-xs flex items-center gap-1">
                                <span className="font-medium capitalize">{field.replace(/_/g, ' ')}</span>
                                <span className="text-muted-foreground line-through">{String(change.old ?? '—')}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-medium">{String(change.new ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Preview button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreview}
                        disabled={propagate.isPending || !hasPropagableChanges}
                      >
                        {propagate.isPending ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Calculating...
                          </>
                        ) : 'Preview Impact'}
                      </Button>

                      {/* Preview results */}
                      {showPreview && previewData && (
                        <Card>
                          <CardContent className="pt-4">
                            <TemplatePropagationPreview data={previewData} isLoading={false} />
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitClick}
            disabled={isSubmitting || !formData.title || !formData.kra_name || !formData.kpi_name}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                {propagate.isPending ? 'Propagating...' : 'Saving...'}
              </>
            ) : template 
              ? (shouldPropagate && hasPropagableChanges ? 'Save & Propagate' : 'Update Template') 
              : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Confirmation dialog for propagation */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Propagation</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>This will update:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><strong>{Object.keys(propagationChangedFields).length}</strong> field{Object.keys(propagationChangedFields).length !== 1 ? 's' : ''} ({Object.keys(propagationChangedFields).map(f => f.replace(/_/g, ' ')).join(', ')})</li>
                <li>
                  {propagationScope === 'all' 
                    ? `Across all linked employees (${linkedCount})`
                    : `Across ${selectedEmployeeIds.size} selected employee${selectedEmployeeIds.size !== 1 ? 's' : ''}`}
                </li>
                <li>Effective from <strong>{effectiveMonth} {effectiveYear}</strong></li>
              </ul>
              <p className="text-sm text-destructive font-medium mt-2">This action cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setShowConfirmDialog(false); handleSubmit(); }}>
            Propagate Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
