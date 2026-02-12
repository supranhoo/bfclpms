import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useKraCategories, useProfiles } from '@/hooks/useOrganization';
import { useCreateKpi, ReviewStatus } from '@/hooks/useKpis';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UomTypeSelector } from './UomTypeSelector';
import { TieredOptionsBuilder } from './TieredOptionsBuilder';
import { UomType, QualitativeOption, BINARY_OPTIONS } from '@/lib/qualitativeUom';
import { Badge } from '@/components/ui/badge';
import { UOM_OPTIONS } from '@/lib/uomConstants';
import { getCycleOptionsForFrequency, MULTI_MONTH_FREQUENCIES } from '@/lib/frequencyCycleOptions';
import { useKpiTemplates } from '@/hooks/useKpiTemplates';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminKpiCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmployeeId?: string;
}

export function AdminKpiCreateDialog({ isOpen, onClose, defaultEmployeeId }: AdminKpiCreateDialogProps) {
  const { data: categories } = useKraCategories();
  const { data: profiles } = useProfiles();
  const { data: settingsData } = useSystemSettings();
  const createKpi = useCreateKpi();
  const { data: templates } = useKpiTemplates();

  // Combobox state
  const [kraOpen, setKraOpen] = useState(false);
  const [kpiOpen, setKpiOpen] = useState(false);
  const [isCustomKra, setIsCustomKra] = useState(false);
  const [isCustomKpi, setIsCustomKpi] = useState(false);

  // Parse settings data
  const settings = useMemo(() => {
    if (!settingsData) return { current_review_period: 'January', current_review_year: new Date().getFullYear() };
    
    const periodSetting = settingsData.find(s => s.setting_key === 'current_review_period');
    const yearSetting = settingsData.find(s => s.setting_key === 'current_review_year');
    
    return {
      current_review_period: periodSetting?.setting_value as string || 'January',
      current_review_year: yearSetting?.setting_value as number || new Date().getFullYear(),
    };
  }, [settingsData]);

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

  // Period
  const [reviewPeriod, setReviewPeriod] = useState(settings.current_review_period);
  const [reviewYear, setReviewYear] = useState<number>(settings.current_review_year);

  useEffect(() => {
    if (defaultEmployeeId) {
      setEmployeeId(defaultEmployeeId);
    }
  }, [defaultEmployeeId]);

  useEffect(() => {
    if (settings.current_review_period) {
      setReviewPeriod(settings.current_review_period);
    }
    if (settings.current_review_year) {
      setReviewYear(settings.current_review_year);
    }
  }, [settings]);

  // Derived template data
  const filteredKraNames = useMemo(() => {
    if (!templates || !categoryId) return [];
    const names = templates
      .filter(t => t.is_active && t.category_id === categoryId)
      .map(t => t.kra_name);
    return [...new Set(names)].sort();
  }, [templates, categoryId]);

  const filteredKpiTemplates = useMemo(() => {
    if (!templates || !categoryId || !kraName) return [];
    return templates.filter(
      t => t.is_active && t.category_id === categoryId && t.kra_name === kraName
    );
  }, [templates, categoryId, kraName]);

  // Reset KRA/KPI when category changes
  useEffect(() => {
    setKraName('');
    setKpiName('');
    setIsCustomKra(false);
    setIsCustomKpi(false);
  }, [categoryId]);

  // Reset KPI when KRA changes
  useEffect(() => {
    setKpiName('');
    setIsCustomKpi(false);
  }, [kraName]);

  const applyTemplate = (kpiNameValue: string) => {
    const tpl = filteredKpiTemplates.find(t => t.kpi_name === kpiNameValue);
    if (!tpl) return;
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
    setIsCustomKra(false);
    setIsCustomKpi(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!employeeId || !categoryId || !kraName || !kpiName) {
      return;
    }

    await createKpi.mutateAsync({
      employee_id: employeeId,
      category_id: categoryId,
      kra_name: kraName,
      kpi_name: kpiName,
      uom: uomType === 'numeric' ? (uom || null) : uomType,
      criteria: uomType === 'numeric' ? (criteria || null) : null,
      target_value: uomType === 'numeric' ? (targetValue ? parseFloat(targetValue) : null) : null,
      weightage: weightage ? parseFloat(weightage) : null,
      frequency: frequency || null,
      source_of_data: sourceOfData || null,
      r5: uomType === 'numeric' ? (r5 || null) : null,
      r4: uomType === 'numeric' ? (r4 || null) : null,
      r3: uomType === 'numeric' ? (r3 || null) : null,
      r2: uomType === 'numeric' ? (r2 || null) : null,
      r1: uomType === 'numeric' ? (r1 || null) : null,
      r0: uomType === 'numeric' ? (r0 || null) : null,
      review_period: reviewPeriod,
      review_year: reviewYear,
      status: 'kra_set' as ReviewStatus,
      is_org_level: false,
      org_level_scope: 'organization' as const,
      uom_type: uomType,
      qualitative_options: uomType === 'tiered' ? qualitativeOptions : (uomType === 'binary' ? BINARY_OPTIONS : null),
      // Frequency fields - auto-derived by database trigger
      sub_frequency: null,
      frequency_cycle_start: (frequencyCycleStart && frequencyCycleStart !== 'system_default') ? frequencyCycleStart : null,
      is_frequency_locked: false,
      require_resubmit_reason: requireResubmitReason,
      day_count_type: frequency === 'Daily' ? dayCountType : null,
      threshold_mode: uomType === 'numeric' ? thresholdMode : null,
    });

    handleClose();
  };

  const periods = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
    'Q1', 'Q2', 'Q3', 'Q4'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Assign New KRA</DialogTitle>
          <DialogDescription>Create and assign a new KRA/KPI to an employee</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6 py-2">
            {/* Employee Selection */}
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

            {/* Category */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cat.color || '#3B82F6' }}
                        />
                        {cat.name} ({cat.weightage}%)
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* KRA & KPI Names */}
            <div className="grid grid-cols-1 gap-4">
              {/* KRA Name - Combobox or Custom Input */}
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
                        {kraName || (categoryId ? "Select KRA name..." : "Select a category first")}
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
                                <Check className={cn("mr-2 h-4 w-4", kraName === name ? "opacity-100" : "opacity-0")} />
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

              {/* KPI Name - Combobox or Custom Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">KPI Name *</Label>
                {isCustomKpi ? (
                  <div className="flex gap-2">
                    <Textarea
                      value={kpiName}
                      onChange={(e) => setKpiName(e.target.value)}
                      placeholder="Enter custom KPI name"
                      rows={2}
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
                        className="w-full justify-between font-normal h-auto min-h-10 whitespace-normal text-left"
                        disabled={!kraName || isCustomKra}
                      >
                        {kpiName || (kraName ? "Select KPI name..." : "Select a KRA first")}
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
              </div>
            </div>

            <Separator />

            {/* UOM Type Selector */}
            <UomTypeSelector value={uomType} onChange={setUomType} />

            {/* Conditional Fields based on UOM Type */}
            {uomType === 'numeric' && (
              <>
                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Frequency</Label>
                    <Select value={frequency} onValueChange={(v) => { setFrequency(v); setFrequencyCycleStart(''); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Daily">Daily</SelectItem>
                        <SelectItem value="Weekly">Weekly</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                        <SelectItem value="Bi-Monthly">Bi-Monthly</SelectItem>
                        <SelectItem value="Quarterly">Quarterly</SelectItem>
                        <SelectItem value="Half-Yearly">Half-Yearly</SelectItem>
                        <SelectItem value="Yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {MULTI_MONTH_FREQUENCIES.includes(frequency) && (() => {
                    const cycleOptions = getCycleOptionsForFrequency(frequency);
                    if (!cycleOptions) return null;
                    return (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Cycle Start</Label>
                        <Select value={frequencyCycleStart} onValueChange={setFrequencyCycleStart}>
                          <SelectTrigger>
                            <SelectValue placeholder="(Use system default)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="system_default">(Use system default)</SelectItem>
                            {cycleOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Override the global cycle start for this KPI
                        </p>
                      </div>
                    );
                  })()}
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
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Source of Data</Label>
                    <Input
                      value={sourceOfData}
                      onChange={(e) => setSourceOfData(e.target.value)}
                      placeholder="e.g., CRM, ERP"
                    />
                  </div>
                </div>

                <Separator />

                {/* Threshold Mode Selector */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Threshold Mode</Label>
                  <Select value={thresholdMode} onValueChange={(v: 'absolute' | 'ratio') => setThresholdMode(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="absolute">
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Absolute (Recommended)</span>
                          <span className="text-xs text-muted-foreground">Thresholds are actual values (e.g., R5 = 100 means achieved ≥ 100)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="ratio">
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Ratio / Percentage</span>
                          <span className="text-xs text-muted-foreground">Thresholds are % of target (e.g., R5 = 100% means achieved ≥ target)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Rating Thresholds */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Rating Thresholds (R1-R5)</Label>
                  <p className="text-xs text-muted-foreground">
                    {thresholdMode === 'absolute' 
                      ? 'Enter actual values (e.g., 100, 95, 90). Achieved value is compared directly.' 
                      : 'Enter percentages of target (e.g., 100%, 95%, 90%). Achieved/Target ratio is compared.'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-600">R5 (Exceptional)</Label>
                      <Input
                        value={r5}
                        onChange={(e) => setR5(e.target.value)}
                        placeholder="e.g., ≥110%"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-green-600">R4 (Exceeds)</Label>
                      <Input
                        value={r4}
                        onChange={(e) => setR4(e.target.value)}
                        placeholder="e.g., ≥100%"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-yellow-600">R3 (Meets)</Label>
                      <Input
                        value={r3}
                        onChange={(e) => setR3(e.target.value)}
                        placeholder="e.g., ≥90%"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-orange-600">R2 (Below)</Label>
                      <Input
                        value={r2}
                        onChange={(e) => setR2(e.target.value)}
                        placeholder="e.g., ≥75%"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-red-600">R1 (Needs Improvement)</Label>
                      <Input
                        value={r1}
                        onChange={(e) => setR1(e.target.value)}
                        placeholder="e.g., <75%"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">R0 (Not Applicable)</Label>
                      <Input
                        value={r0}
                        onChange={(e) => setR0(e.target.value)}
                        placeholder="Optional"
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {uomType === 'binary' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <Label className="text-sm font-medium mb-2 block">Binary Scoring</Label>
                  <div className="flex gap-4">
                    <Badge className="bg-blue-500 text-white">Yes = R5 (5)</Badge>
                    <Badge className="bg-red-500 text-white">No = R0 (0)</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Fixed scoring: Yes achieves maximum rating, No achieves minimum rating.
                  </p>
                </div>
              </div>
            )}

            {uomType === 'tiered' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                <TieredOptionsBuilder
                  options={qualitativeOptions}
                  onChange={setQualitativeOptions}
                />
              </div>
            )}

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
                  checked={requireResubmitReason}
                  onCheckedChange={setRequireResubmitReason}
                />
              </div>
            </div>

            <Separator />

            {/* Review Period */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Review Period</Label>
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
                <Label className="text-sm font-medium">Review Year</Label>
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
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
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
