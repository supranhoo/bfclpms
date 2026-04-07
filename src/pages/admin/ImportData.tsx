import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfiles, useKraCategories, useDepartments, useDivisions, useBusinessUnits, useDesignations } from '@/hooks/useOrganization';
import { useCompanies } from '@/hooks/useCompanies';
import { useCreateKpi } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { FileSpreadsheet, AlertCircle, CheckCircle2, Download, Users, Loader2, Trash2, Building2 } from 'lucide-react';
import OrgStructureImport from '@/components/admin/OrgStructureImport';
import ImportResultsSummary, { type ImportRowResult } from '@/components/admin/ImportResultsSummary';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { validateFileSize, IMPORT_LIMITS, sanitizeText, normalizeRole, VALID_ROLES } from '@/lib/importValidation';
import { scoreToRatingLevel } from '@/lib/reviewConstants';

interface BackgroundImportProgress {
  id: string;
  status: 'running' | 'completed' | 'failed';
  total_rows: number;
  processed_rows: number;
  kpis_imported: number;
  employees_created: number;
  categories_created: number;
  errors: string[];
  started_at: string;
  completed_at: string | null;
}

type RatingLevel = 'red' | 'yellow' | 'green' | 'blue';

// Map numeric rating (0-5) to rating level enum — uses canonical scoreToRatingLevel
const mapScoreToRating = (score: number | string | null | undefined): RatingLevel | null => {
  if (score === null || score === undefined || score === '') return null;
  const numScore = typeof score === 'string' ? parseFloat(score) : score;
  if (isNaN(numScore)) return null;
  return scoreToRatingLevel(Math.round(numScore));
};

// Determine KPI status based on review data
const determineKpiStatus = (row: KpiImportRow): 'open' | 'submitted' | 'approved_by_manager' | 'locked' => {
  if (row.auditRating != null || row.auditTargetAchieved != null) return 'locked';
  if (row.managerRating != null || row.managerTargetAchieved != null) return 'approved_by_manager';
  if (row.employeeRating != null || row.employeeTargetAchieved != null || row.targetAchieved != null) return 'submitted';
  return 'open';
};

// Determine review status based on review data (supports all 8 workflow stages)
const determineReviewStatus = (row: KpiImportRow): 'kra_set' | 'self_review' | 'manager_check' | 'skip_level_check' | 'hr_pms_review' | 'audit' | 'management_review' | 'approved' => {
  if (row.auditRating != null || row.auditTargetAchieved != null) return 'approved';
  if (row.managerRating != null || row.managerTargetAchieved != null) return 'audit';
  if (row.employeeRating != null || row.employeeTargetAchieved != null || row.targetAchieved != null) return 'manager_check';
  return 'kra_set';
};

import { QualitativeOption, TIERED_TEMPLATES } from '@/lib/qualitativeUom';

interface KpiImportRow {
  sNo?: number | string;
  month?: string;
  reviewStatus?: string;
  newCode: string;
  fullName: string;
  category: string;
  kra: string;
  kpi: string;
  target?: string | number;
  uom?: string;
  uomType?: string; // 'numeric' | 'binary' | 'tiered'
  qualitativeOptions?: QualitativeOption[] | string; // JSON string or parsed array
  frequency?: string;
  frequencyCycleStart?: string; // Cycle start override: 'Jan-Feb'/'Feb-Mar' (Bi-Monthly), 'Jan-Mar'/'Apr-Jun'/'Jul-Sep' (Quarterly), 'Jan-Jun'/'Apr-Sep'/'Jul-Dec' (Half-Yearly), 'Jan-Dec'/'Apr-Mar'/'Jul-Jun' (Yearly)
  kpiWeightage?: number;
  criteria?: string; // "Higher is Better" or "Lower is Better"
  // Rating thresholds
  r5?: string | number;
  r4?: string | number;
  r3?: string | number;
  r2?: string | number;
  r1?: string | number;
  r0?: string | number;
  // Achievement data
  targetAchieved?: string | number;
  achievedWeight?: string;
  rating?: number;
  kpiWeightageScore?: number;
  // Self review
  employeeTargetAchieved?: string | number;
  employeeRating?: number;
  employeeRemarks?: string;
  // Manager review
  managerTargetAchieved?: string | number;
  managerRating?: number;
  managerRemarks?: string;
  // Audit review
  auditTargetAchieved?: string | number;
  auditRating?: number;
  auditRemarks?: string;
  sourceOfData?: string;
  kpiStatus?: string;
  // Organization structure
  division?: string;
  businessUnit?: string;
  department?: string;
  subBranch?: string;
  // Special flags
  isOrgLevel?: boolean | string;
  // User reference
  refCode?: string;
}

interface EmployeeImportRow {
  employeeCode: string;
  fullName: string;
  email: string;
  designation?: string;
  companyCode?: string;
  division?: string;
  businessUnit?: string;
  department?: string;
  pmsGrade?: string;
  level?: string;
  managerEmployeeId?: string;
  managerName?: string;
  role?: string;
}

export default function ImportData() {
  const queryClient = useQueryClient();
  const { data: profiles, refetch: refetchProfiles } = useProfiles();
  const { data: categories, refetch: refetchCategories } = useKraCategories();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();
  const { data: departments } = useDepartments();
  const { data: designations } = useDesignations();
  const { data: companiesList } = useCompanies();
  const createKpi = useCreateKpi();
  const { toast } = useToast();

  // KPI Import State
  const [importData, setImportData] = useState<KpiImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(0);
  const [useBackgroundImport, setUseBackgroundImport] = useState(true);
  const [backgroundImportId, setBackgroundImportId] = useState<string | null>(null);
  const [backgroundProgress, setBackgroundProgress] = useState<BackgroundImportProgress | null>(null);
  
  // Real-time progress tracking (for foreground import)
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    kpisImported: 0,
    employeesCreated: 0,
    categoriesCreated: 0,
  });
  
  // Clear data state
  const [isClearing, setIsClearing] = useState(false);
  
  // Employee search in preview
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  
  // Export data state
  const [isExportingEmployees, setIsExportingEmployees] = useState(false);
  const [isExportingKpis, setIsExportingKpis] = useState(false);

  // Clear KPI data function
  const handleClearKpiData = async () => {
    setIsClearing(true);
    try {
      // Delete in order: review_submissions → kpis → performance_reviews → import_progress
      const { error: submissionsError } = await supabase
        .from('review_submissions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (submissionsError) throw submissionsError;

      const { error: kpisError } = await supabase
        .from('kpis')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (kpisError) throw kpisError;

      const { error: reviewsError } = await supabase
        .from('performance_reviews')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (reviewsError) throw reviewsError;

      const { error: progressError } = await supabase
        .from('import_progress')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (progressError) throw progressError;

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['performance-reviews'] });
      
      toast({
        title: 'Data Cleared',
        description: 'All KPI and review data has been deleted. You can now import fresh data.',
      });
      
      // Reset import state
      setImportData([]);
      setImportSuccess(0);
      setBackgroundImportId(null);
      setBackgroundProgress(null);
    } catch (error: any) {
      console.error('Error clearing data:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to clear data',
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
    }
  };

  // Subscribe to real-time updates for background import with polling fallback
  useEffect(() => {
    if (!backgroundImportId) return;

    let pollIntervalId: ReturnType<typeof setInterval> | null = null;

    // Shared function to update progress and handle completion
    const updateProgressState = (data: any): boolean => {
      const progress: BackgroundImportProgress = {
        id: data.id,
        status: data.status as 'running' | 'completed' | 'failed',
        total_rows: data.total_rows,
        processed_rows: data.processed_rows,
        kpis_imported: data.kpis_imported,
        employees_created: data.employees_created,
        categories_created: data.categories_created,
        errors: typeof data.errors === 'string' ? JSON.parse(data.errors) : (data.errors || []),
        started_at: data.started_at,
        completed_at: data.completed_at,
      };
      setBackgroundProgress(progress);

      if (progress.status === 'completed' || progress.status === 'failed') {
        // Refresh data when import completes
        queryClient.invalidateQueries({ queryKey: ['kpis'] });
        queryClient.invalidateQueries({ queryKey: ['kra-categories'] });
        queryClient.invalidateQueries({ queryKey: ['profiles'] });
        queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['divisions'] });
        queryClient.invalidateQueries({ queryKey: ['business-units'] });
        queryClient.invalidateQueries({ queryKey: ['departments'] });

        if (progress.status === 'completed') {
          setImportSuccess(progress.kpis_imported);
          toast({
            title: 'Import Complete',
            description: `Successfully imported ${progress.kpis_imported} KPIs, created ${progress.employees_created} employees and ${progress.categories_created} categories.`,
          });
        } else {
          toast({
            title: 'Import Failed',
            description: progress.errors?.[0] || 'An error occurred during import',
            variant: 'destructive',
          });
        }
        return true; // Signal completion
      }
      return false;
    };

    // Polling fetch function
    const fetchProgress = async (): Promise<boolean> => {
      const { data } = await supabase
        .from('import_progress')
        .select('*')
        .eq('id', backgroundImportId)
        .single();

      if (data) {
        return updateProgressState(data);
      }
      return false;
    };

    // Initial fetch
    fetchProgress();

    // Polling interval as fallback (every 2 seconds)
    // This ensures we catch completion even if realtime event is missed
    pollIntervalId = setInterval(async () => {
      const completed = await fetchProgress();
      if (completed && pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    }, 2000);

    // Subscribe to real-time updates (primary, faster for slow imports)
    const channel = supabase
      .channel(`import-progress-${backgroundImportId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'import_progress',
          filter: `id=eq.${backgroundImportId}`,
        },
        (payload) => {
          const completed = updateProgressState(payload.new);
          if (completed && pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
          }
        }
      )
      .subscribe();

    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
      }
      supabase.removeChannel(channel);
    };
  }, [backgroundImportId, queryClient, toast]);

  // Employee Import State
  const [employeeData, setEmployeeData] = useState<EmployeeImportRow[]>([]);
  const [employeeErrors, setEmployeeErrors] = useState<string[]>([]);
  const [isImportingEmployees, setIsImportingEmployees] = useState(false);
  const [employeeImportSuccess, setEmployeeImportSuccess] = useState(0);
  const [employeeImportProgress, setEmployeeImportProgress] = useState({ current: 0, total: 0 });
  const [employeeImportResults, setEmployeeImportResults] = useState<ImportRowResult[] | null>(null);
  const [kpiImportResults, setKpiImportResults] = useState<ImportRowResult[] | null>(null);
  const [allowUpdateExisting, setAllowUpdateExisting] = useState(false);
  const [employeeRowErrors, setEmployeeRowErrors] = useState<Map<number, string[]>>(new Map());

  // Normalize KPI row to handle different column name variations
  const normalizeKpiRow = (rawRow: Record<string, any>): KpiImportRow => {
    // Helper to find value from multiple possible column names (case-insensitive)
    const getValue = (possibleNames: string[]): any => {
      for (const name of possibleNames) {
        for (const key of Object.keys(rawRow)) {
          if (key.toLowerCase().replace(/[\s_-]/g, '') === name.toLowerCase().replace(/[\s_-]/g, '')) {
            return rawRow[key];
          }
        }
      }
      return undefined;
    };

    // Helper to parse percentage or number values - preserve original format for display
    const parseNumericValue = (value: any): string | number | undefined => {
      if (value === null || value === undefined || value === '') return undefined;
      return value; // Keep original value
    };

    // Helper to format R values - handle % and decimal formats
    // Excel stores percentages as decimals (100% = 1, 50% = 0.5)
    // But users might also enter raw numbers like "100" meaning 100%
    const formatRatingThreshold = (value: any, uom?: string): string | undefined => {
      if (value === null || value === undefined || value === '') return undefined;
      const strValue = String(value).trim();
      
      const isPercentageUom = uom === '%' || uom?.toLowerCase() === 'percentage';
      
      // For non-percentage UOMs (Days, Number, Hours, etc.), store as plain number
      if (!isPercentageUom) {
        // Strip any trailing % that shouldn't be there
        if (strValue.includes('%')) return strValue.replace('%', '').trim();
        return strValue;
      }
      
      // === Percentage UOM logic below ===
      
      // If it's already a percentage string, keep it as-is
      if (strValue.includes('%')) return strValue;
      
      const numValue = parseFloat(strValue);
      if (isNaN(numValue)) return strValue;
      
      // If value is between 0 and 1 (exclusive), treat as decimal percentage (Excel format)
      if (numValue > 0 && numValue <= 1) {
        const percentValue = numValue * 100;
        const formatted = percentValue % 1 === 0 ? percentValue.toFixed(0) : percentValue.toFixed(2).replace(/\.?0+$/, '');
        return `${formatted}%`;
      }
      
      // If value is > 1 and <= 100, treat as already a percentage value
      if (numValue > 1 && numValue <= 100) {
        const formatted = numValue % 1 === 0 ? numValue.toFixed(0) : numValue.toFixed(2).replace(/\.?0+$/, '');
        return `${formatted}%`;
      }
      
      // For values > 100, keep as-is
      return strValue;
    };

    // Build qualitative options from R5-R0 columns when uomType is binary/tiered
    const buildOptionsFromRColumns = (row: Record<string, any>): QualitativeOption[] | undefined => {
      const rColumns: { key: string; rating: number }[] = [
        { key: 'r5', rating: 5 },
        { key: 'r4', rating: 4 },
        { key: 'r3', rating: 3 },
        { key: 'r2', rating: 2 },
        { key: 'r1', rating: 1 },
        { key: 'r0', rating: 0 },
      ];

      const options: QualitativeOption[] = [];

      for (const { key, rating } of rColumns) {
        // Get value from possible column name variations
        const possibleNames = [key, key.toUpperCase(), `rating${rating}`];
        let value: any;
        for (const name of possibleNames) {
          for (const rowKey of Object.keys(row)) {
            if (rowKey.toLowerCase() === name.toLowerCase()) {
              value = row[rowKey];
              break;
            }
          }
          if (value !== undefined) break;
        }
        
        if (!value) continue;
        
        const strValue = String(value).trim();
        // Skip empty or pure numeric values (these are standard thresholds, not labels)
        if (!strValue || (!isNaN(Number(strValue)) && !strValue.includes('|'))) continue;
        
        // Check for extended syntax: "Label|Definition"
        if (strValue.includes('|')) {
          const [label, definition] = strValue.split('|').map(s => s.trim());
          if (label) {
            options.push({ label, rating, definition: definition || label });
          }
        } else {
          // Plain label - use label as definition
          options.push({ label: strValue, rating, definition: strValue });
        }
      }

      return options.length >= 2 ? options : undefined;
    };

    // Parse qualitative options - supports R-column format, template shorthand, or JSON
    const parseQualitativeOptions = (value: any, row: Record<string, any>, uomType: string): QualitativeOption[] | undefined => {
      // 1. For binary/tiered, check for auto-build flag or empty value
      if (uomType === 'binary' || uomType === 'tiered') {
        const flagValue = String(value || '').toLowerCase().trim();
        if (!value || flagValue === 'auto' || flagValue === 'true' || flagValue === 'tiered' || flagValue === 'binary' || flagValue === '') {
          const rOptions = buildOptionsFromRColumns(row);
          if (rOptions && rOptions.length >= 2) {
            return rOptions;
          }
        }
      }

      // 2. Check for template shorthand (e.g., "compliance_3", "yes_no")
      if (typeof value === 'string') {
        const templateKey = value.trim().toLowerCase().replace(/[- ]/g, '_');
        if (TIERED_TEMPLATES[templateKey]) {
          return TIERED_TEMPLATES[templateKey];
        }
      }

      // 3. Existing JSON array
      if (typeof value === 'object' && Array.isArray(value)) return value;
      
      // 4. JSON string parsing
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Not valid JSON, continue
        }
      }

      return undefined;
    };

    // Normalize UOM type
    const normalizeUomType = (value: any): string => {
      if (!value) return 'numeric';
      const normalized = String(value).toLowerCase().trim();
      if (normalized === 'binary' || normalized === 'yes/no' || normalized === 'yesno') return 'binary';
      if (normalized === 'tiered' || normalized === 'qualitative' || normalized === 'options') return 'tiered';
      return 'numeric';
    };

    const uomType = normalizeUomType(getValue(['uomType', 'uom_type', 'uomtype', 'measureType', 'measure_type']));

    return {
      sNo: getValue(['sNo', 'sno', 's_no', 'sr', 'srNo', 'serialNo', 'serial']),
      month: getValue(['month', 'reviewMonth', 'review_month', 'period']),
      reviewStatus: getValue(['reviewStatus', 'review_status', 'status']),
      newCode: String(getValue(['newCode', 'newcode', 'new_code', 'employeeCode', 'employee_code', 'empCode', 'code']) || ''),
      fullName: String(getValue(['fullName', 'full_name', 'name', 'employeeName', 'employee_name']) || ''),
      category: String(getValue(['category', 'kraCategory', 'kra_category', 'categoryName']) || ''),
      kra: String(getValue(['kra', 'kraName', 'kra_name', 'keyResultArea']) || ''),
      kpi: String(getValue(['kpi', 'kpiName', 'kpi_name', 'keyPerformanceIndicator']) || ''),
      target: parseNumericValue(getValue(['target', 'targetValue', 'target_value', 'targetVal'])),
      uom: getValue(['uom', 'unit', 'unitOfMeasure', 'unit_of_measure']),
      uomType,
      qualitativeOptions: parseQualitativeOptions(getValue(['qualitativeOptions', 'qualitative_options', 'tieredOptions', 'tiered_options', 'options']), rawRow, uomType),
      frequency: getValue(['frequency', 'freq', 'reviewFrequency']),
      kpiWeightage: getValue(['kpiWeightage', 'kpi_weightage', 'weightage', 'weight']),
      criteria: getValue(['criteria', 'scoringCriteria', 'scoring_criteria']),
      // Rating thresholds - format for display
      r5: formatRatingThreshold(getValue(['r5', 'R5', 'rating5', 'outstanding']), getValue(['uom', 'unit', 'unitOfMeasure', 'unit_of_measure'])),
      r4: formatRatingThreshold(getValue(['r4', 'R4', 'rating4', 'exceeds']), getValue(['uom', 'unit', 'unitOfMeasure', 'unit_of_measure'])),
      r3: formatRatingThreshold(getValue(['r3', 'R3', 'rating3', 'meets']), getValue(['uom', 'unit', 'unitOfMeasure', 'unit_of_measure'])),
      r2: formatRatingThreshold(getValue(['r2', 'R2', 'rating2', 'below']), getValue(['uom', 'unit', 'unitOfMeasure', 'unit_of_measure'])),
      r1: formatRatingThreshold(getValue(['r1', 'R1', 'rating1', 'poor']), getValue(['uom', 'unit', 'unitOfMeasure', 'unit_of_measure'])),
      r0: formatRatingThreshold(getValue(['r0', 'R0', 'rating0']), getValue(['uom', 'unit', 'unitOfMeasure', 'unit_of_measure'])),
      // Achievement data - key fix: look for "Achieved" column
      targetAchieved: parseNumericValue(getValue(['targetAchieved', 'target_achieved', 'achieved', 'achievedValue', 'achieved_value', 'actualValue', 'actual'])),
      achievedWeight: getValue(['achievedWeight', 'achieved_weight', 'achievedWt']),
      rating: getValue(['rating', 'selfRating', 'self_rating']),
      kpiWeightageScore: getValue(['kpiWeightageScore', 'kpi_weightage_score', 'weightageScore']),
      // Self review
      employeeTargetAchieved: parseNumericValue(getValue(['employeeTargetAchieved', 'employee_target_achieved', 'empAchieved', 'selfAchieved'])),
      employeeRating: getValue(['employeeRating', 'employee_rating', 'empRating', 'selfRating']),
      employeeRemarks: getValue(['employeeRemarks', 'employee_remarks', 'empRemarks', 'selfRemarks', 'Employee_Remarks', 'Self_Remarks']),
      // Manager review
      managerTargetAchieved: parseNumericValue(getValue(['managerTargetAchieved', 'manager_target_achieved', 'mgrAchieved'])),
      managerRating: getValue(['managerRating', 'manager_rating', 'mgrRating']),
      managerRemarks: getValue(['managerRemarks', 'manager_remarks', 'mgrRemarks', 'Manager_Remarks']),
      // Audit review
      auditTargetAchieved: parseNumericValue(getValue(['auditTargetAchieved', 'audit_target_achieved', 'auditorAchieved'])),
      auditRating: getValue(['auditRating', 'audit_rating', 'auditorRating']),
      auditRemarks: getValue(['auditRemarks', 'audit_remarks', 'auditorRemarks', 'Audit_Remarks', 'Auditor_Remarks', 'auditor_remarks', 'AuditorRemarks']),
      sourceOfData: getValue(['sourceOfData', 'source_of_data', 'dataSource', 'source']),
      kpiStatus: getValue(['kpiStatus', 'kpi_status']),
      // Organization structure
      division: getValue(['division', 'div', 'divisionName', 'division_name']),
      businessUnit: getValue(['businessUnit', 'business_unit', 'bu', 'businessUnitName', 'business_unit_name']),
      department: getValue(['department', 'dept', 'departmentName', 'department_name']),
      subBranch: getValue(['subBranch', 'sub_branch', 'subBranchName', 'sub_branch_name', 'branch']),
      // Special flags
      isOrgLevel: getValue(['isOrgLevel', 'is_org_level', 'orgLevel', 'org_level']),
      frequencyCycleStart: getValue(['frequencyCycleStart', 'frequency_cycle_start', 'cycleStart', 'cycle_start']),
      // User reference
      refCode: getValue(['refCode', 'ref_code', 'Ref_Code', 'referenceCode', 'reference_code']),
    };
  };
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    const fileSizeValidation = validateFileSize(file);
    if (!fileSizeValidation.valid) {
      toast({ title: 'File too large', description: fileSizeValidation.error, variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
        
        // Check row count limit
        if (rawData.length > IMPORT_LIMITS.MAX_ROWS) {
          toast({ 
            title: 'Too many rows', 
            description: `File contains ${rawData.length} rows, maximum allowed is ${IMPORT_LIMITS.MAX_ROWS}`, 
            variant: 'destructive' 
          });
          return;
        }
        
        // Normalize all rows to handle column name variations
        const jsonData = rawData.map(normalizeKpiRow);

        // Validate data with length limits
        const validationErrors: string[] = [];
        jsonData.forEach((row, index) => {
          if (!row.newCode && !row.fullName) {
            validationErrors.push(`Row ${index + 2}: Missing employee code or name`);
          }
          if (!row.category) {
            validationErrors.push(`Row ${index + 2}: Missing category`);
          }
          if (!row.kra) {
            validationErrors.push(`Row ${index + 2}: Missing KRA`);
          }
          if (!row.kpi) {
            validationErrors.push(`Row ${index + 2}: Missing KPI`);
          }
          // Add length validation
          if (row.kra && String(row.kra).length > IMPORT_LIMITS.MAX_STRING_LENGTH) {
            validationErrors.push(`Row ${index + 2}: KRA exceeds ${IMPORT_LIMITS.MAX_STRING_LENGTH} characters`);
          }
          if (row.kpi && String(row.kpi).length > IMPORT_LIMITS.MAX_STRING_LENGTH) {
            validationErrors.push(`Row ${index + 2}: KPI exceeds ${IMPORT_LIMITS.MAX_STRING_LENGTH} characters`);
          }
          // Validate weightage range
          if (row.kpiWeightage !== undefined && (row.kpiWeightage < 0 || row.kpiWeightage > 100)) {
            validationErrors.push(`Row ${index + 2}: Weightage must be between 0 and 100`);
          }
        });

        setErrors(validationErrors);
        setImportData(jsonData);
        setImportSuccess(0);
      } catch (error) {
        toast({ title: 'Failed to parse file', description: 'Please upload a valid Excel file', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast]);

  // Normalize employee row to handle different column name variations
  const normalizeEmployeeRow = (rawRow: Record<string, any>): EmployeeImportRow => {
    // Helper to find value from multiple possible column names (case-insensitive)
    const getValue = (possibleNames: string[]): string => {
      for (const name of possibleNames) {
        for (const key of Object.keys(rawRow)) {
          if (key.toLowerCase().replace(/[\s_-]/g, '') === name.toLowerCase().replace(/[\s_-]/g, '')) {
            return rawRow[key] ? String(rawRow[key]).trim() : '';
          }
        }
      }
      return '';
    };

    return {
      employeeCode: getValue(['employeeCode', 'employeecode', 'employee_code', 'empCode', 'empcode', 'emp_code', 'newCode', 'newcode', 'new_code', 'code', 'id', 'empId', 'empid', 'emp_id']),
      fullName: getValue(['fullName', 'fullname', 'full_name', 'name', 'employeeName', 'employeename', 'employee_name', 'empName', 'empname', 'emp_name']),
      email: getValue(['email', 'emailAddress', 'emailaddress', 'email_address', 'mail', 'emailId', 'emailid', 'email_id']),
      designation: getValue(['designation', 'title', 'position', 'jobTitle', 'jobtitle', 'job_title']),
      companyCode: getValue(['companyCode', 'companycode', 'company_code', 'company', 'companyName', 'companyname', 'company_name']),
      division: getValue(['division', 'div']),
      businessUnit: getValue(['businessUnit', 'businessunit', 'business_unit', 'bu', 'unit']),
      department: getValue(['department', 'dept', 'dep', 'departmentName', 'departmentname', 'department_name']),
      pmsGrade: getValue(['pmsGrade', 'pmsgrade', 'pms_grade', 'grade']),
      level: getValue(['level', 'employeeLevel', 'employee_level', 'lvl']),
      managerEmployeeId: getValue(['managerEmployeeId', 'manageremployeeid', 'manager_employee_id', 'managerId', 'managerid', 'manager_id', 'reportingTo', 'reportingto', 'reporting_to', 'reportsTo', 'reportsto', 'reports_to']),
      managerName: getValue(['managerName', 'managername', 'manager_name', 'reportingManager', 'reportingmanager', 'reporting_manager', 'supervisor']),
      role: getValue(['role', 'appRole', 'approle', 'app_role', 'userRole', 'userrole', 'user_role', 'systemRole', 'systemrole', 'system_role']),
    };
  };

  const handleEmployeeFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    const fileSizeValidation = validateFileSize(file);
    if (!fileSizeValidation.valid) {
      toast({ title: 'File too large', description: fileSizeValidation.error, variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
        
        // Check row count limit
        if (rawData.length > IMPORT_LIMITS.MAX_ROWS) {
          toast({ 
            title: 'Too many rows', 
            description: `File contains ${rawData.length} rows, maximum allowed is ${IMPORT_LIMITS.MAX_ROWS}`, 
            variant: 'destructive' 
          });
          return;
        }
        
        // Normalize all rows
        const jsonData = rawData.map(normalizeEmployeeRow);

        // Validate data - per-row error tagging for partial import
        const perRowErrors = new Map<number, string[]>();

        // Build lookup sets for entity validation (case-insensitive)
        const deptNames = new Set((departments || []).map(d => d.name.toLowerCase()));
        const divNames = new Set((divisions || []).map(d => d.name.toLowerCase()));
        const buNames = new Set((businessUnits || []).map(d => d.name.toLowerCase()));
        const desigNames = new Set((designations || []).map(d => d.name.toLowerCase()));
        const existingCodes = new Set((profiles || []).map(p => p.employee_code?.toLowerCase()).filter(Boolean));

        jsonData.forEach((row, index) => {
          const rowErrs: string[] = [];
          if (!row.employeeCode && !row.fullName) {
            rowErrs.push('Missing employee code and full name');
          }
          if (row.employeeCode && !allowUpdateExisting && existingCodes.has(row.employeeCode.toLowerCase())) {
            rowErrs.push(`Employee code '${row.employeeCode}' already exists in the system`);
          }
          if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            rowErrs.push('Invalid email format');
          }
          if (row.fullName && row.fullName.length > 200) {
            rowErrs.push('Full name exceeds 200 characters');
          }
          if (row.designation && row.designation.length > 100) {
            rowErrs.push('Designation exceeds 100 characters');
          }
          if (row.department && !deptNames.has(row.department.toLowerCase())) {
            rowErrs.push(`Department '${row.department}' does not exist in the system`);
          }
          if (row.division && !divNames.has(row.division.toLowerCase())) {
            rowErrs.push(`Division '${row.division}' does not exist in the system`);
          }
          if (row.businessUnit && !buNames.has(row.businessUnit.toLowerCase())) {
            rowErrs.push(`Business Unit '${row.businessUnit}' does not exist in the system`);
          }
          if (row.designation && !desigNames.has(row.designation.toLowerCase())) {
            rowErrs.push(`Designation '${row.designation}' does not exist in the system`);
          }
          if (rowErrs.length > 0) {
            perRowErrors.set(index, rowErrs);
          }
        });

        setEmployeeRowErrors(perRowErrors);
        setEmployeeErrors([]); // Clear legacy flat errors
        setEmployeeData(jsonData);
        setEmployeeImportSuccess(0);
      } catch (error) {
        toast({ title: 'Failed to parse file', description: 'Please upload a valid Excel file', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast, departments, divisions, businessUnits, designations, profiles, allowUpdateExisting]);

  const handleImport = async () => {
    if (importData.length === 0) return;

    // Background import mode - send to backend function
    if (useBackgroundImport) {
      setIsImporting(true);
      try {
        const { data, error } = await supabase.functions.invoke('import-kpis', {
          body: { importData },
        });

        if (error) {
          let message = error.message || 'Import failed';

          // Try to surface validation errors from the response body (400s)
          try {
            const body = await (error as any)?.context?.json?.();
            if (body?.validationErrors?.length) {
              setErrors(body.validationErrors);
              message = body.validationErrors[0];
            } else if (body?.error) {
              message = body.error;
            }
          } catch {
            // ignore
          }

          throw new Error(message);
        }

        const result = data as any;

        // Surface any pre-import validation errors as skipped rows
        if (result.skippedRows > 0 && result.validationErrors?.length > 0) {
          const skippedResults: ImportRowResult[] = result.validationErrors.map((errMsg: string) => {
            // Parse "Row N: field - message" format
            const rowMatch = errMsg.match(/^Row\s+(\d+):/);
            const rowNum = rowMatch ? parseInt(rowMatch[1], 10) + 1 : 0; // +1 for Excel header offset
            return {
              row: rowNum,
              employeeCode: '-',
              employeeName: '-',
              status: 'skipped' as const,
              message: errMsg,
            };
          });
          setKpiImportResults(skippedResults);
          toast({
            title: 'Import Started',
            description: `Processing ${result.totalRows} KPIs in background. ${result.skippedRows} row(s) skipped due to validation errors.`,
            variant: result.skippedRows > 0 ? 'destructive' : 'default',
          });
        } else {
          toast({
            title: 'Import Started',
            description: `Processing ${importData.length} KPIs in background. Progress will show below.`,
          });
        }

        // Set the import ID to start tracking progress
        setBackgroundImportId(result.importId);

        // Clear the import data preview
        setImportData([]);
      } catch (error: any) {
        toast({
          title: 'Import Failed',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setIsImporting(false);
      }
      return;
    }

    // Foreground import mode - existing logic
    setIsImporting(true);
    let successCount = 0;
    let categoriesCreated = 0;
    let employeesCreated = 0;
    const importErrors: string[] = [];
    const rowResults: ImportRowResult[] = [];

    // Initialize progress tracking
    setImportProgress({
      current: 0,
      total: importData.length,
      kpisImported: 0,
      employeesCreated: 0,
      categoriesCreated: 0,
    });

    // Cache for newly created categories during this import
    const categoryCache = new Map<string, string>();
    
    // Pre-populate cache with existing categories
    categories?.forEach(cat => {
      categoryCache.set(cat.name.toLowerCase(), cat.id);
    });

    // Generate random color for new categories
    const getRandomColor = () => {
      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
      return colors[Math.floor(Math.random() * colors.length)];
    };

    // Cache for auto-created employees during this import
    const employeeCache = new Map<string, { id: string }>();
    
    // Pre-populate cache with existing employees (code-only, no name fallback)
    profiles?.forEach(p => {
      if (p.employee_code) {
        employeeCache.set(p.employee_code.toLowerCase(), { id: p.id });
      }
    });

    // Get auth token for edge function calls
    const { data: sessionData } = await supabase.auth.getSession();
    const authToken = sessionData?.session?.access_token;

    for (let i = 0; i < importData.length; i++) {
      const row = importData[i];
      
      // Update progress
      setImportProgress(prev => ({
        ...prev,
        current: i + 1,
      }));
      
      try {
        // Find employee by code only (strict matching, no name fallback)
        let employee = profiles?.find(p => 
          p.employee_code && p.employee_code === String(row.newCode)
        );

        // If not found in original profiles, check cache (for newly created employees)
        if (!employee && row.newCode) {
          const cached = employeeCache.get(String(row.newCode).toLowerCase());
          if (cached) {
            employee = { id: cached.id } as any;
          }
        }

        // Auto-create employee if not found
        if (!employee && (row.newCode || row.fullName)) {
          try {
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                employee_code: String(row.newCode || ''),
                full_name: row.fullName || '',
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              importErrors.push(`Failed to create employee ${row.newCode} - ${row.fullName}: ${errorData.error}`);
              rowResults.push({ row: i + 2, employeeCode: String(row.newCode || ''), employeeName: row.fullName || '', status: 'failed', message: errorData.error || 'Failed to create employee' });
              continue;
            }

            const { profile: newProfile } = await response.json();
            employee = { id: newProfile.id } as any;
            
            // Add to cache for subsequent rows
            if (row.newCode) {
              employeeCache.set(String(row.newCode).toLowerCase(), { id: newProfile.id });
            }
            if (row.fullName) {
              employeeCache.set(row.fullName.toLowerCase(), { id: newProfile.id });
            }
            
            employeesCreated++;
            setImportProgress(prev => ({
              ...prev,
              employeesCreated: prev.employeesCreated + 1,
            }));
          } catch (createError: any) {
            importErrors.push(`Failed to create employee ${row.newCode} - ${row.fullName}: ${createError.message}`);
            rowResults.push({ row: i + 2, employeeCode: String(row.newCode || ''), employeeName: row.fullName || '', status: 'failed', message: createError.message });
            continue;
          }
        }
        
        if (!employee) {
          importErrors.push(`Employee not found and could not be created: ${row.newCode} - ${row.fullName}`);
          rowResults.push({ row: i + 2, employeeCode: String(row.newCode || ''), employeeName: row.fullName || '', status: 'failed', message: 'Employee not found and could not be created' });
          continue;
        }

        // Find category by name, or create it if it doesn't exist
        let categoryId = categoryCache.get(row.category?.toLowerCase());
        
        if (!categoryId && row.category) {
          // Create new category
          const { data: newCategory, error: categoryError } = await supabase
            .from('kra_categories')
            .insert({
              name: row.category,
              weightage: 0,
              color: getRandomColor(),
              description: `Auto-created from import`,
            })
            .select()
            .single();

          if (categoryError) {
            importErrors.push(`Failed to create category "${row.category}": ${categoryError.message}`);
            rowResults.push({ row: i + 2, employeeCode: String(row.newCode || ''), employeeName: row.fullName || '', status: 'failed', message: `Category error: ${categoryError.message}` });
            continue;
          }

          categoryId = newCategory.id;
          categoryCache.set(row.category.toLowerCase(), categoryId);
          categoriesCreated++;
          setImportProgress(prev => ({
            ...prev,
            categoriesCreated: prev.categoriesCreated + 1,
          }));
        }

        if (!categoryId) {
          importErrors.push(`Category not found or could not be created: ${row.category}`);
          rowResults.push({ row: i + 2, employeeCode: String(row.newCode || ''), employeeName: row.fullName || '', status: 'failed', message: `Category not found: ${row.category}` });
          continue;
        }

        // Parse target value
        const targetValue = typeof row.target === 'number' ? row.target : 
          row.target ? parseFloat(String(row.target).replace('%', '')) : null;

        // Parse review period and year from month (handles: "Dec-25", "Dec-2025", "December 2025", "December-2025", Excel serial date)
        let reviewPeriod: string | null = null;
        let reviewYear = new Date().getFullYear();
        
        if (row.month) {
          const monthStr = String(row.month).trim();
          
          // Check if it's an Excel serial date number (e.g., 45901)
          const serialNum = parseInt(monthStr);
          if (!isNaN(serialNum) && serialNum > 40000 && serialNum < 60000) {
            // Excel serial date: convert to JS Date
            // Excel epoch is Dec 30, 1899, but we need to account for leap year bug
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch.getTime() + serialNum * 24 * 60 * 60 * 1000);
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];
            reviewPeriod = monthNames[date.getMonth()];
            reviewYear = date.getFullYear();
          }
          // Try "Dec-25" or "Dec-2025" format
          else if (monthStr.includes('-')) {
            const parts = monthStr.split('-');
            const monthPart = parts[0];
            const yearPart = parts[1];
            
            // Map short month names to full names
            const shortMonths: Record<string, string> = {
              'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April',
              'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August',
              'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December'
            };
            const monthLower = monthPart.toLowerCase();
            reviewPeriod = shortMonths[monthLower] || monthPart;
            
            if (yearPart) {
              const yearNum = parseInt(yearPart);
              reviewYear = yearNum < 100 ? 2000 + yearNum : yearNum;
            }
          }
          // Try "December 2025" format (space separated)
          else if (monthStr.includes(' ')) {
            const parts = monthStr.split(' ');
            reviewPeriod = parts[0]; // Month name
            const yearPart = parts.pop();
            if (yearPart) {
              const yearNum = parseInt(yearPart);
              if (!isNaN(yearNum)) {
                reviewYear = yearNum < 100 ? 2000 + yearNum : yearNum;
              }
            }
          }
          // Try full month name
          else {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];
            const matchedMonth = monthNames.find(m => 
              m.toLowerCase() === monthStr.toLowerCase() || 
              m.toLowerCase().startsWith(monthStr.toLowerCase().substring(0, 3))
            );
            reviewPeriod = matchedMonth || monthStr;
          }
        }

        // Determine status based on review data
        const reviewStatus = determineReviewStatus(row);

        const { data: newKpi, error: kpiError } = await supabase
          .from('kpis')
          .insert({
            employee_id: employee.id,
            category_id: categoryId,
            kra_name: row.kra,
            kpi_name: row.kpi,
            target_value: targetValue,
            uom: row.uom || null,
            weightage: row.kpiWeightage ?? 0,
            criteria: row.criteria || 'Higher is Better',
            status: reviewStatus,
            review_period: reviewPeriod,
            review_year: reviewYear,
            // Rating thresholds
            r5: row.r5 ? String(row.r5) : null,
            r4: row.r4 ? String(row.r4) : null,
            r3: row.r3 ? String(row.r3) : null,
            r2: row.r2 ? String(row.r2) : null,
            r1: row.r1 ? String(row.r1) : null,
            r0: row.r0 ? String(row.r0) : null,
            frequency: row.frequency || null,
            source_of_data: row.sourceOfData || null,
            ref_code: row.refCode || null,
          })
          .select('id')
          .single();

        if (kpiError) throw kpiError;

        // Create review_submission if there's any review data
        const hasReviewData = row.targetAchieved != null || row.employeeTargetAchieved != null || 
          row.employeeRating != null || row.managerRating != null || row.auditRating != null ||
          row.rating != null || row.managerTargetAchieved != null || row.auditTargetAchieved != null ||
          row.employeeRemarks || row.managerRemarks || row.auditRemarks;

        if (hasReviewData && newKpi?.id) {
          const achievedValue = row.auditTargetAchieved ?? row.managerTargetAchieved ?? row.employeeTargetAchieved ?? row.targetAchieved;
          const selfScore = row.employeeRating ?? row.rating;
          const managerScore = row.managerRating;
          const auditorScore = row.auditRating;
          
          // Check if achieved value is N/A
          const achievedStr = String(achievedValue ?? '').trim().toLowerCase();
          const isNa = achievedStr === 'na' || achievedStr === 'n/a' || achievedStr === 'not applicable' || achievedStr === '-' ||
            // Also treat as NA if no achieved value AND no scores exist
            (!achievedValue && !selfScore && !managerScore && !auditorScore);
          
          // Parse achieved value (only if not N/A)
          const parsedAchieved = isNa ? null : (achievedValue 
            ? parseFloat(String(achievedValue).replace('%', '').replace(/,/g, ''))
            : null);

          const { error: submissionError } = await supabase
            .from('review_submissions')
            .insert({
              kpi_id: newKpi.id,
              achieved_value: parsedAchieved,
              manager_achieved_value: row.managerTargetAchieved != null ? ((() => { const n = parseFloat(String(row.managerTargetAchieved).replace('%', '').replace(/,/g, '')); return isNaN(n) ? null : n; })()) : null,
              auditor_achieved_value: row.auditTargetAchieved != null ? ((() => { const n = parseFloat(String(row.auditTargetAchieved).replace('%', '').replace(/,/g, '')); return isNaN(n) ? null : n; })()) : null,
              self_score: isNa ? null : (selfScore != null ? parseFloat(String(selfScore)) : null),
              self_rating: isNa ? null : mapScoreToRating(selfScore),
              self_remarks: row.employeeRemarks ?? null,
              manager_score: isNa ? null : (managerScore != null ? parseFloat(String(managerScore)) : null),
              manager_rating: isNa ? null : mapScoreToRating(managerScore),
              manager_remarks: row.managerRemarks ?? null,
              auditor_score: isNa ? null : (auditorScore != null ? parseFloat(String(auditorScore)) : null),
              auditor_rating: isNa ? null : mapScoreToRating(auditorScore),
              auditor_remarks: row.auditRemarks ?? null,
              kpi_status: determineKpiStatus(row),
              is_na: isNa,
              // Use auditor score as final if available, else manager, else self (nullish coalescing preserves 0)
              final_score: isNa ? null : (auditorScore != null ? parseFloat(String(auditorScore)) : 
                (managerScore != null ? parseFloat(String(managerScore)) : 
                (selfScore != null ? parseFloat(String(selfScore)) : null))),
              final_rating: isNa ? null : mapScoreToRating(auditorScore ?? managerScore ?? selfScore),
            });

          if (submissionError) {
            // Rollback: delete the orphaned KPI since its review submission failed
            await supabase.from('kpis').delete().eq('id', newKpi.id);
            throw new Error(`Review submission failed: ${submissionError.message}`);
          }
        }

        successCount++;
        rowResults.push({ row: i + 2, employeeCode: String(row.newCode || ''), employeeName: row.fullName || '', status: 'success', message: 'Imported successfully' });
        setImportProgress(prev => ({
          ...prev,
          kpisImported: prev.kpisImported + 1,
        }));
      } catch (error: any) {
        importErrors.push(`Failed to import KPI for ${row.fullName}: ${error.message}`);
        rowResults.push({ row: i + 2, employeeCode: String(row.newCode || ''), employeeName: row.fullName || '', status: 'failed', message: error.message });
      }
    }

    setImportSuccess(successCount);
    setErrors(importErrors);
    setKpiImportResults(rowResults);
    setIsImporting(false);

    // Refresh categories if any were created
    if (categoriesCreated > 0) {
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['kra-categories'] });
    }

    // Invalidate KPI queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['kpis'] });
    queryClient.invalidateQueries({ queryKey: ['review-submissions'] });

    if (successCount > 0) {
      let message = `Successfully imported ${successCount} KPIs`;
      if (categoriesCreated > 0) {
        message += `, created ${categoriesCreated} categories`;
      }
      if (employeesCreated > 0) {
        message += `, auto-created ${employeesCreated} employees`;
        // Refresh profiles since we created new employees
        refetchProfiles();
        queryClient.invalidateQueries({ queryKey: ['profiles'] });
      }
      toast({ title: message });
    }
  };

  const handleEmployeeImport = async () => {
    if (employeeData.length === 0) return;

    // Calculate valid rows (skip rows with validation errors)
    const validIndices = employeeData.map((_, i) => i).filter(i => !employeeRowErrors.has(i));
    if (validIndices.length === 0) {
      toast({ title: 'No valid rows to import', description: 'All rows have validation errors.', variant: 'destructive' });
      return;
    }

    setIsImportingEmployees(true);
    setEmployeeImportProgress({ current: 0, total: employeeData.length });
    setEmployeeImportResults(null);
    let successCount = 0;
    const importErrors: string[] = [];
    const rowResults: ImportRowResult[] = [];
    const BATCH_SIZE = 5;

    // Pre-populate skipped rows from validation errors
    employeeData.forEach((row, idx) => {
      if (employeeRowErrors.has(idx)) {
        const errs = employeeRowErrors.get(idx)!;
        rowResults.push({
          row: idx + 2,
          employeeCode: row.employeeCode || '',
          employeeName: row.fullName || '',
          status: 'skipped',
          message: errs.join('; '),
        });
      }
    });

    // Process a single employee row
    const processEmployee = async (row: EmployeeImportRow) => {
      // Check if employee already exists by employee_code or email only (no name matching to avoid silent overwrites)
      const existingEmployee = profiles?.find(p => 
        (row.employeeCode && p.employee_code && p.employee_code === String(row.employeeCode)) ||
        (row.email && p.email && p.email.toLowerCase() === row.email.toLowerCase())
      );

      if (existingEmployee) {
        if (!allowUpdateExisting) {
          throw new Error(`Employee code '${row.employeeCode}' already exists. Enable 'Allow updating existing employees' to update.`);
        }
        // Update existing profile
        const departmentId = departments?.find(d => 
          d.name.toLowerCase() === row.department?.toLowerCase()
        )?.id || null;

        const managerId = profiles?.find(p => 
          p.employee_code === row.managerEmployeeId ||
          (row.managerName && p.full_name?.toLowerCase() === row.managerName?.toLowerCase())
        )?.id || null;

        // Resolve company by code or name (case-insensitive)
        const resolvedCompanyId = row.companyCode
          ? (companiesList || []).find((c: any) =>
              c.code?.toLowerCase() === row.companyCode!.toLowerCase() ||
              c.name?.toLowerCase() === row.companyCode!.toLowerCase()
            )?.id || null
          : null;

        const { error } = await supabase
          .from('profiles')
          .update({
            employee_code: row.employeeCode ? String(row.employeeCode) : existingEmployee.employee_code,
            full_name: row.fullName || existingEmployee.full_name,
            designation: row.designation || existingEmployee.designation,
            department_id: departmentId || existingEmployee.department_id,
            pms_grade: row.pmsGrade || existingEmployee.pms_grade,
            level: row.level || (existingEmployee as any).level,
            reporting_manager_id: managerId || existingEmployee.reporting_manager_id,
            ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}),
          } as any)
          .eq('id', existingEmployee.id);

        if (error) throw error;

        // Update role for existing employee if provided in import
        if (row.role) {
          const newRole = normalizeRole(row.role);
          const { data: existingRole } = await supabase
            .from('user_roles')
            .select('id, role')
            .eq('user_id', existingEmployee.id)
            .maybeSingle();

          if (existingRole) {
            if (existingRole.role !== newRole) {
              await supabase.from('user_roles')
                .update({ role: newRole })
                .eq('id', existingRole.id);
            }
          } else {
            await supabase.from('user_roles')
              .insert({ user_id: existingEmployee.id, role: newRole });
          }
        }

        return { success: true, userId: existingEmployee.id };
      } else if (row.email) {
        // Create new user via edge function
        const departmentId = departments?.find(d => 
          d.name.toLowerCase() === row.department?.toLowerCase()
        )?.id || null;

        const managerId = profiles?.find(p => 
          p.employee_code === row.managerEmployeeId ||
          (row.managerName && p.full_name?.toLowerCase() === row.managerName?.toLowerCase())
        )?.id || null;

        // Resolve company by code or name (case-insensitive)
        const newCompanyId = row.companyCode
          ? (companiesList || []).find((c: any) =>
              c.code?.toLowerCase() === row.companyCode!.toLowerCase() ||
              c.name?.toLowerCase() === row.companyCode!.toLowerCase()
            )?.id || undefined
          : undefined;

        const { data: fnData, error: fnError } = await supabase.functions.invoke('create-employee', {
          body: {
            employee_code: String(row.employeeCode),
            full_name: sanitizeText(row.fullName),
            email: sanitizeText(row.email),
            designation: sanitizeText(row.designation) || undefined,
            department_id: departmentId || undefined,
            pms_grade: sanitizeText(row.pmsGrade) || undefined,
            level: sanitizeText(row.level) || undefined,
            reporting_manager_id: managerId || undefined,
            company_id: newCompanyId,
          },
        });

        if (fnError) throw fnError;

        const newUserId = fnData?.profile?.id || null;

        // Assign role to new user
        if (newUserId) {
          const assignedRole = normalizeRole(row.role);
          const { data: existingRole } = await supabase
            .from('user_roles')
            .select('id')
            .eq('user_id', newUserId)
            .maybeSingle();

          if (!existingRole) {
            await supabase.from('user_roles').insert({ user_id: newUserId, role: assignedRole });
          }
        }

        return { success: true, userId: newUserId };
      } else {
        throw new Error(`Employee not found and no email provided to create new user`);
      }
    };

    // Process only valid rows in batches of BATCH_SIZE concurrently
    const validRows = validIndices.map(i => ({ row: employeeData[i], globalIdx: i }));
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(item => processEmployee(item.row))
      );

      results.forEach((result, idx) => {
        const item = batch[idx];
        const row = item.row;
        const globalIdx = item.globalIdx;
        if (result.status === 'fulfilled') {
          successCount++;
          rowResults.push({ row: globalIdx + 2, employeeCode: row.employeeCode || '', employeeName: row.fullName || '', status: 'success', message: 'Imported successfully' });
        } else {
          importErrors.push(`Failed to import ${row.fullName || row.employeeCode}: ${result.reason?.message || 'Unknown error'}`);
          rowResults.push({ row: globalIdx + 2, employeeCode: row.employeeCode || '', employeeName: row.fullName || '', status: 'failed', message: result.reason?.message || 'Unknown error' });
        }
      });

      setEmployeeImportProgress({ current: Math.min(i + BATCH_SIZE, validRows.length), total: employeeData.length });
    }

    // Track users with explicit roles from import (non-employee roles)
    const explicitRoleUsers = new Set<string>();
    employeeData.forEach(row => {
      if (row.role && normalizeRole(row.role) !== 'employee') {
        if (row.employeeCode) explicitRoleUsers.add(row.employeeCode.toLowerCase());
        if (row.email) explicitRoleUsers.add(row.email.toLowerCase());
      }
    });

    // Second pass: Identify managers from import data and assign 'manager' role
    const managerIdentifiers = new Set<string>();
    employeeData.forEach(row => {
      if (row.managerEmployeeId) managerIdentifiers.add(row.managerEmployeeId.toLowerCase());
      if (row.managerName) managerIdentifiers.add(row.managerName.toLowerCase());
    });

    const { data: updatedProfiles } = await supabase
      .from('profiles')
      .select('id, employee_code, full_name, email');

    if (updatedProfiles && managerIdentifiers.size > 0) {
      for (const profile of updatedProfiles) {
        const isManager = 
          (profile.employee_code && managerIdentifiers.has(profile.employee_code.toLowerCase())) ||
          (profile.full_name && managerIdentifiers.has(profile.full_name.toLowerCase()));

        if (isManager) {
          const hasExplicitRole = 
            (profile.employee_code && explicitRoleUsers.has(profile.employee_code.toLowerCase())) ||
            (profile.email && explicitRoleUsers.has(profile.email.toLowerCase()));

          if (hasExplicitRole) continue;

          const { data: existingRole } = await supabase
            .from('user_roles')
            .select('id, role')
            .eq('user_id', profile.id)
            .maybeSingle();

          if (existingRole) {
            if (existingRole.role === 'employee') {
              await supabase.from('user_roles').update({ role: 'manager' }).eq('id', existingRole.id);
            }
          } else {
            await supabase.from('user_roles').insert({ user_id: profile.id, role: 'manager' });
          }
        }
      }
    }

    setEmployeeImportSuccess(successCount);
    setEmployeeErrors(importErrors);
    setEmployeeImportResults(rowResults);
    setIsImportingEmployees(false);
    refetchProfiles();

    if (successCount > 0) {
      toast({ title: `Successfully imported ${successCount} employees` });
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        sNo: 1,
        refCode: 'REF-001',
        month: 'Dec-25',
        reviewStatus: 'Pending',
        newCode: '100001',
        fullName: 'John Doe',
        // Organization structure
        division: 'Operations',
        businessUnit: 'Plant',
        department: 'Manufacturing',
        subBranch: '',
        // KPI definition
        category: 'Financial Performance',
        kra: 'Revenue Growth',
        kpi: 'Monthly Revenue Target',
        uom: '%',
        uomType: 'numeric',
        qualitativeOptions: '',
        frequency: 'Monthly',
        frequencyCycleStart: '',
        kpiWeightage: 25,
        criteria: 'Higher is Better',
        target: '100',
        r5: '120',
        r4: '110',
        r3: '100',
        r2: '90',
        r1: '80',
        r0: '',
        // Review data
        targetAchieved: '',
        achievedWeight: '',
        rating: '',
        kpiWeightageScore: '',
        employeeTargetAchieved: '',
        employeeRating: '',
        employeeRemarks: '',
        managerTargetAchieved: '',
        managerRating: '',
        managerRemarks: '',
        auditTargetAchieved: '',
        auditRating: '',
        auditRemarks: '',
        // Metadata
        sourceOfData: 'SAP',
        kpiStatus: 'Active',
        isOrgLevel: '',
      },
      {
        sNo: 2,
        refCode: 'REF-002',
        month: 'Dec-25',
        reviewStatus: 'Pending',
        newCode: '100001',
        fullName: 'John Doe',
        division: '',
        businessUnit: '',
        department: '',
        subBranch: '',
        category: 'Compliance',
        kra: 'Safety Compliance',
        kpi: 'Safety Audit Score',
        uom: '',
        uomType: 'tiered',
        qualitativeOptions: 'auto',
        frequency: 'Quarterly',
        frequencyCycleStart: 'Apr-Jun',
        kpiWeightage: 15,
        criteria: '',
        target: '',
        r5: 'Compliant|All safety audits passed',
        r4: '',
        r3: 'Partial|Minor non-conformances found',
        r2: '',
        r1: '',
        r0: 'Non-Compliant|Critical violation identified',
        targetAchieved: '',
        achievedWeight: '',
        rating: '',
        kpiWeightageScore: '',
        employeeTargetAchieved: '',
        employeeRating: '',
        employeeRemarks: '',
        managerTargetAchieved: '',
        managerRating: '',
        managerRemarks: '',
        auditTargetAchieved: '',
        auditRating: '',
        auditRemarks: '',
        sourceOfData: 'Internal Audit',
        kpiStatus: 'Active',
        isOrgLevel: '',
      },
      {
        sNo: 3,
        refCode: 'REF-003',
        month: 'Dec-25',
        reviewStatus: 'Pending',
        newCode: '100001',
        fullName: 'John Doe',
        division: '',
        businessUnit: '',
        department: '',
        subBranch: '',
        category: 'Training',
        kra: 'Training Completion',
        kpi: 'Mandatory Training Completed',
        uom: '',
        uomType: 'binary',
        qualitativeOptions: '',
        frequency: 'Yearly',
        frequencyCycleStart: 'Jan-Dec',
        kpiWeightage: 10,
        criteria: '',
        target: '',
        r5: '',
        r4: '',
        r3: '',
        r2: '',
        r1: '',
        r0: '',
        targetAchieved: '',
        achievedWeight: '',
        rating: '',
        kpiWeightageScore: '',
        employeeTargetAchieved: '',
        employeeRating: '',
        employeeRemarks: '',
        managerTargetAchieved: '',
        managerRating: '',
        managerRemarks: '',
        auditTargetAchieved: '',
        auditRating: '',
        auditRemarks: '',
        sourceOfData: 'LMS',
        kpiStatus: 'Active',
        isOrgLevel: 'yes',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PMS Import Template');
    XLSX.writeFile(wb, 'pms_import_template.xlsx');
  };

  const downloadEmployeeTemplate = () => {
    const template = [
      {
        employeeCode: '100001',
        fullName: 'John Doe',
        email: 'john.doe@company.com',
        designation: 'Manager',
        role: 'employee',
        companyCode: 'BFCL',
        division: 'Operations',
        businessUnit: 'Plant',
        department: 'HR',
        pmsGrade: 'A',
        level: 'Level 1',
        managerEmployeeId: '100002',
        managerName: 'Jane Smith',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Template');
    XLSX.writeFile(wb, 'employee_import_template.xlsx');
  };

  // Export current employee data
  const exportEmployeeData = async () => {
    setIsExportingEmployees(true);
    try {
      // Fetch all profiles with department info
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          employee_code,
          full_name,
          email,
          designation,
          company_id,
          pms_grade,
          level,
          department_id,
          reporting_manager_id,
          departments!profiles_department_fk(
            id,
            name,
            business_unit_id,
            business_units(
              id,
              name,
              division_id,
              divisions(id, name)
            )
          )
        `);
      
      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');
      
      if (rolesError) throw rolesError;

      const roleMap = new Map(userRoles?.map(r => [r.user_id, r.role]) || []);
      const profileMap = new Map(allProfiles?.map(p => [p.id, p]) || []);

      const exportData = (allProfiles || []).map(profile => {
        const dept = profile.departments as any;
        const bu = dept?.business_units;
        const div = bu?.divisions;
        const manager = profile.reporting_manager_id ? profileMap.get(profile.reporting_manager_id) : null;
        
        // Resolve company name from company_id
        const companyId = (profile as any).company_id;
        const companyObj = companyId ? (companiesList || []).find((c: any) => c.id === companyId) : null;

        return {
          employeeCode: profile.employee_code || '',
          fullName: profile.full_name || '',
          email: profile.email || '',
          designation: profile.designation || '',
          role: roleMap.get(profile.id) || 'employee',
          companyCode: companyObj?.code || companyObj?.name || '',
          division: div?.name || '',
          businessUnit: bu?.name || '',
          department: dept?.name || '',
          pmsGrade: profile.pms_grade || '',
          level: (profile as any).level || '',
          managerEmployeeId: manager?.employee_code || '',
          managerName: manager?.full_name || '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Employees');
      XLSX.writeFile(wb, `employees_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast({
        title: 'Export Complete',
        description: `Exported ${exportData.length} employees to Excel.`,
      });
    } catch (error: any) {
      console.error('Error exporting employees:', error);
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to export employee data',
        variant: 'destructive',
      });
    } finally {
      setIsExportingEmployees(false);
    }
  };

  // Export current KPI data
  const exportKpiData = async () => {
    setIsExportingKpis(true);
    try {
      // Fetch all KPIs with related data - handle pagination
      let allKpis: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data: kpiBatch, error: kpisError } = await supabase
          .from('kpis')
          .select(`
            id,
            kpi_name,
            kra_name,
            employee_id,
            category_id,
            target_value,
            uom,
            uom_type,
            qualitative_options,
            frequency,
            frequency_cycle_start,
            weightage,
            criteria,
            r5, r4, r3, r2, r1, r0,
            ref_code,
            review_period,
            review_year,
            source_of_data,
            status,
            is_org_level,
            kra_categories(name),
            profiles!kpis_employee_id_fkey(employee_code, full_name, department_id, departments(name, business_units(name, divisions(name))))
          `)
          .range(offset, offset + batchSize - 1);
        
        if (kpisError) throw kpisError;
        if (!kpiBatch || kpiBatch.length === 0) break;
        
        allKpis = [...allKpis, ...kpiBatch];
        if (kpiBatch.length < batchSize) break;
        offset += batchSize;
      }

      // Fetch all review submissions (including per-level achieved values)
      let allSubmissions: any[] = [];
      offset = 0;
      
      while (true) {
        const { data: submissionBatch, error: submissionsError } = await supabase
          .from('review_submissions')
          .select('kpi_id, achieved_value, self_score, self_remarks, manager_achieved_value, manager_score, manager_remarks, auditor_achieved_value, auditor_score, auditor_remarks, management_score, management_remarks, final_score')
          .range(offset, offset + batchSize - 1);
        
        if (submissionsError) throw submissionsError;
        if (!submissionBatch || submissionBatch.length === 0) break;
        
        allSubmissions = [...allSubmissions, ...submissionBatch];
        if (submissionBatch.length < batchSize) break;
        offset += batchSize;
      }

      // Fetch performance reviews for reviewStatus column
      let allReviews: any[] = [];
      offset = 0;
      
      while (true) {
        const { data: reviewBatch, error: reviewsError } = await supabase
          .from('performance_reviews')
          .select('employee_id, review_period, review_year, status')
          .range(offset, offset + batchSize - 1);
        
        if (reviewsError) throw reviewsError;
        if (!reviewBatch || reviewBatch.length === 0) break;
        
        allReviews = [...allReviews, ...reviewBatch];
        if (reviewBatch.length < batchSize) break;
        offset += batchSize;
      }

      // Fetch sub-branches for employees
      let allSubBranches: any[] = [];
      const { data: subBranchData } = await supabase
        .from('sub_branches')
        .select('id, name, department_id');
      if (subBranchData) allSubBranches = subBranchData;

      const submissionMap = new Map(allSubmissions.map(s => [s.kpi_id, s]));
      const reviewMap = new Map(allReviews.map(r => [`${r.employee_id}_${r.review_period}_${r.review_year}`, r]));

      const exportData = allKpis.map((kpi, index) => {
        const submission = submissionMap.get(kpi.id);
        const profile = kpi.profiles as any;
        const category = kpi.kra_categories as any;
        const dept = profile?.departments as any;
        const bu = dept?.business_units as any;
        const div = bu?.divisions as any;
        const reviewKey = `${kpi.employee_id}_${kpi.review_period}_${kpi.review_year}`;
        const review = reviewMap.get(reviewKey);
        // Find sub-branch by matching department_id
        const subBranch = allSubBranches.find(sb => sb.department_id === profile?.department_id);
        
        return {
          sNo: index + 1,
          refCode: (kpi as any).ref_code ?? '',
          month: kpi.review_period ?? '',
          reviewStatus: review?.status ?? '',
          newCode: profile?.employee_code ?? '',
          fullName: profile?.full_name ?? '',
          division: div?.name ?? '',
          businessUnit: bu?.name ?? '',
          department: dept?.name ?? '',
          subBranch: subBranch?.name ?? '',
          category: category?.name ?? '',
          kra: kpi.kra_name ?? '',
          kpi: kpi.kpi_name ?? '',
          uom: kpi.uom ?? '',
          uomType: kpi.uom_type ?? 'numeric',
          qualitativeOptions: kpi.qualitative_options ? JSON.stringify(kpi.qualitative_options) : '',
          frequency: kpi.frequency ?? '',
          frequencyCycleStart: kpi.frequency_cycle_start ?? '',
          kpiWeightage: kpi.weightage ?? '',
          criteria: kpi.criteria ?? '',
          target: kpi.target_value ?? '',
          r5: kpi.r5 ?? '',
          r4: kpi.r4 ?? '',
          r3: kpi.r3 ?? '',
          r2: kpi.r2 ?? '',
          r1: kpi.r1 ?? '',
          r0: kpi.r0 ?? '',
          targetAchieved: submission?.achieved_value ?? '',
          achievedWeight: '',
          rating: (kpi.status === 'approved' ? submission?.final_score : null) ?? submission?.management_score ?? submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? '',
          kpiWeightageScore: (() => {
            const score = (kpi.status === 'approved' ? submission?.final_score : null) ?? submission?.management_score ?? submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? null;
            return score != null && kpi.weightage != null
              ? Number((score * (kpi.weightage / 100)).toFixed(2))
              : '';
          })(),
          employeeTargetAchieved: submission?.achieved_value ?? '',
          employeeRating: submission?.self_score ?? '',
          employeeRemarks: submission?.self_remarks ?? '',
          managerTargetAchieved: submission?.manager_achieved_value ?? '',
          managerRating: submission?.manager_score ?? '',
          managerRemarks: submission?.manager_remarks ?? '',
          auditTargetAchieved: submission?.auditor_achieved_value ?? '',
          auditRating: submission?.auditor_score ?? '',
          auditRemarks: submission?.auditor_remarks ?? '',
          sourceOfData: kpi.source_of_data ?? '',
          kpiStatus: kpi.status ?? '',
          isOrgLevel: kpi.is_org_level ? 'Yes' : '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'KPIs');
      XLSX.writeFile(wb, `kpis_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast({
        title: 'Export Complete',
        description: `Exported ${exportData.length} KPIs to Excel.`,
      });
    } catch (error: any) {
      console.error('Error exporting KPIs:', error);
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to export KPI data',
        variant: 'destructive',
      });
    } finally {
      setIsExportingKpis(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground">Bulk import Employees and KRAs from Excel</p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="org-structure">
            <Building2 className="h-4 w-4 mr-1.5" />
            Organization Structure
          </TabsTrigger>
          <TabsTrigger value="employees">Import Employees</TabsTrigger>
          <TabsTrigger value="kpis">Import PMS Data</TabsTrigger>
        </TabsList>

        <TabsContent value="org-structure">
          <OrgStructureImport />
        </TabsContent>

        <TabsContent value="employees" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employee Bulk Import
              </CardTitle>
              <CardDescription>Upload an Excel file to bulk import employees</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <Button variant="outline" onClick={downloadEmployeeTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button variant="secondary" onClick={exportEmployeeData} disabled={isExportingEmployees}>
                  {isExportingEmployees ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Export Current Data
                </Button>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleEmployeeFileUpload}
                    className="cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="allow-update-existing"
                    checked={allowUpdateExisting}
                    onCheckedChange={(checked) => {
                      setAllowUpdateExisting(checked === true);
                      // Re-trigger per-row validation if data is already loaded
                      if (employeeData.length > 0) {
                        const deptNames = new Set((departments || []).map(d => d.name.toLowerCase()));
                        const divNames = new Set((divisions || []).map(d => d.name.toLowerCase()));
                        const buNames = new Set((businessUnits || []).map(d => d.name.toLowerCase()));
                        const desigNames = new Set((designations || []).map(d => d.name.toLowerCase()));
                        const existingCodes = new Set((profiles || []).map(p => p.employee_code?.toLowerCase()).filter(Boolean));
                        const newRowErrors = new Map<number, string[]>();
                        employeeData.forEach((row, index) => {
                          const rowErrs: string[] = [];
                          if (!row.employeeCode && !row.fullName) rowErrs.push('Missing employee code and full name');
                          if (row.employeeCode && !(checked === true) && existingCodes.has(row.employeeCode.toLowerCase())) rowErrs.push(`Employee code '${row.employeeCode}' already exists`);
                          if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) rowErrs.push('Invalid email format');
                          if (row.fullName && row.fullName.length > 200) rowErrs.push('Full name exceeds 200 characters');
                          if (row.designation && row.designation.length > 100) rowErrs.push('Designation exceeds 100 characters');
                          if (row.department && !deptNames.has(row.department.toLowerCase())) rowErrs.push(`Department '${row.department}' does not exist`);
                          if (row.division && !divNames.has(row.division.toLowerCase())) rowErrs.push(`Division '${row.division}' does not exist`);
                          if (row.businessUnit && !buNames.has(row.businessUnit.toLowerCase())) rowErrs.push(`Business Unit '${row.businessUnit}' does not exist`);
                          if (row.designation && !desigNames.has(row.designation.toLowerCase())) rowErrs.push(`Designation '${row.designation}' does not exist`);
                          if (rowErrs.length > 0) newRowErrors.set(index, rowErrs);
                        });
                        setEmployeeRowErrors(newRowErrors);
                      }
                    }}
                  />
                  <Label htmlFor="allow-update-existing" className="text-sm cursor-pointer">
                    Allow updating existing employees
                  </Label>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Required columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>employeeCode</code> - Unique Employee Code</li>
                  <li><code>fullName</code> - Employee Full Name</li>
                  <li><code>email</code> - Employee Email (used for login)</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Optional columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>designation</code> - Job Title</li>
                  <li><code>role</code> - System Role: <span className="text-xs ml-1 text-muted-foreground">(admin | manager | employee | auditor | management)</span></li>
                  <li><code>division</code> - Division Name</li>
                  <li><code>businessUnit</code> - Business Unit Name</li>
                  <li><code>department</code> - Department Name (must exist in system)</li>
                  <li><code>pmsGrade</code> - PMS Grade</li>
                  <li><code>level</code> - Employee Level</li>
                  <li><code>managerEmployeeId</code> - Manager's Employee Code</li>
                  <li><code>managerName</code> - Manager's Full Name</li>
                </ul>
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Role behavior:</strong> If no role is specified, employees default to <code>employee</code>. 
                    Explicit roles take precedence over auto-promotion based on reporting lines.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {employeeRowErrors.size > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Issues ({employeeRowErrors.size} row{employeeRowErrors.size > 1 ? 's' : ''} will be skipped)</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 max-h-32 overflow-auto">
                  {Array.from(employeeRowErrors.entries()).map(([idx, errs]) => (
                    <li key={idx}>Row {idx + 2}: {errs.join('; ')}</li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    const exportData = Array.from(employeeRowErrors.entries()).map(([idx, errs]) => {
                      const row = employeeData[idx];
                      return {
                        'Row Number': idx + 2,
                        'Employee Code': row?.employeeCode || '',
                        'Full Name': row?.fullName || '',
                        'Department': row?.department || '',
                        'Designation': row?.designation || '',
                        'Division': row?.division || '',
                        'Business Unit': row?.businessUnit || '',
                        'Error': errs.join('; '),
                      };
                    });
                    const ws = XLSX.utils.json_to_sheet(exportData);
                    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 60 }];
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Validation Errors');
                    XLSX.writeFile(wb, `employee-validation-errors-${new Date().toISOString().split('T')[0]}.xlsx`);
                  }}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download Error Report
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {employeeImportResults && employeeImportResults.length > 0 && (
            <ImportResultsSummary
              results={employeeImportResults}
              importType="employee"
              onDismiss={() => { setEmployeeImportResults(null); setEmployeeImportSuccess(0); }}
            />
          )}

          {employeeData.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>
                    {employeeData.length} total rows
                    {employeeRowErrors.size > 0 && (
                      <span className="text-destructive ml-1">
                        ({employeeRowErrors.size} will be skipped due to errors)
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button
                  onClick={handleEmployeeImport}
                  disabled={isImportingEmployees || (employeeData.length - employeeRowErrors.size) === 0}
                >
                  {isImportingEmployees ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing {employeeImportProgress.current}/{employeeImportProgress.total}...</>
                  ) : employeeRowErrors.size > 0
                    ? `Import ${employeeData.length - employeeRowErrors.size} of ${employeeData.length} Employees`
                    : `Import ${employeeData.length} Employees`
                  }
                </Button>
              </CardHeader>
              {isImportingEmployees && (
                <div className="px-6 pb-4">
                  <Progress value={(employeeImportProgress.current / employeeImportProgress.total) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Processing {employeeImportProgress.current} of {employeeImportProgress.total} employees...
                  </p>
                </div>
              )}
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead>Business Unit</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Manager ID</TableHead>
                        <TableHead>Manager Name</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeData.slice(0, 10).map((row, i) => (
                        <TableRow key={i} className={employeeRowErrors.has(i) ? 'bg-destructive/10' : ''}>
                          <TableCell>{row.employeeCode}</TableCell>
                          <TableCell>{row.fullName}</TableCell>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>
                            <Badge variant={
                              row.role === 'admin' ? 'destructive' :
                              row.role === 'auditor' ? 'secondary' :
                              row.role === 'manager' ? 'default' :
                              row.role === 'management' ? 'outline' :
                              'secondary'
                            }>
                              {normalizeRole(row.role)}
                            </Badge>
                          </TableCell>
                          <TableCell>{row.designation || '-'}</TableCell>
                          <TableCell>{row.division || '-'}</TableCell>
                          <TableCell>{row.businessUnit || '-'}</TableCell>
                          <TableCell>{row.department || '-'}</TableCell>
                          <TableCell>{row.pmsGrade || '-'}</TableCell>
                          <TableCell>{row.level || '-'}</TableCell>
                          <TableCell>{row.managerEmployeeId || '-'}</TableCell>
                          <TableCell>{row.managerName || '-'}</TableCell>
                          <TableCell>
                            {employeeRowErrors.has(i) ? (
                              <Badge variant="destructive" className="text-xs">Error</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Valid</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {employeeData.length > 10 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Showing first 10 of {employeeData.length} rows
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="kpis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                PMS Scorecard Import
              </CardTitle>
              <CardDescription>Upload an Excel file to bulk import employee KRAs and KPIs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 items-center">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button variant="secondary" onClick={exportKpiData} disabled={isExportingKpis}>
                  {isExportingKpis ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Export Current Data
                </Button>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="cursor-pointer"
                  />
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isClearing}>
                      {isClearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      Clear All KPI Data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear All KPI Data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all KPIs, review submissions, and performance reviews. 
                        This action cannot be undone. Use this before importing fresh data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearKpiData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Yes, Clear All Data
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <div className="flex items-center gap-2 ml-auto">
                  <Checkbox
                    id="background-import"
                    checked={useBackgroundImport}
                    onCheckedChange={(checked) => setUseBackgroundImport(checked === true)}
                  />
                  <Label htmlFor="background-import" className="text-sm cursor-pointer">
                    Import in background (faster, no waiting)
                  </Label>
                </div>
              </div>

              {/* Background Import Progress */}
              {backgroundProgress && (
                <Card className={`border-2 ${
                  backgroundProgress.status === 'completed' ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20' :
                  backgroundProgress.status === 'failed' ? 'border-destructive/50 bg-destructive/10' :
                  'border-primary/50 bg-primary/5'
                }`}>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {backgroundProgress.status === 'running' ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              <span className="font-medium">Importing data in background...</span>
                            </>
                          ) : backgroundProgress.status === 'completed' ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <span className="font-medium text-green-700 dark:text-green-300">Import Complete!</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-4 w-4 text-destructive" />
                              <span className="font-medium text-destructive">Import Failed</span>
                            </>
                          )}
                        </div>
                        <span className="text-muted-foreground">
                          {backgroundProgress.processed_rows} / {backgroundProgress.total_rows}
                        </span>
                      </div>
                      
                      <Progress 
                        value={backgroundProgress.total_rows > 0 
                          ? (backgroundProgress.processed_rows / backgroundProgress.total_rows) * 100 
                          : 0
                        } 
                        className="h-2"
                      />
                      
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="rounded-lg bg-background p-3 border">
                          <div className="text-2xl font-bold text-primary">{backgroundProgress.kpis_imported}</div>
                          <div className="text-xs text-muted-foreground">KPIs Imported</div>
                        </div>
                        <div className="rounded-lg bg-background p-3 border">
                          <div className="text-2xl font-bold text-green-600">{backgroundProgress.employees_created}</div>
                          <div className="text-xs text-muted-foreground">Employees Created</div>
                        </div>
                        <div className="rounded-lg bg-background p-3 border">
                          <div className="text-2xl font-bold text-blue-600">{backgroundProgress.categories_created}</div>
                          <div className="text-xs text-muted-foreground">Categories Created</div>
                        </div>
                      </div>
                      
                      {backgroundProgress.errors && backgroundProgress.errors.length > 0 && backgroundProgress.status !== 'running' && (
                        <div className="mt-4">
                          <ImportResultsSummary
                            results={backgroundProgress.errors.map((err, i) => {
                              // Parse "Row X: EmpCode - Name: error" format
                              const match = err.match(/^Row (\d+):\s*(\S+)\s*-\s*([^:]+):\s*(.+)$/);
                              if (match) {
                                return { row: parseInt(match[1]), employeeCode: match[2], employeeName: match[3].trim(), status: 'failed' as const, message: match[4].trim() };
                              }
                              return { row: i + 1, employeeCode: '', employeeName: '', status: 'failed' as const, message: err };
                            })}
                            importType="kpi-background"
                            onDismiss={() => { setBackgroundImportId(null); setBackgroundProgress(null); }}
                          />
                        </div>
                      )}
                      
                      {backgroundProgress.status !== 'running' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setBackgroundImportId(null);
                            setBackgroundProgress(null);
                          }}
                          className="w-full"
                        >
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Required columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>newCode</code> - Employee Code</li>
                  <li><code>fullName</code> - Employee Full Name</li>
                  <li><code>category</code> - KRA Category (will be auto-created if doesn't exist)</li>
                  <li><code>kra</code> - Key Result Area</li>
                  <li><code>kpi</code> - KPI / Target Description</li>
                  <li><code>target</code> - Target Value</li>
                  <li><code>month</code> - Review Period (e.g., Sep-25)</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Rating threshold columns (for auto-rating calculation):</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>criteria</code> - "Higher is Better" or "Lower is Better"</li>
                  <li><code>r5</code>, <code>r4</code>, <code>r3</code>, <code>r2</code>, <code>r1</code>, <code>r0</code> - Rating thresholds (5=Exceptional, 0=Zero)</li>
                  <li><code>uom</code> - Unit of Measure (%, ₹, units, etc.)</li>
                  <li><code>kpiWeightage</code> - KPI Weightage (0-100)</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Qualitative UOM columns (for non-numeric KPIs):</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>uomType</code> - Type of measure: <code>numeric</code> (default), <code>binary</code>, or <code>tiered</code></li>
                  <li><code>qualitativeOptions</code> - Set to <code>auto</code> (or leave blank) to auto-build options from R5-R0 labels</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2 mb-2">
                  <strong>Simplified syntax:</strong> For binary/tiered KPIs, enter text labels in R5-R0 columns instead of JSON. Example:
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                  <li>Binary Yes/No: <code>R5="Yes"</code>, <code>R0="No"</code> → shows only Yes/No buttons</li>
                  <li>Custom labels: <code>R5="Done"</code>, <code>R0="Pending"</code> → shows Done/Pending</li>
                  <li>3-tier: <code>R5="Compliant"</code>, <code>R3="Partial"</code>, <code>R0="Non-Compliant"</code></li>
                  <li>With tooltip: <code>R5="Yes|Task completed successfully"</code> (Label|Definition)</li>
                  <li>Template shorthand: <code>qualitativeOptions="yes_no"</code>, <code>"compliance_3"</code>, <code>"pass_fail"</code></li>
                </ul>
                <p className="font-medium mt-4 mb-2">Organization structure columns (auto-created if missing):</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>division</code> - Division name</li>
                  <li><code>businessUnit</code> - Business Unit name</li>
                  <li><code>department</code> - Department name</li>
                  <li><code>subBranch</code> - Sub-branch name (optional)</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Special flags:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>isOrgLevel</code> - Set to 'yes' or 'true' for organization-level KPIs (centrally managed)</li>
                  <li><code>frequencyCycleStart</code> - Per-KPI cycle start override:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Bi-Monthly: <code>Jan-Feb</code> (standard) or <code>Feb-Mar</code> (offset)</li>
                      <li>Quarterly: <code>Jan-Mar</code>, <code>Apr-Jun</code>, or <code>Jul-Sep</code></li>
                      <li>Half-Yearly: <code>Jan-Jun</code>, <code>Apr-Sep</code>, or <code>Jul-Dec</code></li>
                      <li>Yearly: <code>Jan-Dec</code>, <code>Apr-Mar</code>, or <code>Jul-Jun</code></li>
                    </ul>
                    Leave empty to use the system default.
                  </li>
                </ul>
                <p className="font-medium mt-4 mb-2">Status columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>reviewStatus</code> - Workflow status: <code>kra_set</code>, <code>self_review</code>, <code>manager_check</code>, <code>audit</code>, <code>management_review</code>, <code>approved</code></li>
                  <li><code>kpiStatus</code> - Submission status: <code>open</code>, <code>submitted</code>, <code>approved_by_manager</code>, <code>locked</code></li>
                </ul>
                <p className="font-medium mt-4 mb-2">Optional columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>sNo</code> - Serial Number (for reference only)</li>
                  <li><code>frequency</code> - Review Frequency (Daily, Weekly, Monthly, Quarterly, Half-Yearly, Yearly)</li>
                  <li><code>sourceOfData</code> - Data Source (SAP, Excel, etc.)</li>
                  <li><code>targetAchieved</code>, <code>rating</code>, <code>achievedWeight</code>, <code>kpiWeightageScore</code> - Achievement data</li>
                  <li><code>employeeTargetAchieved</code>, <code>employeeRating</code>, <code>employeeRemarks</code> - Self review data</li>
                  <li><code>managerTargetAchieved</code>, <code>managerRating</code>, <code>managerRemarks</code> - Manager review data</li>
                  <li><code>auditTargetAchieved</code>, <code>auditRating</code>, <code>auditRemarks</code> - Audit review data</li>
                </ul>
                <Alert className="mt-4">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    New categories and org structure nodes will be automatically created. Ratings are auto-calculated using R5-R0 thresholds.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 max-h-32 overflow-auto">
                  {errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Real-time Progress Bar */}
          {isImporting && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="font-medium">Importing data...</span>
                    </div>
                    <span className="text-muted-foreground">
                      {importProgress.current} / {importProgress.total}
                    </span>
                  </div>
                  
                  <Progress 
                    value={importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0} 
                    className="h-2"
                  />
                  
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="rounded-lg bg-muted p-3">
                      <div className="text-2xl font-bold text-primary">{importProgress.kpisImported}</div>
                      <div className="text-xs text-muted-foreground">KPIs Imported</div>
                    </div>
                    <div className="rounded-lg bg-muted p-3">
                      <div className="text-2xl font-bold text-green-600">{importProgress.employeesCreated}</div>
                      <div className="text-xs text-muted-foreground">Employees Created</div>
                    </div>
                    <div className="rounded-lg bg-muted p-3">
                      <div className="text-2xl font-bold text-blue-600">{importProgress.categoriesCreated}</div>
                      <div className="text-xs text-muted-foreground">Categories Created</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {kpiImportResults && kpiImportResults.length > 0 && (
            <ImportResultsSummary
              results={kpiImportResults}
              importType="kpi"
              onDismiss={() => { setKpiImportResults(null); setImportSuccess(0); }}
            />
          )}

          {importData.length > 0 && (
            <>
              {/* Data Summary - Debug Info */}
              <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
                <CardHeader>
                  <CardTitle className="text-blue-700 dark:text-blue-300">📊 Data Summary</CardTitle>
                  <CardDescription>Overview of employees and months in the uploaded file</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Months Summary */}
                  <div>
                    <p className="font-medium text-sm mb-2">Months Found:</p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(importData.map(r => r.month || 'No Month'))).sort().map(month => {
                        const count = importData.filter(r => (r.month || 'No Month') === month).length;
                        return (
                          <Badge key={month} variant="secondary" className="text-xs">
                            {month} ({count} rows)
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Employee Summary per Month */}
                  <div>
                    <p className="font-medium text-sm mb-2">Employees per Month:</p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {Array.from(new Set(importData.map(r => r.month || 'No Month'))).sort().map(month => {
                        const monthRows = importData.filter(r => (r.month || 'No Month') === month);
                        const employees = Array.from(new Set(monthRows.map(r => `${r.newCode}|${r.fullName}`)));
                        return (
                          <div key={month} className="rounded-lg border p-3 bg-background">
                            <div className="font-medium text-sm">{month}</div>
                            <div className="text-xs text-muted-foreground">{employees.length} unique employees, {monthRows.length} KPIs</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Search for specific employee */}
                  <div>
                    <p className="font-medium text-sm mb-2">Search for Employee:</p>
                    <Input 
                      placeholder="Enter employee code or name..."
                      value={employeeSearchQuery}
                      onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                      className="mb-2 max-w-sm"
                    />
                    {employeeSearchQuery.trim() && (
                      <div className="max-h-48 overflow-auto rounded border p-2 bg-background text-xs font-mono">
                        {importData
                          .filter(r => {
                            const query = employeeSearchQuery.toLowerCase().trim();
                            return r.fullName?.toLowerCase().includes(query) || 
                                   r.newCode?.toLowerCase().includes(query);
                          })
                          .slice(0, 50)
                          .map((r, i) => (
                            <div key={i} className="py-1 border-b last:border-0">
                              <span className="text-blue-600">{r.month}</span> | 
                              Code: <span className="text-green-600">{r.newCode}</span> | 
                              Name: <span className="text-purple-600">{r.fullName}</span> | 
                              KPI: {r.kpi?.substring(0, 40)}...
                            </div>
                          ))}
                        {importData.filter(r => {
                          const query = employeeSearchQuery.toLowerCase().trim();
                          return r.fullName?.toLowerCase().includes(query) || 
                                 r.newCode?.toLowerCase().includes(query);
                        }).length === 0 && (
                          <div className="text-muted-foreground">No rows found matching "{employeeSearchQuery}"</div>
                        )}
                        {importData.filter(r => {
                          const query = employeeSearchQuery.toLowerCase().trim();
                          return r.fullName?.toLowerCase().includes(query) || 
                                 r.newCode?.toLowerCase().includes(query);
                        }).length > 50 && (
                          <div className="text-muted-foreground mt-1">Showing first 50 results...</div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Preview</CardTitle>
                    <CardDescription>{importData.length} rows to import</CardDescription>
                  </div>
                  <Button onClick={handleImport} disabled={isImporting || errors.length > 0}>
                    {isImporting ? 'Importing...' : `Import ${importData.length} KPIs`}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Employee</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>KRA</TableHead>
                          <TableHead>KPI</TableHead>
                          <TableHead>UOM</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Criteria</TableHead>
                          <TableHead>R5</TableHead>
                          <TableHead>R4</TableHead>
                          <TableHead>R3</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Month</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importData.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{row.newCode}</TableCell>
                            <TableCell>{row.fullName}</TableCell>
                            <TableCell>{row.category}</TableCell>
                            <TableCell>{row.kra}</TableCell>
                            <TableCell className="max-w-[150px] truncate">{row.kpi}</TableCell>
                            <TableCell>{row.uom || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={row.uomType === 'binary' ? 'secondary' : row.uomType === 'tiered' ? 'outline' : 'default'} className="text-xs">
                                {row.uomType || 'numeric'}
                              </Badge>
                            </TableCell>
                            <TableCell>{row.target}</TableCell>
                            <TableCell className="text-xs">{row.criteria || 'Higher'}</TableCell>
                            <TableCell>{row.r5 || '-'}</TableCell>
                            <TableCell>{row.r4 || '-'}</TableCell>
                            <TableCell>{row.r3 || '-'}</TableCell>
                            <TableCell>{row.kpiWeightage || row.kpiWeightageScore || '-'}</TableCell>
                            <TableCell>{row.month || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {importData.length > 10 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Showing first 10 of {importData.length} rows
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
