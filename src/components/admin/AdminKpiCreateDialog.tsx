import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useKraCategories, useProfiles, useCreateKraCategory } from '@/hooks/useOrganization';
import { useCreateKpi, ReviewStatus } from '@/hooks/useKpis';
import { useAssignOrgKpiOwner } from '@/hooks/useOrgKpiDataOwner';
import { OrgKpiDataOwnersField } from './org-kpi/OrgKpiDataOwnersField';
import { PendingOwner, buildOwnerAssignments, partitionOwnerFlush } from './org-kpi/ownerAssignmentModel';
import { useSystemSettings } from '@/hooks/useSystemSettings';

import { Separator } from '@/components/ui/separator';
import { UomTypeSelector } from './UomTypeSelector';
import { TieredOptionsBuilder } from './TieredOptionsBuilder';
import { UomType, QualitativeOption, BINARY_OPTIONS, BINARY_OPTIONS_INVERTED, isBinaryInverted } from '@/lib/qualitativeUom';
import { Badge } from '@/components/ui/badge';
import { UOM_OPTIONS } from '@/lib/uomConstants';
import { getCycleOptionsForFrequency, MULTI_MONTH_FREQUENCIES } from '@/lib/frequencyCycleOptions';
import { getActiveMonthForCycle, buildCycleScopeLabel } from '@/lib/frequencyUtils';
import { useKpiTemplates } from '@/hooks/useKpiTemplates';
import { useAllKpis } from '@/hooks/useKpis';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, ArrowLeft, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { KraLibrarySearchPanel } from './KraLibrarySearchPanel';
import { RegistryBadge } from './kpi-standardization/RegistryBadge';
import { KpiTextSplitFields } from './kpi-form/KpiTextSplitFields';
import { KpiScoringEditor } from './kpi-form/KpiScoringEditor';
import {
  KpiScoringState,
  KpiTextState,
  buildScoringPayload,
  buildTextPayload,
  textStateFromRow,
  validateScoringState,
} from './kpi-form/kpiFormModel';
import { toast } from 'sonner';

interface AdminKpiCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmployeeId?: string;
  defaultReviewPeriod?: string;
  defaultReviewYear?: number;
}

export function AdminKpiCreateDialog({ isOpen, onClose, defaultEmployeeId, defaultReviewPeriod, defaultReviewYear }: AdminKpiCreateDialogProps) {
  const { data: categories } = useKraCategories();
  const { data: profiles } = useProfiles();
  const { data: settingsData } = useSystemSettings();
  const createKpi = useCreateKpi();
  const { data: templates } = useKpiTemplates();
  const { data: allKpis } = useAllKpis();

  // Combobox state
  const [kraOpen, setKraOpen] = useState(false);
  const [kpiOpen, setKpiOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [isCustomKra, setIsCustomKra] = useState(false);
  const [isCustomKpi, setIsCustomKpi] = useState(false);
  const [binaryInverted, setBinaryInverted] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customCategoryWeightage, setCustomCategoryWeightage] = useState('');
  const [customCategoryColor, setCustomCategoryColor] = useState('#3B82F6');

  const createCategory = useCreateKraCategory();

  // Parse settings data
  const currentMonthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];

  const settings = useMemo(() => {
    if (!settingsData) return { current_review_period: currentMonthName, current_review_year: new Date().getFullYear() };
    
    const periodSetting = settingsData.find(s => s.setting_key === 'current_review_period');
    const yearSetting = settingsData.find(s => s.setting_key === 'current_review_year');
    
    return {
      current_review_period: periodSetting?.setting_value as string || currentMonthName,
      current_review_year: yearSetting?.setting_value as number || new Date().getFullYear(),
    };
  }, [settingsData, currentMonthName]);

  // Form state
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || '');
  const [categoryId, setCategoryId] = useState('');
  const [kraName, setKraName] = useState('');
  const [kpiName, setKpiName] = useState('');
  const [uom, setUom] = useState('');
  const [criteria, setCriteria] = useState('Higher is Better');
  const [targetValue, setTargetValue] = useState<string>('');
  const [weightage, setWeightage] = useState<string>('');
  const [frequency, setFrequency] = useState('Monthly');
  const [frequencyCycleStart, setFrequencyCycleStart] = useState('');
  const [dayCountType, setDayCountType] = useState<'working_days' | 'all_days'>('working_days');
  const [sourceOfData, setSourceOfData] = useState('');
  
  // Rating thresholds
  const [r5, setR5] = useState('');
  const [r4, setR4] = useState('');
  const [r3, setR3] = useState('');
  const [r2, setR2] = useState('');
  const [r1, setR1] = useState('');
  const [r0, setR0] = useState('');

  // Qualitative UOM
  const [uomType, setUomType] = useState<UomType>('numeric');
  const [qualitativeOptions, setQualitativeOptions] = useState<QualitativeOption[]>([
    { label: 'Yes', rating: 5, definition: 'Requirement fully met' },
    { label: 'No', rating: 0, definition: 'Requirement not met' },
  ]);
  const [requireResubmitReason, setRequireResubmitReason] = useState(true);
  const [thresholdMode, setThresholdMode] = useState<'absolute' | 'ratio'>('absolute');
  const [isOrgLevel, setIsOrgLevel] = useState(false);
  const [orgLevelScope, setOrgLevelScope] = useState('organization');
  // ADR-335 — owners queued while the KPI does not exist yet.
  const [pendingOwners, setPendingOwners] = useState<PendingOwner[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // ADR-272 — structured KPI text, shared with the Admin KPI Editor
  const [textState, setTextState] = useState<KpiTextState>({
    kpi_name: '', kpi_title: '', kpi_description: '', kpi_formula: '', kpi_scoring_logic: '',
  });

  // Period - prefer explicit defaults from props, then system settings
  const [reviewPeriod, setReviewPeriod] = useState(defaultReviewPeriod || settings.current_review_period);
  const [reviewYear, setReviewYear] = useState<number>(defaultReviewYear || settings.current_review_year);

  useEffect(() => {
    if (defaultEmployeeId) {
      setEmployeeId(defaultEmployeeId);
    }
  }, [defaultEmployeeId]);

  useEffect(() => {
    if (!defaultReviewPeriod && settings.current_review_period) {
      setReviewPeriod(settings.current_review_period);
    }
    if (!defaultReviewYear && settings.current_review_year) {
      setReviewYear(settings.current_review_year);
    }
  }, [settings, defaultReviewPeriod, defaultReviewYear]);

  // Derived template data with fallback to existing KPIs
  const filteredKraNames = useMemo(() => {
    if (!categoryId) return [];
    // Merge template KRA names with existing KPI KRA names (deduplicated)
    const templateNames = (templates || [])
      .filter(t => t.is_active && t.category_id === categoryId)
      .map(t => t.kra_name);
    const kpiNames = (allKpis || [])
      .filter(k => k.category_id === categoryId)
      .map(k => k.kra_name);
    return [...new Set([...templateNames, ...kpiNames])].sort();
  }, [templates, allKpis, categoryId]);

  const filteredKpiTemplates = useMemo(() => {
    if (!categoryId || !kraName) return [];
    // Start with matching templates
    const fromTemplates = (templates || []).filter(
      t => t.is_active && t.category_id === categoryId && t.kra_name === kraName
    );
    // Collect template KPI names for dedup (case-insensitive)
    const templateKpiNamesLower = new Set(fromTemplates.map(t => t.kpi_name.toLowerCase()));
    // Append unique KPIs from existing assignments (shaped like templates)
    const fromExisting = (allKpis || [])
      .filter(k => k.category_id === categoryId && k.kra_name === kraName)
      .reduce((acc, k) => {
        const lowerName = k.kpi_name.toLowerCase();
        if (!templateKpiNamesLower.has(lowerName) && !acc.some(item => item.kpi_name.toLowerCase() === lowerName)) {
          acc.push({
            id: k.id,
            kpi_name: k.kpi_name,
            kra_name: k.kra_name,
            category_id: k.category_id,
            uom: k.uom,
            uom_type: k.uom_type,
            criteria: k.criteria,
            target_value: k.target_value,
            weightage: k.weightage,
            frequency: k.frequency,
            source_of_data: k.source_of_data,
            r5: k.r5, r4: k.r4, r3: k.r3, r2: k.r2, r1: k.r1, r0: k.r0,
            qualitative_options: k.qualitative_options,
            threshold_mode: k.threshold_mode,
            require_resubmit_reason: k.require_resubmit_reason,
            is_active: true,
            title: k.kpi_name,
            description: null,
            applicable_roles: [],
            created_at: k.created_at,
            updated_at: k.updated_at,
            created_by: null,
          });
        }
        return acc;
      }, [] as any[]);
    return [...fromTemplates, ...fromExisting];
  }, [templates, allKpis, categoryId, kraName]);

  // Ref to skip cascading resets when KRA Library search sets values
  const skipResetRef = useRef(false);

  // Reset KRA/KPI when category changes
  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    setKraName('');
    setKpiName('');
    setIsCustomKra(false);
    setIsCustomKpi(false);
  }, [categoryId]);

  // Reset KPI when KRA changes
  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    setKpiName('');
    setIsCustomKpi(false);
  }, [kraName]);

  const applyTemplate = (kpiNameValue: string) => {
    const tpl = filteredKpiTemplates.find(t => t.kpi_name === kpiNameValue);
    if (!tpl) return;
    // Track template link - only real templates (from kpi_templates table) have created_by or applicable_roles
    const isRealTemplate = (templates || []).some(t => t.id === tpl.id);
    setSelectedTemplateId(isRealTemplate ? tpl.id : null);
    if (tpl.uom_type) setUomType(tpl.uom_type as UomType);
    if (tpl.uom) setUom(tpl.uom);
    if (tpl.criteria) setCriteria(tpl.criteria);
    if (tpl.target_value != null) setTargetValue(String(tpl.target_value));
    if (tpl.weightage != null) setWeightage(String(tpl.weightage));
    if (tpl.frequency) setFrequency(tpl.frequency);
    if (tpl.source_of_data) setSourceOfData(tpl.source_of_data);
    if (tpl.r5) setR5(tpl.r5);
    if (tpl.r4) setR4(tpl.r4);
    if (tpl.r3) setR3(tpl.r3);
    if (tpl.r2) setR2(tpl.r2);
    if (tpl.r1) setR1(tpl.r1);
    if (tpl.r0) setR0(tpl.r0);
    if (tpl.qualitative_options) setQualitativeOptions(tpl.qualitative_options as QualitativeOption[]);
    if (tpl.threshold_mode) setThresholdMode(tpl.threshold_mode as 'absolute' | 'ratio');
    if (tpl.require_resubmit_reason != null) setRequireResubmitReason(tpl.require_resubmit_reason);
  };

  const resetForm = () => {
    setEmployeeId(defaultEmployeeId || '');
    setCategoryId('');
    setKraName('');
    setKpiName('');
    setUom('');
    setCriteria('Higher is Better');
    setTargetValue('');
    setWeightage('');
    setFrequency('Monthly');
    setFrequencyCycleStart('');
    setDayCountType('working_days');
    setSourceOfData('');
    setR5('');
    setR4('');
    setR3('');
    setR2('');
    setR1('');
    setR0('');
    setUomType('numeric');
    setQualitativeOptions([
      { label: 'Yes', rating: 5, definition: 'Requirement fully met' },
      { label: 'No', rating: 0, definition: 'Requirement not met' },
    ]);
    setReviewPeriod(settings.current_review_period);
    setReviewYear(settings.current_review_year);
    setRequireResubmitReason(true);
    setThresholdMode('absolute');
    setIsOrgLevel(false);
    setOrgLevelScope('organization');
    setPendingOwners([]);
    setIsCustomKra(false);
    setIsCustomKpi(false);
    setIsCustomCategory(false);
    setCustomCategoryName('');
    setCustomCategoryWeightage('');
    setCustomCategoryColor('#3B82F6');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Compute resolved effective month for multi-month frequencies
  const resolvedPeriod = useMemo(() => {
    return getActiveMonthForCycle(frequency, reviewPeriod, reviewYear, frequencyCycleStart || null);
  }, [frequency, reviewPeriod, reviewYear, frequencyCycleStart]);

  const cycleScope = useMemo(
    () => buildCycleScopeLabel(frequency, reviewPeriod, reviewYear, frequencyCycleStart || null),
    [frequency, reviewPeriod, reviewYear, frequencyCycleStart]
  );

  // ADR-272 — scoring state shared with the Admin KPI Editor
  const scoringState: KpiScoringState = {
    uom_type: uomType,
    threshold_mode: thresholdMode,
    qualitative_options:
      uomType === 'binary'
        ? (binaryInverted ? BINARY_OPTIONS_INVERTED : BINARY_OPTIONS)
        : qualitativeOptions,
    r5, r4, r3, r2, r1, r0,
  };

  const setScoring = (next: KpiScoringState) => {
    setThresholdMode(next.threshold_mode);
    setR5(next.r5); setR4(next.r4); setR3(next.r3);
    setR2(next.r2); setR1(next.r1); setR0(next.r0);
    if (next.uom_type === 'binary') {
      setBinaryInverted(isBinaryInverted(next.qualitative_options));
    }
    setQualitativeOptions(next.qualitative_options);
  };

  // ADR-272 — mirror plain kpiName edits into the structured text state
  useEffect(() => {
    setTextState((prev) => (prev.kpi_name === kpiName ? prev : textStateFromRow({
      kpi_name: kpiName,
      kpi_title: prev.kpi_title || null,
      kpi_description: prev.kpi_description || null,
      kpi_formula: prev.kpi_formula || null,
      kpi_scoring_logic: prev.kpi_scoring_logic || null,
    })));
  }, [kpiName]);

  const handleTextChange = (next: KpiTextState) => {
    setTextState(next);
    setKpiName(buildTextPayload(next).kpi_name);
  };

  const assignOwner = useAssignOrgKpiOwner();

  const handleSubmit = async () => {
    if (!employeeId || !categoryId || !kraName || !kpiName) {
      return;
    }

    // ADR-272 — same validation as the Admin KPI Editor
    const scoringError = validateScoringState(scoringState);
    if (scoringError) {
      toast.error(scoringError);
      return;
    }
    const textPayload = buildTextPayload(textState);
    const scoringPayload = buildScoringPayload(scoringState);

    try {
      await createKpi.mutateAsync({
        payload: {
          employee_id: employeeId,
          category_id: categoryId,
          kra_name: kraName,
          ...textPayload,
          uom: uomType === 'numeric' ? (uom || null) : uomType,
          criteria: uomType === 'numeric' ? (criteria || null) : null,
          target_value: uomType === 'numeric' ? (targetValue ? parseFloat(targetValue) : null) : null,
          weightage: weightage ? parseFloat(weightage) : null,
          frequency: frequency || null,
          source_of_data: sourceOfData || null,
          ...scoringPayload,
          review_period: resolvedPeriod,
          review_year: reviewYear,
          status: 'kra_set' as ReviewStatus,
          is_org_level: isOrgLevel,
          org_level_scope: isOrgLevel ? orgLevelScope as any : null,
          sub_frequency: null,
          frequency_cycle_start: (frequencyCycleStart && frequencyCycleStart !== 'system_default') ? frequencyCycleStart : null,
          is_frequency_locked: false,
          require_resubmit_reason: requireResubmitReason,
          day_count_type: frequency === 'Daily' ? dayCountType : null,
          source_template_id: selectedTemplateId || null,
        },
        errorContext: {
          frequency,
          selectedMonth: reviewPeriod,
          resolvedMonth: resolvedPeriod,
          selectedYear: reviewYear,
        },
        assignedMonth: reviewPeriod,
        frequencyCycleStart: (frequencyCycleStart && frequencyCycleStart !== 'system_default') ? frequencyCycleStart : null,
      });

      // ADR-335 — attach queued data entry owners once the KPI exists. A
      // failure never rolls the KPI back; the picks stay for a retry.
      if (isOrgLevel && pendingOwners.length > 0) {
        const assignments = buildOwnerAssignments(
          { categoryId, kraName, kpiName: textPayload.kpi_name || kpiName },
          pendingOwners,
        );
        const results = await Promise.all(
          assignments.map(async (a) => {
            try {
              await assignOwner.mutateAsync({
                categoryId: a.categoryId,
                kraName: a.kraName,
                kpiName: a.kpiName,
                ownerId: a.ownerId,
              });
              return { ownerId: a.ownerId, ok: true };
            } catch {
              return { ownerId: a.ownerId, ok: false };
            }
          }),
        );
        const outcome = partitionOwnerFlush(pendingOwners, results);
        if (outcome.failed.length > 0) {
          setPendingOwners(outcome.remaining);
          toast.error(outcome.message ?? 'Some data entry owners were not attached');
          return;
        }
      }

      handleClose();
    } catch {
      // Error already handled by useCreateKpi onError toast
    }
  };

  const periods = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const applySourceFields = (source: any, isTemplate: boolean) => {
    if (isTemplate) {
      setSelectedTemplateId(source.id);
    } else {
      setSelectedTemplateId(null);
    }
    if (source.uom_type) setUomType(source.uom_type as UomType);
    if (source.uom) setUom(source.uom);
    if (source.criteria) setCriteria(source.criteria);
    if (source.target_value != null) setTargetValue(String(source.target_value));
    if (source.weightage != null) setWeightage(String(source.weightage));
    if (source.frequency) setFrequency(source.frequency);
    if (source.source_of_data) setSourceOfData(source.source_of_data);
    if (source.r5) setR5(source.r5);
    if (source.r4) setR4(source.r4);
    if (source.r3) setR3(source.r3);
    if (source.r2) setR2(source.r2);
    if (source.r1) setR1(source.r1);
    if (source.r0) setR0(source.r0);
    if (source.qualitative_options) {
      setQualitativeOptions(source.qualitative_options as QualitativeOption[]);
      setBinaryInverted(isBinaryInverted(source.qualitative_options as QualitativeOption[]));
    } else {
      setBinaryInverted(false);
    }
    if (source.threshold_mode) setThresholdMode(source.threshold_mode as 'absolute' | 'ratio');
    if (source.require_resubmit_reason != null) setRequireResubmitReason(source.require_resubmit_reason);
    // ADR-272 — keep structured text in sync with the selected template/KPI
    if (source.kpi_name) {
      setTextState(textStateFromRow({
        kpi_name: source.kpi_name,
        kpi_title: source.kpi_title ?? null,
        kpi_description: source.kpi_description ?? null,
        kpi_formula: source.kpi_formula ?? null,
        kpi_scoring_logic: source.kpi_scoring_logic ?? null,
      }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[96vw] max-w-[1200px] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Assign New KRA</DialogTitle>
          <DialogDescription>Create and assign a new KRA/KPI to an employee</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-6 py-5">
          <div className="w-full min-w-0 space-y-5">

            {/* ─── ASSIGNMENT: library search + employee ─── */}
            <div className="min-w-0 space-y-4 rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment</span>
                <div className="flex-1 h-px bg-border" />
              </div>

            {/* KRA Library Quick Search */}
            <KraLibrarySearchPanel

              templates={templates}
              allKpis={allKpis}
              categories={categories}
              onSelectKpi={(catId, kra, kpi) => {
                skipResetRef.current = true;
                setCategoryId(catId);
                setKraName(kra);
                setKpiName(kpi);
                setIsCustomKra(true);
                setIsCustomKpi(true);
                // Apply template fields
                const tpl = (templates || []).find(
                  t => t.is_active && t.category_id === catId && t.kra_name === kra && t.kpi_name === kpi
                );
                if (tpl) {
                  applySourceFields(tpl, true);
                } else {
                  const existing = (allKpis || []).find(
                    k => k.category_id === catId && k.kra_name === kra && k.kpi_name === kpi
                  );
                  if (existing) {
                    applySourceFields(existing, false);
                  }
                }
              }}
            />

            <Separator />

            {/* Employee Selection - hidden when pre-filled from issuance dialog */}
            {!defaultEmployeeId && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Assign to Employee *</Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles?.map(profile => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email} {profile.employee_code ? `(${profile.employee_code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            </div>



            {/* Main layout — two structured panels, side by side on wide screens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

              {/* ─── LEFT COLUMN: KRA Identity ─── */}
              <div className="min-w-0 space-y-4 rounded-lg border bg-card p-4">

                {/* Section header */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">KRA Identity</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Category *</Label>
                  {isCustomCategory ? (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-muted-foreground">New Category</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { setIsCustomCategory(false); setCustomCategoryName(''); setCustomCategoryWeightage(''); setCustomCategoryColor('#3B82F6'); }}
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        value={customCategoryName}
                        onChange={(e) => setCustomCategoryName(e.target.value)}
                        placeholder="Category name"
                      />
                      <div className="grid grid-cols-2 gap-2 min-w-0">
                        <Input
                          type="number"
                          value={customCategoryWeightage}
                          onChange={(e) => setCustomCategoryWeightage(e.target.value)}
                          placeholder="Weightage %"
                          min={0}
                          max={100}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={customCategoryColor}
                            onChange={(e) => setCustomCategoryColor(e.target.value)}
                            className="h-10 w-10 cursor-pointer rounded border border-input p-1"
                          />
                          <Input
                            value={customCategoryColor}
                            onChange={(e) => setCustomCategoryColor(e.target.value)}
                            placeholder="#hex"
                            className="flex-1"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        disabled={!customCategoryName.trim() || !customCategoryWeightage || createCategory.isPending}
                        onClick={() => {
                          createCategory.mutate(
                            { name: customCategoryName.trim(), weightage: parseFloat(customCategoryWeightage), color: customCategoryColor },
                            {
                              onSuccess: (newCat) => {
                                setCategoryId(newCat.id);
                                setIsCustomCategory(false);
                                setCustomCategoryName('');
                                setCustomCategoryWeightage('');
                                setCustomCategoryColor('#3B82F6');
                              },
                            }
                          );
                        }}
                      >
                        {createCategory.isPending ? 'Saving...' : 'Save Category'}
                      </Button>
                    </div>
                  ) : (
                    <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={categoryOpen}
                          className="w-full justify-between font-normal"
                        >
                          {categoryId ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: categories?.find(c => c.id === categoryId)?.color || '#3B82F6' }}
                              />
                              <span className="truncate">{categories?.find(c => c.id === categoryId)?.name} ({categories?.find(c => c.id === categoryId)?.weightage}%)</span>
                            </div>
                          ) : "Select category..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search categories..." />
                          <CommandList>
                            <CommandEmpty>No categories found.</CommandEmpty>
                            <CommandGroup>
                              {categories?.map((cat) => (
                                <CommandItem
                                  key={cat.id}
                                  value={cat.name}
                                  onSelect={() => {
                                    setCategoryId(cat.id);
                                    setCategoryOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", categoryId === cat.id ? "opacity-100" : "opacity-0")} />
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: cat.color || '#3B82F6' }}
                                    />
                                    {cat.name} ({cat.weightage}%)
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  setIsCustomCategory(true);
                                  setCategoryOpen(false);
                                }}
                              >
                                <span className="text-muted-foreground">+ Create new category</span>
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {/* KRA Name */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">KRA Name *</Label>
                  {isCustomKra ? (
                    <div className="flex gap-2">
                      <Input
                        value={kraName}
                        onChange={(e) => setKraName(e.target.value)}
                        placeholder="Enter custom KRA name"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => { setIsCustomKra(false); setKraName(''); }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Popover open={kraOpen} onOpenChange={setKraOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={kraOpen}
                          className="w-full justify-between font-normal"
                          disabled={!categoryId}
                        >
                          <span className="truncate text-left">
                            {kraName || (categoryId ? "Select KRA name..." : "Select a category first")}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search KRA names..." />
                          <CommandList>
                            <CommandEmpty>No KRA names found.</CommandEmpty>
                            <CommandGroup>
                              {filteredKraNames.map((name) => (
                                <CommandItem
                                  key={name}
                                  value={name}
                                  onSelect={() => {
                                    setKraName(name);
                                    setKraOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4 shrink-0", kraName === name ? "opacity-100" : "opacity-0")} />
                                  {name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  setIsCustomKra(true);
                                  setKraName('');
                                  setKraOpen(false);
                                }}
                              >
                                <span className="text-muted-foreground">+ Enter custom KRA name</span>
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {/* KPI Name */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">KPI Name *</Label>
                    <RegistryBadge
                      categoryId={categoryId}
                      kraName={kraName}
                      kpiName={kpiName}
                      reviewPeriod={reviewPeriod}
                      reviewYear={reviewYear}
                    />
                  </div>
                  {isCustomKpi ? (
                    <div className="flex gap-2">
                      <Textarea
                        value={kpiName}
                        onChange={(e) => setKpiName(e.target.value)}
                        placeholder="Enter custom KPI name"
                        rows={3}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="self-start"
                        onClick={() => { setIsCustomKpi(false); setKpiName(''); }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Popover open={kpiOpen} onOpenChange={setKpiOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={kpiOpen}
                          className="w-full justify-between font-normal h-auto min-h-10 text-left"
                          disabled={!kraName}
                        >
                          <span className="line-clamp-2 text-left">
                            {kpiName || (kraName ? "Select KPI name..." : "Select a KRA first")}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search KPI names..." />
                          <CommandList>
                            <CommandEmpty>No KPI templates found.</CommandEmpty>
                            <CommandGroup>
                              {filteredKpiTemplates.map((tpl) => (
                                <CommandItem
                                  key={tpl.id}
                                  value={tpl.kpi_name}
                                  onSelect={() => {
                                    setKpiName(tpl.kpi_name);
                                    applyTemplate(tpl.kpi_name);
                                    setKpiOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4 shrink-0", kpiName === tpl.kpi_name ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col">
                                    <span>{tpl.kpi_name}</span>
                                    {tpl.target_value != null && (
                                      <span className="text-xs text-muted-foreground">Target: {tpl.target_value} {tpl.uom || ''}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  setIsCustomKpi(true);
                                  setKpiName('');
                                  setKpiOpen(false);
                                }}
                              >
                                <span className="text-muted-foreground">+ Enter custom KPI name</span>
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                  {/* Show selected KPI prominently */}
                  {kpiName && !isCustomKpi && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed">{kpiName}</p>
                  )}
                </div>

                {/* ADR-272 — structured KPI text (title / description / formula / logic) */}
                <KpiTextSplitFields value={textState} onChange={handleTextChange} />

                {/* ADR-272 / ADR-271 — shared, type-aware scoring editor */}
                {uomType === 'numeric' && (
                  <KpiScoringEditor value={scoringState} onChange={setScoring} />
                )}

                {/* Period & Advanced (left column bottom) */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Effective Period</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 min-w-0">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Effective Month</Label>
                      <Select value={reviewPeriod} onValueChange={setReviewPeriod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {periods.map(period => (
                            <SelectItem key={period} value={period}>{period}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Year</Label>
                      <Select value={reviewYear.toString()} onValueChange={(v) => setReviewYear(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map(year => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {cycleScope.isMultiMonth && (
                    <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 space-y-1">
                      <p>
                        <strong>{frequency}</strong> cycle covers{' '}
                        <strong>{cycleScope.cycleMonths.join(', ')} {reviewYear}</strong>
                        {cycleScope.wrapsYear && <> – {cycleScope.anchorYear}</>}.
                      </p>
                      <p className="flex items-center gap-1.5">
                        <span>
                          Reviewed once in{' '}
                          <strong>{cycleScope.anchorMonth} {cycleScope.anchorYear}</strong> (cycle end);
                          the approved score auto-applies to all months in the cycle.
                        </span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              Multi-month KPIs (Bi-Monthly, Quarterly, Half-Yearly, Yearly) are scored
                              once at the cycle's terminal month. The approved score is automatically
                              percolated to every month in the cycle. This avoids duplicate reviews and
                              keeps scores consistent across the period (POLICY §54 v3).
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </p>
                      <p className="pt-1 border-t border-amber-500/20 mt-1">
                        Placeholder rows will be created for each open month in the cycle from{' '}
                        <strong>{reviewPeriod}</strong> forward, so the employee sees the KPI as
                        mapped every month. Past or locked months are skipped.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── RIGHT COLUMN: Metrics & Configuration ─── */}
              <div className="min-w-0 space-y-4 rounded-lg border bg-card p-4">

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metrics & Configuration</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* UOM Type Selector */}
                <UomTypeSelector value={uomType} onChange={setUomType} />

                {/* Numeric fields */}
                {uomType === 'numeric' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 min-w-0">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Unit of Measure (UOM)</Label>
                        <Select value={uom} onValueChange={setUom}>
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
                        <Label className="text-sm font-medium">Target Value</Label>
                        <Input
                          type="number"
                          value={targetValue}
                          onChange={(e) => setTargetValue(e.target.value)}
                          placeholder="e.g., 100"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Weightage (%)</Label>
                        <Input
                          type="number"
                          value={weightage}
                          onChange={(e) => setWeightage(e.target.value)}
                          placeholder="e.g., 10"
                          min="0"
                          max="100"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Criteria</Label>
                        <Select value={criteria} onValueChange={setCriteria}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Higher is Better">Higher is Better</SelectItem>
                            <SelectItem value="Lower is Better">Lower is Better</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* ADR-343 — shared frequency + cycle anchor field */}
                      <FrequencyField
                        frequency={frequency}
                        onFrequencyChange={(v) => { setFrequency(v); setFrequencyCycleStart(''); }}
                        cycleStart={frequencyCycleStart}
                        onCycleStartChange={setFrequencyCycleStart}
                      />

                      {frequency === 'Daily' && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Day Count Type</Label>
                          <Select value={dayCountType} onValueChange={(v: 'working_days' | 'all_days') => setDayCountType(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="working_days">Working Days Only</SelectItem>
                              <SelectItem value="all_days">All Calendar Days</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {dayCountType === 'working_days'
                              ? 'Uses employee-specific working days for missed days calculation'
                              : 'Uses all calendar days (e.g., 31 days in January)'}
                          </p>
                        </div>
                      )}
                      <div className="space-y-2 col-span-2">
                        <Label className="text-sm font-medium">Source of Data</Label>
                        <Input
                          value={sourceOfData}
                          onChange={(e) => setSourceOfData(e.target.value)}
                          placeholder="e.g., CRM, ERP"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Binary fields */}
                {uomType === 'binary' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 min-w-0">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Weightage (%)</Label>
                        <Input
                          type="number"
                          value={weightage}
                          onChange={(e) => setWeightage(e.target.value)}
                          placeholder="e.g., 10"
                          min="0"
                          max="100"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Frequency</Label>
                        <Select value={frequency} onValueChange={setFrequency}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Daily">Daily</SelectItem>
                            <SelectItem value="Weekly">Weekly</SelectItem>
                            <SelectItem value="Monthly">Monthly</SelectItem>
                            <SelectItem value="Quarterly">Quarterly</SelectItem>
                            <SelectItem value="Yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {frequency === 'Daily' && (
                        <div className="space-y-2 col-span-2">
                          <Label className="text-sm font-medium">Day Count Type</Label>
                          <Select value={dayCountType} onValueChange={(v: 'working_days' | 'all_days') => setDayCountType(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="working_days">Working Days Only</SelectItem>
                              <SelectItem value="all_days">All Calendar Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {/* ADR-272 / ADR-271 — shared, type-aware scoring editor */}
                    <KpiScoringEditor value={scoringState} onChange={setScoring} />
                  </div>
                )}

                {/* Tiered fields */}
                {uomType === 'tiered' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 min-w-0">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Weightage (%)</Label>
                        <Input
                          type="number"
                          value={weightage}
                          onChange={(e) => setWeightage(e.target.value)}
                          placeholder="e.g., 10"
                          min="0"
                          max="100"
                        />
                      </div>
                      <FrequencyField
                        frequency={frequency}
                        onFrequencyChange={(v) => { setFrequency(v); setFrequencyCycleStart(''); }}
                        cycleStart={frequencyCycleStart}
                        onCycleStartChange={setFrequencyCycleStart}
                      />

                    </div>
                    {/* ADR-272 / ADR-271 — shared, type-aware scoring editor */}
                    <KpiScoringEditor value={scoringState} onChange={setScoring} />
                  </div>
                )}

                {/* Advanced Settings */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advanced</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm font-medium">Require Reason for Resubmission</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Employees must provide a reason when editing previously submitted entries
                        </p>
                      </div>
                      <Switch
                        checked={requireResubmitReason}
                        onCheckedChange={setRequireResubmitReason}
                      />
                    </div>
                  </div>
                  <div className="p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm font-medium">Organization-Level KPI</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Mark as centrally managed org KPI with a single achieved value
                        </p>
                      </div>
                      <Switch
                        checked={isOrgLevel}
                        onCheckedChange={setIsOrgLevel}
                      />
                    </div>
                    {isOrgLevel && (
                      <div className="mt-3 space-y-3">
                        <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Scope</Label>
                        <Select value={orgLevelScope} onValueChange={setOrgLevelScope}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="organization">Organization</SelectItem>
                            <SelectItem value="department">Department</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                        </div>
                        {/* ADR-335 — map the KPI's data entry owners here */}
                        <OrgKpiDataOwnersField
                          mode="pending"
                          categoryId={categoryId}
                          kraName={kraName}
                          kpiName={kpiName}
                          pending={pendingOwners}
                          onPendingChange={setPendingOwners}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4">

          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!employeeId || !categoryId || !kraName || !kpiName || createKpi.isPending}
          >
            {createKpi.isPending ? 'Creating...' : 'Assign KRA'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
