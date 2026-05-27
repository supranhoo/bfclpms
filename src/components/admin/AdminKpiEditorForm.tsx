import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useKraCategories, useProfiles } from '@/hooks/useOrganization';
import { useAdminUpdateKpi, ReviewStatus, KPI } from '@/hooks/useKpis';
import { Loader2, Building2, Info, Copy, ChevronDown, AlertTriangle, Users } from 'lucide-react';
import { UomTypeSelector } from '@/components/admin/UomTypeSelector';
import { TieredOptionsBuilder } from '@/components/admin/TieredOptionsBuilder';
import { RegistryBadge } from '@/components/admin/kpi-standardization/RegistryBadge';
import { EmployeeCombobox, EmployeeOption } from '@/components/admin/EmployeeCombobox';
import { fetchAllPaged } from '@/lib/fetchAll';
import { formatKpiInsertError } from '@/lib/kpiErrorUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UomType, QualitativeOption, validateQualitativeOptions, BINARY_OPTIONS, BINARY_OPTIONS_INVERTED, isBinaryInverted } from '@/lib/qualitativeUom';
import { UOM_OPTIONS } from '@/lib/uomConstants';
import { getCycleOptionsForFrequency, MULTI_MONTH_FREQUENCIES } from '@/lib/frequencyCycleOptions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

type ApplyScope = 'this_month' | 'future_months' | 'all_months';

export interface AdminKpiEditorFormProps {
  kpi: KPI | null;
  onSaved: () => void;
  onCancel: () => void;
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

const FISCAL_MONTHS = [
  'July', 'August', 'September', 'October', 'November', 'December',
  'January', 'February', 'March', 'April', 'May', 'June'
];

const getFiscalStartYear = (month: string, year: number) => {
  const calIndex = MONTHS.indexOf(month);
  return calIndex >= 6 ? year : year - 1;
};

const getFiscalLabel = (month: string, year: number) => {
  const startYear = getFiscalStartYear(month, year);
  return `${startYear}-${String(startYear + 1).slice(2)}`;
};

/* ── tiny section header ── */
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-3 border-t border-border">
    {children}
  </p>
);

export function AdminKpiEditorForm({ kpi, onSaved, onCancel }: AdminKpiEditorFormProps) {
  const { data: categories } = useKraCategories();
  const { data: profiles } = useProfiles();
  const updateKpi = useAdminUpdateKpi();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Copy to months state
  const [copyToMonthsOpen, setCopyToMonthsOpen] = useState(false);
  const [selectedCopyMonths, setSelectedCopyMonths] = useState<Set<string>>(new Set());
  const [existingSiblingKeys, setExistingSiblingKeys] = useState<Set<string>>(new Set());
  const [loadingSiblings, setLoadingSiblings] = useState(false);
  const [copying, setCopying] = useState(false);

  // Copy to other employees state
  const [copyToEmployeesOpen, setCopyToEmployeesOpen] = useState(false);
  const [employeesForCopy, setEmployeesForCopy] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [copyTargetEmployeeIds, setCopyTargetEmployeeIds] = useState<string[]>([]);
  const [copyTargetExistingKeys, setCopyTargetExistingKeys] = useState<Map<string, Set<string>>>(new Map());
  const [copyingToEmployees, setCopyingToEmployees] = useState(false);

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
      setCopyToMonthsOpen(false);
      setSelectedCopyMonths(new Set());
      setExistingSiblingKeys(new Set());
      setCopyToEmployeesOpen(false);
      setCopyTargetEmployeeIds([]);
      setCopyTargetExistingKeys(new Map());
    }
  }, [kpi]);

  // Fetch existing siblings when copy section is opened
  useEffect(() => {
    if (!copyToMonthsOpen || !kpi?.review_year || !kpi?.review_period) return;
    const fetchSiblings = async () => {
      setLoadingSiblings(true);
      const fiscalStartYear = getFiscalStartYear(kpi.review_period!, kpi.review_year!);
      const fiscalYears = [fiscalStartYear, fiscalStartYear + 1];
      const { data } = await supabase
        .from('kpis')
        .select('review_period, review_year')
        .eq('employee_id', kpi.employee_id)
        .eq('kra_name', kpi.kra_name)
        .eq('kpi_name', kpi.kpi_name)
        .in('review_year', fiscalYears);
      const keys = new Set((data || []).map(d => `${d.review_period}-${d.review_year}`));
      setExistingSiblingKeys(keys);
      setLoadingSiblings(false);
    };
    fetchSiblings();
  }, [copyToMonthsOpen, kpi]);

  // Lazy-load full active employee roster the first time the section opens
  useEffect(() => {
    if (!copyToEmployeesOpen || employeesForCopy.length > 0) return;
    const loadEmployees = async () => {
      setLoadingEmployees(true);
      try {
        const data = await fetchAllPaged<any>((from, to) =>
          supabase
            .from('profiles')
            .select('id, full_name, employee_code, departments:department_id(name)')
            .eq('is_active', true)
            .order('full_name')
            .range(from, to)
        );
        setEmployeesForCopy(
          (data || []).map((e: any) => ({
            id: e.id,
            name: e.full_name || e.id,
            code: e.employee_code || '',
            department: e.departments?.name || '',
          }))
        );
      } finally {
        setLoadingEmployees(false);
      }
    };
    loadEmployees();
  }, [copyToEmployeesOpen, employeesForCopy.length]);

  // Fetch existing same-KPI rows for target employees in the same period/year
  useEffect(() => {
    if (copyTargetEmployeeIds.length === 0 || !kpi) {
      setCopyTargetExistingKeys(new Map());
      return;
    }
    const fetchTargets = async () => {
      const { data } = await supabase
        .from('kpis')
        .select('employee_id, kra_name, kpi_name')
        .in('employee_id', copyTargetEmployeeIds)
        .eq('review_period', formData.review_period)
        .eq('review_year', formData.review_year ? parseInt(formData.review_year) : -1)
        .eq('kra_name', formData.kra_name)
        .eq('kpi_name', formData.kpi_name);
      const map = new Map<string, Set<string>>();
      (data || []).forEach((r) => {
        const key = `${r.kra_name}|||${r.kpi_name}`;
        if (!map.has(r.employee_id)) map.set(r.employee_id, new Set());
        map.get(r.employee_id)!.add(key);
      });
      setCopyTargetExistingKeys(map);
    };
    fetchTargets();
  }, [copyTargetEmployeeIds, kpi, formData.review_period, formData.review_year, formData.kra_name, formData.kpi_name]);

  // Validation for tiered options
  const tieredValidationError = formData.uom_type === 'tiered' 
    ? validateQualitativeOptions(formData.qualitative_options) 
    : null;

  const handleSubmit = async () => {
    if (!kpi) return;
    
    const statusChanged = formData.status !== originalStatus;
    if (statusChanged && !reason.trim()) return;
    if (formData.uom_type === 'tiered' && tieredValidationError) return;

    const structuralFields = {
      kra_name: formData.kra_name,
      kpi_name: formData.kpi_name,
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
      qualitative_options: formData.uom_type === 'tiered' ? formData.qualitative_options 
        : formData.uom_type === 'binary' ? formData.qualitative_options : null,
      require_resubmit_reason: formData.require_resubmit_reason,
      day_count_type: formData.frequency === 'Daily' ? formData.day_count_type : null,
      threshold_mode: formData.uom_type === 'numeric' ? formData.threshold_mode : null,
    };

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

    if (applyScope !== 'this_month' && kpi.review_year && kpi.review_period) {
      try {
        const fiscalStartYear = getFiscalStartYear(kpi.review_period, kpi.review_year);
        const fiscalYears = [fiscalStartYear, fiscalStartYear + 1];
        const currentMonthIndex = MONTHS.indexOf(kpi.review_period);
        
        let query = supabase
          .from('kpis')
          .select('id, review_period, review_year')
          .eq('employee_id', kpi.employee_id)
          .eq('kra_name', kpi.kra_name)
          .eq('kpi_name', kpi.kpi_name)
          .in('review_year', fiscalYears)
          .neq('id', kpi.id);

        const { data: siblings, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        const filteredSiblings = (siblings || []).filter(s => {
          if (!s.review_period) return false;
          if (MONTHS.indexOf(s.review_period) === -1) return false;
          if (applyScope === 'future_months') {
            if (s.review_year! > kpi.review_year!) return true;
            if (s.review_year! < kpi.review_year!) return false;
            return MONTHS.indexOf(s.review_period) > currentMonthIndex;
          }
          return true;
        });

        if (filteredSiblings.length > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          
          for (const sibling of filteredSiblings) {
            const { error: updateError } = await supabase
              .from('kpis')
              .update({ ...(structuralFields as any), updated_at: new Date().toISOString() })
              .eq('id', sibling.id);

            if (updateError) {
              console.error(`Failed to update sibling KPI ${sibling.id}:`, updateError);
              continue;
            }

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

    onSaved();
  };

  const handleCopyToMonths = async () => {
    if (!kpi || selectedCopyMonths.size === 0) return;
    setCopying(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let created = 0;

      for (const key of selectedCopyMonths) {
        const [month, yearStr] = key.split('-');
        const year = parseInt(yearStr);

        const insertPayload = {
          employee_id: formData.employee_id,
          category_id: formData.category_id,
          kra_name: formData.kra_name,
          kpi_name: formData.kpi_name,
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
          qualitative_options: formData.uom_type === 'tiered' ? formData.qualitative_options 
            : formData.uom_type === 'binary' ? formData.qualitative_options : null,
          require_resubmit_reason: formData.require_resubmit_reason,
          day_count_type: formData.frequency === 'Daily' ? formData.day_count_type : null,
          threshold_mode: formData.uom_type === 'numeric' ? formData.threshold_mode : null,
          review_period: month,
          review_year: year,
          status: 'kra_set' as const,
        };

        const { error } = await supabase.from('kpis').insert(insertPayload as any);
        if (error) {
          console.error(`Failed to copy KPI to ${month} ${year}:`, error);
          continue;
        }
        created++;

        if (authUser) {
          await supabase.from('kpi_audit_logs').insert({
            kpi_id: kpi.id,
            performed_by: authUser.id,
            action: 'admin_copy_to_month',
            new_value: { review_period: month, review_year: year } as any,
            metadata: {
              source: 'admin_copy_to_month',
              target_month: month,
              target_year: year,
            },
          });
        }

        await supabase.from('review_periods').upsert(
          { period_name: month, review_year: year, is_locked: false },
          { onConflict: 'period_name,review_year' }
        );
      }

      if (created > 0) {
        toast.success(`KPI copied to ${created} month(s)`);
        queryClient.invalidateQueries({ queryKey: ['admin-kpis'] });
        queryClient.invalidateQueries({ queryKey: ['kpis'] });
        setCopyToMonthsOpen(false);
        setSelectedCopyMonths(new Set());
      } else {
        toast.error('Failed to copy KPI to any month. Duplicates may already exist.');
      }
    } catch (err) {
      console.error('Copy to months failed:', err);
      toast.error('Failed to copy KPI');
    } finally {
      setCopying(false);
    }
  };

  const buildKpiPayload = (overrides: { employee_id: string; review_period: string; review_year: number }) => ({
    employee_id: overrides.employee_id,
    category_id: formData.category_id,
    kra_name: formData.kra_name,
    kpi_name: formData.kpi_name,
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
    qualitative_options: formData.uom_type === 'tiered' ? formData.qualitative_options
      : formData.uom_type === 'binary' ? formData.qualitative_options : null,
    require_resubmit_reason: formData.require_resubmit_reason,
    day_count_type: formData.frequency === 'Daily' ? formData.day_count_type : null,
    threshold_mode: formData.uom_type === 'numeric' ? formData.threshold_mode : null,
    review_period: overrides.review_period,
    review_year: overrides.review_year,
    status: 'kra_set' as const,
  });

  const copyTargetDuplicateCounts: Record<string, number> = (() => {
    const counts: Record<string, number> = {};
    const compositeKey = `${formData.kra_name}|||${formData.kpi_name}`;
    copyTargetEmployeeIds.forEach((empId) => {
      counts[empId] = copyTargetExistingKeys.get(empId)?.has(compositeKey) ? 1 : 0;
    });
    return counts;
  })();

  const totalCopyDuplicates = Object.values(copyTargetDuplicateCounts).reduce((a, b) => a + b, 0);
  const totalCopyTargets = copyTargetEmployeeIds.length - totalCopyDuplicates;

  const handleCopyToEmployees = async () => {
    if (!kpi || copyTargetEmployeeIds.length === 0) return;
    if (!formData.review_period || !formData.review_year) {
      toast.error('Source KPI must have a review period and year.');
      return;
    }
    setCopyingToEmployees(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const targetYear = parseInt(formData.review_year);
      const compositeKey = `${formData.kra_name}|||${formData.kpi_name}`;

      const rowsToInsert: any[] = [];
      copyTargetEmployeeIds.forEach((empId) => {
        if (copyTargetExistingKeys.get(empId)?.has(compositeKey)) return; // skip duplicate
        rowsToInsert.push(buildKpiPayload({
          employee_id: empId,
          review_period: formData.review_period,
          review_year: targetYear,
        }));
      });

      if (rowsToInsert.length === 0) {
        toast.error('All selected employees already have this KPI for the period.');
        return;
      }

      const { data: inserted, error } = await supabase
        .from('kpis')
        .insert(rowsToInsert)
        .select('id, employee_id');
      if (error) throw error;

      // Org KPI value placeholders for employee-scoped org KPIs (parity with CopyKrasDialog)
      if (formData.is_org_level && formData.org_level_scope === 'employee') {
        const orgRows = rowsToInsert.map((r) => ({
          category_id: r.category_id,
          kra_name: r.kra_name,
          kpi_name: r.kpi_name,
          review_period: r.review_period,
          review_year: r.review_year,
          employee_id: r.employee_id,
          target_value: r.target_value,
          uom_type: r.uom_type,
          criteria: r.criteria,
          qualitative_options: r.qualitative_options,
          r0: r.r0, r1: r.r1, r2: r.r2, r3: r.r3, r4: r.r4, r5: r.r5,
          status: 'entered',
        }));
        const { error: okvErr } = await supabase
          .from('org_kpi_values')
          .upsert(orgRows, { onConflict: 'category_id,kra_name,kpi_name,review_period,review_year,employee_id', ignoreDuplicates: true });
        if (okvErr) console.warn('Failed to create org_kpi_values placeholders:', okvErr.message);
      }

      // Audit logs
      if (authUser && inserted) {
        const auditRows = inserted.map((row) => ({
          kpi_id: row.id,
          performed_by: authUser.id,
          action: 'admin_copy_to_employee',
          new_value: { employee_id: row.employee_id, review_period: formData.review_period, review_year: targetYear } as any,
          metadata: {
            source: 'admin_copy_to_employee',
            source_kpi_id: kpi.id,
            target_employee_id: row.employee_id,
          },
        }));
        if (auditRows.length > 0) await supabase.from('kpi_audit_logs').insert(auditRows);
      }

      queryClient.invalidateQueries({ queryKey: ['admin-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis-with-employees'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-full-mapping'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period-ranges'] });

      const skipped = copyTargetEmployeeIds.length - rowsToInsert.length;
      toast.success(
        `KPI copied to ${rowsToInsert.length} employee(s)${skipped > 0 ? ` · ${skipped} skipped (duplicate)` : ''}`
      );
      setCopyToEmployeesOpen(false);
      setCopyTargetEmployeeIds([]);
      setCopyTargetExistingKeys(new Map());
    } catch (err: any) {
      console.error('Copy to employees failed:', err);
      toast.error(formatKpiInsertError(err) || 'Failed to copy KPI to employees');
    } finally {
      setCopyingToEmployees(false);
    }
  };

  if (!kpi) return null;

  return (
    <div className="space-y-4">
      {/* ═══ IDENTITY ═══ */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Employee</Label>
          <Select
            value={formData.employee_id}
            onValueChange={(value) => setFormData(prev => ({ ...prev, employee_id: value }))}
          >
            <SelectTrigger className="h-9">
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
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select
            value={formData.category_id}
            onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
          >
            <SelectTrigger className="h-9">
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">KRA Name</Label>
          <Input
            className="h-9"
            value={formData.kra_name}
            onChange={(e) => setFormData(prev => ({ ...prev, kra_name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Source of Data</Label>
          <Input
            className="h-9"
            value={formData.source_of_data}
            onChange={(e) => setFormData(prev => ({ ...prev, source_of_data: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">KPI Name</Label>
          <RegistryBadge
            categoryId={formData.category_id}
            kraName={formData.kra_name}
            kpiName={formData.kpi_name}
            reviewPeriod={kpi?.review_period ?? null}
            reviewYear={kpi?.review_year ?? null}
          />
        </div>
        <Textarea
          value={formData.kpi_name}
          onChange={(e) => setFormData(prev => ({ ...prev, kpi_name: e.target.value }))}
          rows={3}
          className="min-h-[80px] resize-y"
        />
      </div>

      {/* ═══ MEASUREMENT ═══ */}
      <SectionHeader>Measurement</SectionHeader>

      <UomTypeSelector
        value={formData.uom_type}
        onChange={(type) => setFormData(prev => ({ ...prev, uom_type: type }))}
      />

      {/* Numeric: Target / UOM / Weightage */}
      {formData.uom_type === 'numeric' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Target Value</Label>
            <Input
              className="h-9"
              type="number"
              value={formData.target_value}
              onChange={(e) => setFormData(prev => ({ ...prev, target_value: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">UOM</Label>
            <Select
              value={formData.uom}
              onValueChange={(value) => setFormData(prev => ({ ...prev, uom: value }))}
            >
              <SelectTrigger className="h-9">
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
          <div className="space-y-1.5">
            <Label className="text-xs">Weightage (%)</Label>
            <Input
              className="h-9"
              type="number"
              value={formData.weightage}
              onChange={(e) => setFormData(prev => ({ ...prev, weightage: e.target.value }))}
            />
          </div>
        </div>
      )}

      {/* Non-numeric: Weightage + Frequency (+ Cycle Start) */}
      {formData.uom_type !== 'numeric' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Weightage (%)</Label>
            <Input
              className="h-9"
              type="number"
              value={formData.weightage}
              onChange={(e) => setFormData(prev => ({ ...prev, weightage: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Frequency</Label>
            <Select
              value={formData.frequency}
              onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value, frequency_cycle_start: '' }))}
            >
              <SelectTrigger className="h-9">
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
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Cycle Start</Label>
                <Select
                  value={formData.frequency_cycle_start}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, frequency_cycle_start: value }))}
                >
                  <SelectTrigger className="h-9">
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

      {/* Numeric: Frequency / Criteria / Cycle Start */}
      {formData.uom_type === 'numeric' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Frequency</Label>
            <Select
              value={formData.frequency}
              onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value, frequency_cycle_start: '' }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Criteria</Label>
            <Select
              value={formData.criteria}
              onValueChange={(value) => setFormData(prev => ({ ...prev, criteria: value }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select criteria" />
              </SelectTrigger>
              <SelectContent>
                {CRITERIA_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {MULTI_MONTH_FREQUENCIES.includes(formData.frequency) ? (() => {
            const cycleOptions = getCycleOptionsForFrequency(formData.frequency);
            if (!cycleOptions) return <div />;
            return (
              <div className="space-y-1.5">
                <Label className="text-xs">Cycle Start</Label>
                <Select
                  value={formData.frequency_cycle_start}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, frequency_cycle_start: value }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Default" />
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
          })() : <div />}
        </div>
      )}

      {/* Day Count Type — inline when Daily */}
      {formData.frequency === 'Daily' && (
        <div className="flex items-center gap-3">
          <Label className="text-xs whitespace-nowrap">Day Count</Label>
          <Select
            value={formData.day_count_type}
            onValueChange={(value: 'working_days' | 'all_days') => setFormData(prev => ({ ...prev, day_count_type: value }))}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="working_days">Working Days Only</SelectItem>
              <SelectItem value="all_days">All Calendar Days</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {formData.day_count_type === 'working_days' ? 'Employee-specific working days' : 'All calendar days'}
          </span>
        </div>
      )}

      {/* Tiered Options Builder */}
      {formData.uom_type === 'tiered' && (
        <div className="space-y-1.5">
          <TieredOptionsBuilder
            options={formData.qualitative_options}
            onChange={(options) => setFormData(prev => ({ ...prev, qualitative_options: options }))}
          />
          {tieredValidationError && (
            <p className="text-sm text-destructive">{tieredValidationError}</p>
          )}
        </div>
      )}

      {/* Binary polarity — compact */}
      {formData.uom_type === 'binary' && (
        <div className="flex items-center justify-between gap-3 p-3 border rounded-md bg-muted/30">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">Binary Polarity</Label>
            <p className="text-xs text-muted-foreground">Safety KPIs: "No" should score highest</p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={isBinaryInverted(formData.qualitative_options) ? 'inverted' : 'standard'}
              onValueChange={(val) => {
                setFormData(prev => ({
                  ...prev,
                  qualitative_options: val === 'inverted' ? BINARY_OPTIONS_INVERTED : BINARY_OPTIONS,
                }));
              }}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (Yes=5)</SelectItem>
                <SelectItem value="inverted">Inverted (No=5)</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 text-xs font-medium">
              {isBinaryInverted(formData.qualitative_options) ? (
                <>
                  <span className="text-destructive">Yes=R0</span>
                  <span className="text-primary">No=R5</span>
                </>
              ) : (
                <>
                  <span className="text-primary">Yes=R5</span>
                  <span className="text-destructive">No=R0</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rating Thresholds — numeric only */}
      {formData.uom_type === 'numeric' && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Label className="text-xs whitespace-nowrap">Threshold Mode</Label>
            <Select
              value={formData.threshold_mode}
              onValueChange={(value: 'absolute' | 'ratio') => setFormData(prev => ({ ...prev, threshold_mode: value }))}
            >
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="absolute">Absolute (Recommended)</SelectItem>
                <SelectItem value="ratio">Ratio / Percentage</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {formData.threshold_mode === 'absolute' ? 'Actual values' : '% of target'}
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {(['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const).map((field) => (
              <div key={field} className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground font-semibold">{field}</Label>
                <Input
                  className="h-8 text-xs"
                  value={formData[field]}
                  onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                  placeholder={formData.threshold_mode === 'absolute' ? '100' : '100%'}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SETTINGS ═══ */}
      <SectionHeader>Settings</SectionHeader>

      {/* Org-Level toggle — inline */}
      <div className="flex items-center justify-between gap-3 p-3 border rounded-md bg-muted/30">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">Organization-Level KPI</Label>
            <p className="text-[11px] text-muted-foreground">Centrally managed via Org KPI Data Entry</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {formData.is_org_level && (
            <Select
              value={formData.org_level_scope}
              onValueChange={(value: 'organization' | 'department' | 'employee') => 
                setFormData(prev => ({ ...prev, org_level_scope: value }))
              }
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Switch
            checked={formData.is_org_level}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_org_level: checked }))}
          />
        </div>
      </div>

      {/* Resubmission — inline */}
      <div className="flex items-center justify-between gap-3 p-3 border rounded-md bg-muted/30">
        <div className="space-y-0.5">
          <Label className="text-xs font-medium">Require Reason for Resubmission</Label>
          <p className="text-[11px] text-muted-foreground">Mandatory reason when editing previously submitted entries</p>
        </div>
        <Switch
          checked={formData.require_resubmit_reason}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, require_resubmit_reason: checked }))}
        />
      </div>

      {/* ═══ PERIOD & STATUS ═══ */}
      <SectionHeader>Period & Status</SectionHeader>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Review Period</Label>
          <Select
            value={formData.review_period}
            onValueChange={(value) => setFormData(prev => ({ ...prev, review_period: value }))}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map(month => (
                <SelectItem key={month} value={month}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Review Year</Label>
          <Input
            className="h-9"
            type="number"
            value={formData.review_year}
            onChange={(e) => setFormData(prev => ({ ...prev, review_year: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as ReviewStatus }))}
          >
            <SelectTrigger className="h-9">
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

      {/* Apply Scope — horizontal inline pills */}
      <div className="p-3 border rounded-md bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-3.5 w-3.5 text-primary" />
          <Label className="text-xs font-medium">Apply Changes To</Label>
        </div>
        <RadioGroup
          value={applyScope}
          onValueChange={(value) => setApplyScope(value as ApplyScope)}
          className="flex flex-wrap gap-3"
        >
          <label className="flex items-center gap-1.5 cursor-pointer">
            <RadioGroupItem value="this_month" id="scope_this" />
            <span className="text-xs">This month only</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <RadioGroupItem value="future_months" id="scope_future" />
            <span className="text-xs">This + future months</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <RadioGroupItem value="all_months" id="scope_all" />
            <span className="text-xs">All months ({kpi?.review_period && kpi?.review_year ? getFiscalLabel(kpi.review_period, kpi.review_year) : 'FY'})</span>
          </label>
        </RadioGroup>
        {applyScope !== 'this_month' && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Structural fields applied to sibling KPIs. Status & achieved values unchanged.
          </p>
        )}
      </div>

      {/* Copy to Other Months — collapsible */}
      {kpi?.review_year && kpi?.review_period && (
        <Collapsible open={copyToMonthsOpen} onOpenChange={setCopyToMonthsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between h-9" type="button">
              <span className="flex items-center gap-2 text-xs">
                <Copy className="h-3.5 w-3.5" />
                Copy KPI to Other Months
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${copyToMonthsOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="p-3 border rounded-md bg-muted/30 space-y-2">
              <p className="text-xs text-muted-foreground">
                Select months where this KPI doesn't exist yet. Created with status "KRA Set".
              </p>
              {loadingSiblings ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                    {(() => {
                      const fiscalStartYear = getFiscalStartYear(kpi.review_period!, kpi.review_year!);
                      return FISCAL_MONTHS.map(month => {
                        const year = MONTHS.indexOf(month) >= 6 ? fiscalStartYear : fiscalStartYear + 1;
                        const key = `${month}-${year}`;
                        const exists = existingSiblingKeys.has(key);
                        const isSelected = selectedCopyMonths.has(key);
                        return (
                          <label
                            key={key}
                            className={`flex items-center gap-1.5 p-1.5 rounded border text-xs cursor-pointer transition-colors ${
                              exists
                                ? 'bg-muted/50 text-muted-foreground cursor-not-allowed opacity-60'
                                : isSelected
                                ? 'bg-primary/10 border-primary/30'
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <Checkbox
                              checked={exists || isSelected}
                              disabled={exists}
                              onCheckedChange={(checked) => {
                                setSelectedCopyMonths(prev => {
                                  const next = new Set(prev);
                                  if (checked) next.add(key);
                                  else next.delete(key);
                                  return next;
                                });
                              }}
                              className="h-3.5 w-3.5"
                            />
                            <span className="truncate">{month.slice(0, 3)}</span>
                            {exists && <span className="text-[10px]">✓</span>}
                          </label>
                        );
                      });
                    })()}
                  </div>
                  {selectedCopyMonths.size > 0 && (
                    <Button
                      size="sm"
                      onClick={handleCopyToMonths}
                      disabled={copying}
                      className="h-8 text-xs"
                    >
                      {copying && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      Copy to {selectedCopyMonths.size} month(s)
                    </Button>
                  )}
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Reason */}
      <div className="space-y-1.5">
        <Label className="text-xs">
          Reason for Change {formData.status !== originalStatus && <span className="text-destructive">* (Required)</span>}
        </Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={formData.status !== originalStatus ? "Required: Explain status change..." : "Optional: Reason for change..."}
          rows={2}
          className={`min-h-[56px] ${formData.status !== originalStatus && !reason.trim() ? 'border-destructive' : ''}`}
        />
        {formData.status !== originalStatus && (
          <p className="text-[11px] text-muted-foreground">
            Notifications sent to employee and reporting manager on status change.
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-1 border-t border-border">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button 
          size="sm"
          onClick={handleSubmit} 
          disabled={updateKpi.isPending || (formData.status !== originalStatus && !reason.trim()) || (formData.uom_type === 'tiered' && !!tieredValidationError)}
        >
          {updateKpi.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
