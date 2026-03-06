import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useKraCategories, useProfiles } from '@/hooks/useOrganization';
import { useAdminUpdateKpi, ReviewStatus, KPI } from '@/hooks/useKpis';
import { Loader2, Building2, Info } from 'lucide-react';
import { UomTypeSelector } from '@/components/admin/UomTypeSelector';
import { TieredOptionsBuilder } from '@/components/admin/TieredOptionsBuilder';
import { UomType, QualitativeOption, validateQualitativeOptions } from '@/lib/qualitativeUom';
import { UOM_OPTIONS } from '@/lib/uomConstants';
import { getCycleOptionsForFrequency, MULTI_MONTH_FREQUENCIES } from '@/lib/frequencyCycleOptions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ApplyScope = 'this_month' | 'future_months' | 'all_months';

interface AdminKpiEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
}

const STATUS_OPTIONS: { value: ReviewStatus; label: string }[] = [
  { value: 'kra_set', label: 'KRA Set' },
  { value: 'self_review', label: 'Self Review' },
  { value: 'manager_check', label: 'Manager Check' },
  { value: 'audit', label: 'Audit' },
  { value: 'management_review', label: 'Management Review' },
  { value: 'approved', label: 'Approved' },
];

const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];
const CRITERIA_OPTIONS = ['Higher is Better', 'Lower is Better', 'Equal to Target'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function AdminKpiEditDialog({ isOpen, onClose, kpi }: AdminKpiEditDialogProps) {
  const { data: categories } = useKraCategories();
  const { data: profiles } = useProfiles();
  const updateKpi = useAdminUpdateKpi();

const [formData, setFormData] = useState({
    employee_id: '',
    category_id: '',
    kra_name: '',
    kpi_name: '',
    target_value: '',
    uom: '',
    weightage: '',
    frequency: '',
    frequency_cycle_start: '',
    criteria: '',
    source_of_data: '',
    review_period: '',
    review_year: '',
    status: '' as ReviewStatus,
    r5: '',
    r4: '',
    r3: '',
    r2: '',
    r1: '',
    r0: '',
    is_org_level: false,
    org_level_scope: 'organization' as 'organization' | 'department' | 'employee',
    uom_type: 'numeric' as UomType,
    qualitative_options: [] as QualitativeOption[],
    require_resubmit_reason: true,
    day_count_type: 'working_days' as 'working_days' | 'all_days',
    threshold_mode: 'absolute' as 'absolute' | 'ratio',
  });
  const [reason, setReason] = useState('');
  const [applyScope, setApplyScope] = useState<ApplyScope>('this_month');
  const originalStatus = kpi?.status;
  useEffect(() => {
    if (kpi) {
      setFormData({
        employee_id: kpi.employee_id || '',
        category_id: kpi.category_id || '',
        kra_name: kpi.kra_name || '',
        kpi_name: kpi.kpi_name || '',
        target_value: kpi.target_value?.toString() || '',
        uom: kpi.uom || '',
        weightage: kpi.weightage?.toString() || '',
        frequency: kpi.frequency || '',
        frequency_cycle_start: kpi.frequency_cycle_start || '',
        criteria: kpi.criteria || '',
        source_of_data: kpi.source_of_data || '',
        review_period: kpi.review_period || '',
        review_year: kpi.review_year?.toString() || '',
        status: kpi.status || 'kra_set',
        r5: kpi.r5 || '',
        r4: kpi.r4 || '',
        r3: kpi.r3 || '',
        r2: kpi.r2 || '',
        r1: kpi.r1 || '',
        r0: kpi.r0 || '',
        is_org_level: kpi.is_org_level || false,
        org_level_scope: kpi.org_level_scope || 'organization',
        uom_type: (kpi.uom_type as UomType) || 'numeric',
        qualitative_options: (kpi.qualitative_options as QualitativeOption[]) || [],
        require_resubmit_reason: kpi.require_resubmit_reason ?? true,
        day_count_type: (kpi.day_count_type as 'working_days' | 'all_days') || 'working_days',
        threshold_mode: (kpi.threshold_mode as 'absolute' | 'ratio') || 'absolute',
      });
      setReason('');
      setApplyScope('this_month');
    }
  }, [kpi]);

  // Validation for tiered options
  const tieredValidationError = formData.uom_type === 'tiered' 
    ? validateQualitativeOptions(formData.qualitative_options) 
    : null;

  const handleSubmit = async () => {
    if (!kpi) return;
    
    const statusChanged = formData.status !== originalStatus;
    if (statusChanged && !reason.trim()) return;
    if (formData.uom_type === 'tiered' && tieredValidationError) return;

    // Build the structural fields payload
    const structuralFields = {
      target_value: formData.uom_type === 'numeric' ? (formData.target_value ? parseFloat(formData.target_value) : null) : null,
      uom: formData.uom || null,
      weightage: formData.weightage ? parseFloat(formData.weightage) : null,
      frequency: formData.frequency || null,
      frequency_cycle_start: (formData.frequency_cycle_start && formData.frequency_cycle_start !== 'system_default') ? formData.frequency_cycle_start : null,
      criteria: formData.uom_type === 'numeric' ? (formData.criteria || null) : null,
      source_of_data: formData.source_of_data || null,
      r5: formData.uom_type === 'numeric' ? (formData.r5 || null) : null,
      r4: formData.uom_type === 'numeric' ? (formData.r4 || null) : null,
      r3: formData.uom_type === 'numeric' ? (formData.r3 || null) : null,
      r2: formData.uom_type === 'numeric' ? (formData.r2 || null) : null,
      r1: formData.uom_type === 'numeric' ? (formData.r1 || null) : null,
      r0: formData.uom_type === 'numeric' ? (formData.r0 || null) : null,
      is_org_level: formData.is_org_level,
      org_level_scope: formData.is_org_level ? formData.org_level_scope : 'organization',
      uom_type: formData.uom_type,
      qualitative_options: formData.uom_type === 'tiered' ? formData.qualitative_options : null,
      require_resubmit_reason: formData.require_resubmit_reason,
      day_count_type: formData.frequency === 'Daily' ? formData.day_count_type : null,
      threshold_mode: formData.uom_type === 'numeric' ? formData.threshold_mode : null,
    };

    // 1. Update the current KPI (existing behavior)
    await updateKpi.mutateAsync({
      id: kpi.id,
      employee_id: formData.employee_id,
      category_id: formData.category_id,
      kra_name: formData.kra_name,
      kpi_name: formData.kpi_name,
      ...structuralFields,
      review_period: formData.review_period || null,
      review_year: formData.review_year ? parseInt(formData.review_year) : null,
      status: formData.status,
      reason,
    });

    // 2. If scope is broader, batch-update sibling KPIs
    if (applyScope !== 'this_month' && kpi.review_year && kpi.review_period) {
      try {
        const currentMonthIndex = MONTHS.indexOf(kpi.review_period);
        
        // Query sibling KPIs
        let query = supabase
          .from('kpis')
          .select('id, review_period')
          .eq('employee_id', kpi.employee_id)
          .eq('kra_name', kpi.kra_name)
          .eq('kpi_name', kpi.kpi_name)
          .eq('review_year', kpi.review_year)
          .neq('id', kpi.id);

        const { data: siblings, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        // Filter by month scope
        const filteredSiblings = (siblings || []).filter(s => {
          if (!s.review_period) return false;
          const siblingMonthIndex = MONTHS.indexOf(s.review_period);
          if (siblingMonthIndex === -1) return false;
          if (applyScope === 'future_months') return siblingMonthIndex > currentMonthIndex;
          return true; // all_months
        });

        if (filteredSiblings.length > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          
          // Batch update each sibling
          for (const sibling of filteredSiblings) {
            const { error: updateError } = await supabase
              .from('kpis')
              .update({ ...(structuralFields as any), updated_at: new Date().toISOString() })
              .eq('id', sibling.id);

            if (updateError) {
              console.error(`Failed to update sibling KPI ${sibling.id}:`, updateError);
              continue;
            }

            // Audit log for each sibling
            if (user) {
              await supabase.from('kpi_audit_logs').insert({
                kpi_id: sibling.id,
                performed_by: user.id,
                action: 'admin_bulk_apply',
                new_value: structuralFields as any,
                metadata: {
                  source: 'admin_bulk_apply',
                  source_kpi_id: kpi.id,
                  source_month: kpi.review_period,
                  reason: reason || 'Bulk applied from admin editor',
                },
              });
            }
          }

          toast.success(`KPI updated + ${filteredSiblings.length} sibling month(s) updated`);
        }
      } catch (err) {
        console.error('Sibling bulk update failed:', err);
        toast.error('Primary KPI saved, but some sibling months failed to update');
      }
    }

    onClose();
  };

  if (!kpi) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Admin KPI Editor</DialogTitle>
          <DialogDescription>
            Edit all KPI fields. Changes will be logged for audit purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Employee & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={formData.employee_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, employee_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map(profile => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KRA & KPI Names */}
          <div className="space-y-2">
            <Label>KRA Name</Label>
            <Input
              value={formData.kra_name}
              onChange={(e) => setFormData(prev => ({ ...prev, kra_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>KPI Name</Label>
            <Textarea
              value={formData.kpi_name}
              onChange={(e) => setFormData(prev => ({ ...prev, kpi_name: e.target.value }))}
              rows={2}
            />
          </div>

          {/* UOM Type Selector - placed above UOM dropdown */}
          <UomTypeSelector
            value={formData.uom_type}
            onChange={(type) => setFormData(prev => ({ ...prev, uom_type: type }))}
          />

          {/* Numeric-specific fields */}
          {formData.uom_type === 'numeric' && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Target Value</Label>
                <Input
                  type="number"
                  value={formData.target_value}
                  onChange={(e) => setFormData(prev => ({ ...prev, target_value: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>UOM</Label>
                <Select
                  value={formData.uom}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, uom: value }))}
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
              <div className="space-y-2">
                <Label>Weightage (%)</Label>
                <Input
                  type="number"
                  value={formData.weightage}
                  onChange={(e) => setFormData(prev => ({ ...prev, weightage: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Weightage for non-numeric types */}
          {formData.uom_type !== 'numeric' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weightage (%)</Label>
                <Input
                  type="number"
                  value={formData.weightage}
                  onChange={(e) => setFormData(prev => ({ ...prev, weightage: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value, frequency_cycle_start: '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {MULTI_MONTH_FREQUENCIES.includes(formData.frequency) && (() => {
                const cycleOptions = getCycleOptionsForFrequency(formData.frequency);
                if (!cycleOptions) return null;
                return (
                  <div className="space-y-2">
                    <Label>Cycle Start</Label>
                    <Select
                      value={formData.frequency_cycle_start}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, frequency_cycle_start: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="(Use system default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system_default">(Use system default)</SelectItem>
                        {cycleOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Frequency & Criteria for numeric */}
          {formData.uom_type === 'numeric' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value, frequency_cycle_start: '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Criteria</Label>
                <Select
                  value={formData.criteria}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, criteria: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select criteria" />
                  </SelectTrigger>
                  <SelectContent>
                    {CRITERIA_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {MULTI_MONTH_FREQUENCIES.includes(formData.frequency) && (() => {
                const cycleOptions = getCycleOptionsForFrequency(formData.frequency);
                if (!cycleOptions) return null;
                return (
                  <div className="space-y-2 col-span-2">
                    <Label>Cycle Start</Label>
                    <Select
                      value={formData.frequency_cycle_start}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, frequency_cycle_start: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="(Use system default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system_default">(Use system default)</SelectItem>
                        {cycleOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Override the global cycle start for this KPI</p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Day Count Type for Daily KPIs */}
          {formData.frequency === 'Daily' && (
            <div className="space-y-2">
              <Label>Day Count Type</Label>
              <Select
                value={formData.day_count_type}
                onValueChange={(value: 'working_days' | 'all_days') => setFormData(prev => ({ ...prev, day_count_type: value }))}
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

          {/* Source of Data */}
          <div className="space-y-2">
            <Label>Source of Data</Label>
            <Input
              value={formData.source_of_data}
              onChange={(e) => setFormData(prev => ({ ...prev, source_of_data: e.target.value }))}
            />
          </div>

          {/* Tiered Options Builder - only shown when UOM Type is Tiered */}
          {formData.uom_type === 'tiered' && (
            <div className="space-y-2">
              <TieredOptionsBuilder
                options={formData.qualitative_options}
                onChange={(options) => setFormData(prev => ({ ...prev, qualitative_options: options }))}
              />
              {tieredValidationError && (
                <p className="text-sm text-destructive">{tieredValidationError}</p>
              )}
            </div>
          )}

          {/* Binary UOM Info */}
          {formData.uom_type === 'binary' && (
            <div className="p-3 border rounded-lg bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Binary KPIs use fixed scoring: <strong>Yes = R5 (Outstanding)</strong>, <strong>No = R0 (Unacceptable)</strong>
              </p>
            </div>
          )}

          {/* Organization-Level KPI Toggle */}
          <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="text-base font-medium">Organization-Level KPI</Label>
                  <p className="text-sm text-muted-foreground">
                    Achieved value will be centrally managed via Org KPI Data Entry
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.is_org_level}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_org_level: checked }))}
              />
            </div>
            
            {/* Scope Selector - only shown when org-level is enabled */}
            {formData.is_org_level && (
              <div className="ml-8 space-y-2">
                <Label>Value Scope</Label>
                <Select
                  value={formData.org_level_scope}
                  onValueChange={(value: 'organization' | 'department' | 'employee') => 
                    setFormData(prev => ({ ...prev, org_level_scope: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organization">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Organization</span>
                        <span className="text-xs text-muted-foreground">Same value for all employees</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="department">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Department</span>
                        <span className="text-xs text-muted-foreground">Different value per department</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="employee">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Employee</span>
                        <span className="text-xs text-muted-foreground">Different value per employee</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Resubmission Settings */}
          <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
            <h3 className="font-medium text-sm">Resubmission Settings</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Require Reason for Resubmission</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, employees must provide a mandatory reason when editing previously submitted daily/weekly entries
                </p>
              </div>
              <Switch
                checked={formData.require_resubmit_reason}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, require_resubmit_reason: checked }))}
              />
            </div>
          </div>

          {/* Rating Thresholds - only shown for Numeric UOM Type */}
          {formData.uom_type === 'numeric' && (
            <div className="space-y-4">
              {/* Threshold Mode Selector */}
              <div className="space-y-2">
                <Label>Threshold Mode</Label>
                <Select
                  value={formData.threshold_mode}
                  onValueChange={(value: 'absolute' | 'ratio') => setFormData(prev => ({ ...prev, threshold_mode: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="absolute">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Absolute (Recommended)</span>
                        <span className="text-xs text-muted-foreground">Thresholds are actual values</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="ratio">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Ratio / Percentage</span>
                        <span className="text-xs text-muted-foreground">Thresholds are % of target</span>
                      </div>
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
              <div className="space-y-2">
                <Label>Rating Thresholds</Label>
                <div className="grid grid-cols-6 gap-2">
                  {(['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const).map((field) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs uppercase">{field}</Label>
                      <Input
                        value={formData[field]}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={formData.threshold_mode === 'absolute' ? '100' : '100%'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Review Period & Status */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Review Period</Label>
              <Select
                value={formData.review_period}
                onValueChange={(value) => setFormData(prev => ({ ...prev, review_period: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(month => (
                    <SelectItem key={month} value={month}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Review Year</Label>
              <Input
                type="number"
                value={formData.review_year}
                onChange={(e) => setFormData(prev => ({ ...prev, review_year: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as ReviewStatus }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Apply Scope Selector */}
          <div className="p-4 border rounded-lg bg-primary/5 border-primary/20 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Apply Changes To</Label>
            </div>
            <RadioGroup
              value={applyScope}
              onValueChange={(value) => setApplyScope(value as ApplyScope)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="this_month" id="scope_this" />
                <Label htmlFor="scope_this" className="text-sm font-normal cursor-pointer">
                  This month only
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="future_months" id="scope_future" />
                <Label htmlFor="scope_future" className="text-sm font-normal cursor-pointer">
                  All future months <span className="text-muted-foreground">(same year, after {kpi?.review_period || 'current month'})</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all_months" id="scope_all" />
                <Label htmlFor="scope_all" className="text-sm font-normal cursor-pointer">
                  All months <span className="text-muted-foreground">(every month in {kpi?.review_year || 'this year'})</span>
                </Label>
              </div>
            </RadioGroup>
            {applyScope !== 'this_month' && (
              <p className="text-xs text-muted-foreground">
                Structural fields (target, thresholds, weightage, UOM, etc.) will be applied to matching sibling KPIs. Status and achieved values are never changed.
              </p>
            )}
          </div>

          {/* Reason for Change */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason for Change {formData.status !== originalStatus && <span className="text-destructive">* (Required when changing status)</span>}
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={formData.status !== originalStatus ? "Required: Explain why the status is being changed..." : "Optional: Explain why this change is being made..."}
              rows={2}
              className={formData.status !== originalStatus && !reason.trim() ? 'border-destructive' : ''}
            />
            {formData.status !== originalStatus && (
              <p className="text-xs text-muted-foreground">
                Notifications will be sent to the employee and their reporting manager when status is changed.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={updateKpi.isPending || (formData.status !== originalStatus && !reason.trim()) || (formData.uom_type === 'tiered' && !!tieredValidationError)}
          >
            {updateKpi.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}