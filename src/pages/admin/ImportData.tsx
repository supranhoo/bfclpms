import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfiles, useKraCategories, useDepartments, useDivisions, useBusinessUnits } from '@/hooks/useOrganization';
import { useCreateKpi } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { FileSpreadsheet, AlertCircle, CheckCircle2, Download, Users, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

type RatingLevel = 'red' | 'yellow' | 'green' | 'blue';

// Map numeric rating (0-5) to rating level enum
const mapScoreToRating = (score: number | string | null | undefined): RatingLevel | null => {
  if (score === null || score === undefined || score === '') return null;
  const numScore = typeof score === 'string' ? parseFloat(score) : score;
  if (isNaN(numScore)) return null;
  
  if (numScore >= 4.5) return 'blue';    // Exceptional (5)
  if (numScore >= 3.5) return 'green';   // Good (4)
  if (numScore >= 2.5) return 'yellow';  // Average (3)
  return 'red';                           // Below (1-2)
};

// Determine KPI status based on review data
const determineKpiStatus = (row: KpiImportRow): 'open' | 'submitted' | 'approved_by_manager' | 'locked' => {
  if (row.auditRating || row.auditTargetAchieved) return 'locked';
  if (row.managerRating || row.managerTargetAchieved) return 'approved_by_manager';
  if (row.employeeRating || row.employeeTargetAchieved || row.targetAchieved) return 'submitted';
  return 'open';
};

// Determine review status based on review data
const determineReviewStatus = (row: KpiImportRow): 'kra_set' | 'self_review' | 'manager_check' | 'audit' | 'approved' => {
  if (row.auditRating || row.auditTargetAchieved) return 'approved';
  if (row.managerRating || row.managerTargetAchieved) return 'audit';
  if (row.employeeRating || row.employeeTargetAchieved || row.targetAchieved) return 'manager_check';
  return 'kra_set';
};

interface KpiImportRow {
  sNo?: number;
  month?: string;
  reviewStatus?: string;
  newCode: string;
  fullName: string;
  category: string;
  kra: string;
  kpi: string;
  target: string | number;
  uom?: string;
  frequency?: string;
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
}

interface EmployeeImportRow {
  employeeCode: string;
  fullName: string;
  email: string;
  designation?: string;
  division?: string;
  businessUnit?: string;
  department?: string;
  pmsGrade?: string;
  managerEmployeeId?: string;
  managerName?: string;
}

export default function ImportData() {
  const queryClient = useQueryClient();
  const { data: profiles, refetch: refetchProfiles } = useProfiles();
  const { data: categories, refetch: refetchCategories } = useKraCategories();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();
  const { data: departments } = useDepartments();
  const createKpi = useCreateKpi();
  const { toast } = useToast();

  // KPI Import State
  const [importData, setImportData] = useState<KpiImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(0);
  
  // Real-time progress tracking
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    kpisImported: 0,
    employeesCreated: 0,
    categoriesCreated: 0,
  });

  // Employee Import State
  const [employeeData, setEmployeeData] = useState<EmployeeImportRow[]>([]);
  const [employeeErrors, setEmployeeErrors] = useState<string[]>([]);
  const [isImportingEmployees, setIsImportingEmployees] = useState(false);
  const [employeeImportSuccess, setEmployeeImportSuccess] = useState(0);

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
    const formatRatingThreshold = (value: any): string | undefined => {
      if (value === null || value === undefined || value === '') return undefined;
      const strValue = String(value).trim();
      
      // If it's already a percentage string, keep it as-is
      if (strValue.includes('%')) return strValue;
      
      const numValue = parseFloat(strValue);
      if (isNaN(numValue)) return strValue;
      
      // If value is between 0 and 1 (exclusive), treat as decimal percentage (Excel format)
      // e.g., 0.5 → 50%, 0.85 → 85%, 1.0 → 100%
      if (numValue > 0 && numValue <= 1) {
        return `${(numValue * 100).toFixed(0)}%`;
      }
      
      // If value is > 1 and <= 100, treat as already a percentage value
      // e.g., 50 → 50%, 100 → 100%, 85 → 85%
      if (numValue > 1 && numValue <= 100) {
        return `${numValue.toFixed(0)}%`;
      }
      
      // For values > 100, keep as-is (could be actual target numbers)
      return strValue;
    };

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
      frequency: getValue(['frequency', 'freq', 'reviewFrequency']),
      kpiWeightage: getValue(['kpiWeightage', 'kpi_weightage', 'weightage', 'weight']),
      criteria: getValue(['criteria', 'scoringCriteria', 'scoring_criteria']),
      // Rating thresholds - format for display
      r5: formatRatingThreshold(getValue(['r5', 'R5', 'rating5', 'outstanding'])),
      r4: formatRatingThreshold(getValue(['r4', 'R4', 'rating4', 'exceeds'])),
      r3: formatRatingThreshold(getValue(['r3', 'R3', 'rating3', 'meets'])),
      r2: formatRatingThreshold(getValue(['r2', 'R2', 'rating2', 'below'])),
      r1: formatRatingThreshold(getValue(['r1', 'R1', 'rating1', 'poor'])),
      r0: formatRatingThreshold(getValue(['r0', 'R0', 'rating0'])),
      // Achievement data - key fix: look for "Achieved" column
      targetAchieved: parseNumericValue(getValue(['targetAchieved', 'target_achieved', 'achieved', 'achievedValue', 'achieved_value', 'actualValue', 'actual'])),
      achievedWeight: getValue(['achievedWeight', 'achieved_weight', 'achievedWt']),
      rating: getValue(['rating', 'selfRating', 'self_rating']),
      kpiWeightageScore: getValue(['kpiWeightageScore', 'kpi_weightage_score', 'weightageScore']),
      // Self review
      employeeTargetAchieved: parseNumericValue(getValue(['employeeTargetAchieved', 'employee_target_achieved', 'empAchieved', 'selfAchieved'])),
      employeeRating: getValue(['employeeRating', 'employee_rating', 'empRating', 'selfRating']),
      employeeRemarks: getValue(['employeeRemarks', 'employee_remarks', 'empRemarks', 'selfRemarks']),
      // Manager review
      managerTargetAchieved: parseNumericValue(getValue(['managerTargetAchieved', 'manager_target_achieved', 'mgrAchieved'])),
      managerRating: getValue(['managerRating', 'manager_rating', 'mgrRating']),
      managerRemarks: getValue(['managerRemarks', 'manager_remarks', 'mgrRemarks']),
      // Audit review
      auditTargetAchieved: parseNumericValue(getValue(['auditTargetAchieved', 'audit_target_achieved', 'auditorAchieved'])),
      auditRating: getValue(['auditRating', 'audit_rating', 'auditorRating']),
      auditRemarks: getValue(['auditRemarks', 'audit_remarks', 'auditorRemarks']),
      sourceOfData: getValue(['sourceOfData', 'source_of_data', 'dataSource', 'source']),
      kpiStatus: getValue(['kpiStatus', 'kpi_status']),
    };
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
        
        // Normalize all rows to handle column name variations
        const jsonData = rawData.map(normalizeKpiRow);

        // Validate data
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
      designation: getValue(['designation', 'title', 'position', 'role', 'jobTitle', 'jobtitle', 'job_title']),
      division: getValue(['division', 'div']),
      businessUnit: getValue(['businessUnit', 'businessunit', 'business_unit', 'bu', 'unit']),
      department: getValue(['department', 'dept', 'dep', 'departmentName', 'departmentname', 'department_name']),
      pmsGrade: getValue(['pmsGrade', 'pmsgrade', 'pms_grade', 'grade', 'level']),
      managerEmployeeId: getValue(['managerEmployeeId', 'manageremployeeid', 'manager_employee_id', 'managerId', 'managerid', 'manager_id', 'reportingTo', 'reportingto', 'reporting_to', 'reportsTo', 'reportsto', 'reports_to']),
      managerName: getValue(['managerName', 'managername', 'manager_name', 'reportingManager', 'reportingmanager', 'reporting_manager', 'supervisor']),
    };
  };

  const handleEmployeeFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
        
        // Normalize all rows
        const jsonData = rawData.map(normalizeEmployeeRow);

        // Validate data - email is only required for new users, not updates
        const validationErrors: string[] = [];
        jsonData.forEach((row, index) => {
          if (!row.employeeCode && !row.fullName) {
            validationErrors.push(`Row ${index + 2}: Missing employee code and full name`);
          }
          // Email validation only if provided (it's optional for updates)
          if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            validationErrors.push(`Row ${index + 2}: Invalid email format`);
          }
        });

        setEmployeeErrors(validationErrors);
        setEmployeeData(jsonData);
        setEmployeeImportSuccess(0);
      } catch (error) {
        toast({ title: 'Failed to parse file', description: 'Please upload a valid Excel file', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast]);

  const handleImport = async () => {
    if (importData.length === 0) return;

    setIsImporting(true);
    let successCount = 0;
    let categoriesCreated = 0;
    let employeesCreated = 0;
    const importErrors: string[] = [];
    
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
    
    // Pre-populate cache with existing employees
    profiles?.forEach(p => {
      if (p.employee_code) {
        employeeCache.set(p.employee_code.toLowerCase(), { id: p.id });
      }
      if (p.full_name) {
        employeeCache.set(p.full_name.toLowerCase(), { id: p.id });
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
        // Find employee by code or name from cache
        let employee = profiles?.find(p => 
          (p.employee_code && p.employee_code === String(row.newCode)) ||
          (p.full_name && p.full_name.toLowerCase() === row.fullName?.toLowerCase())
        );

        // If not found in original profiles, check cache (for newly created employees)
        if (!employee && row.newCode) {
          const cached = employeeCache.get(String(row.newCode).toLowerCase());
          if (cached) {
            employee = { id: cached.id } as any;
          }
        }
        if (!employee && row.fullName) {
          const cached = employeeCache.get(row.fullName.toLowerCase());
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
            continue;
          }
        }
        
        if (!employee) {
          importErrors.push(`Employee not found and could not be created: ${row.newCode} - ${row.fullName}`);
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
            weightage: row.kpiWeightage || row.kpiWeightageScore || 0,
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
          })
          .select('id')
          .single();

        if (kpiError) throw kpiError;

        // Create review_submission if there's any review data
        const hasReviewData = row.targetAchieved || row.employeeTargetAchieved || 
          row.employeeRating || row.managerRating || row.auditRating ||
          row.rating || row.managerTargetAchieved || row.auditTargetAchieved;

        if (hasReviewData && newKpi?.id) {
          const achievedValue = row.targetAchieved || row.employeeTargetAchieved || row.auditTargetAchieved || row.managerTargetAchieved;
          const selfScore = row.employeeRating || row.rating;
          const managerScore = row.managerRating;
          const auditorScore = row.auditRating;
          
          // Check if achieved value is N/A
          const achievedStr = String(achievedValue || '').trim().toLowerCase();
          const isNa = achievedStr === 'na' || achievedStr === 'n/a' || achievedStr === 'not applicable' || achievedStr === '-';
          
          // Parse achieved value (only if not N/A)
          const parsedAchieved = isNa ? null : (achievedValue 
            ? parseFloat(String(achievedValue).replace('%', '').replace(/,/g, ''))
            : null);

          const { error: submissionError } = await supabase
            .from('review_submissions')
            .insert({
              kpi_id: newKpi.id,
              achieved_value: parsedAchieved,
              self_score: isNa ? null : (selfScore ? parseFloat(String(selfScore)) : null),
              self_rating: isNa ? null : mapScoreToRating(selfScore),
              self_remarks: row.employeeRemarks || null,
              manager_score: isNa ? null : (managerScore ? parseFloat(String(managerScore)) : null),
              manager_rating: isNa ? null : mapScoreToRating(managerScore),
              manager_remarks: row.managerRemarks || null,
              auditor_score: isNa ? null : (auditorScore ? parseFloat(String(auditorScore)) : null),
              auditor_rating: isNa ? null : mapScoreToRating(auditorScore),
              auditor_remarks: row.auditRemarks || null,
              kpi_status: determineKpiStatus(row),
              is_na: isNa,
              // Use auditor score as final if available, else manager, else self
              final_score: isNa ? null : (auditorScore ? parseFloat(String(auditorScore)) : 
                (managerScore ? parseFloat(String(managerScore)) : 
                (selfScore ? parseFloat(String(selfScore)) : null))),
              final_rating: isNa ? null : mapScoreToRating(auditorScore || managerScore || selfScore),
            });

          if (submissionError) {
            console.error('Failed to create review submission:', submissionError);
          }
        }

        successCount++;
        setImportProgress(prev => ({
          ...prev,
          kpisImported: prev.kpisImported + 1,
        }));
      } catch (error: any) {
        importErrors.push(`Failed to import KPI for ${row.fullName}: ${error.message}`);
      }
    }

    setImportSuccess(successCount);
    setErrors(importErrors);
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

    setIsImportingEmployees(true);
    let successCount = 0;
    const importErrors: string[] = [];

    for (const row of employeeData) {
      try {
        // Check if employee already exists by email or employee code or full name
        const existingEmployee = profiles?.find(p => 
          (row.email && p.email.toLowerCase() === row.email.toLowerCase()) ||
          (row.employeeCode && p.employee_code && p.employee_code === String(row.employeeCode)) ||
          (row.fullName && p.full_name && p.full_name.toLowerCase() === row.fullName.toLowerCase())
        );

        if (existingEmployee) {
          // Update existing profile
          const departmentId = departments?.find(d => 
            d.name.toLowerCase() === row.department?.toLowerCase()
          )?.id || null;

          const managerId = profiles?.find(p => 
            p.employee_code === row.managerEmployeeId ||
            (row.managerName && p.full_name?.toLowerCase() === row.managerName?.toLowerCase())
          )?.id || null;

          const { error } = await supabase
            .from('profiles')
            .update({
              employee_code: row.employeeCode ? String(row.employeeCode) : existingEmployee.employee_code,
              full_name: row.fullName || existingEmployee.full_name,
              designation: row.designation || existingEmployee.designation,
              department_id: departmentId || existingEmployee.department_id,
              pms_grade: row.pmsGrade || existingEmployee.pms_grade,
              reporting_manager_id: managerId || existingEmployee.reporting_manager_id,
            })
            .eq('id', existingEmployee.id);

          if (error) throw error;
          successCount++;
        } else if (row.email) {
          // Create new user only if email is provided
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: row.email,
            password: `Welcome@${row.employeeCode || 'User123'}`,
            email_confirm: true,
            user_metadata: {
              full_name: row.fullName,
            },
          });

          let newUserId: string | null = null;

          if (authError) {
            // If admin API fails, try regular signup
            const { data: signupData, error: signupError } = await supabase.auth.signUp({
              email: row.email,
              password: `Welcome@${row.employeeCode || 'User123'}`,
              options: {
                data: {
                  full_name: row.fullName,
                },
              },
            });
            if (signupError) throw signupError;
            newUserId = signupData.user?.id || null;
          } else {
            newUserId = authData.user?.id || null;
          }

          // Wait a moment for the trigger to create the profile
          await new Promise(resolve => setTimeout(resolve, 500));

          // Update the profile with additional details
          const departmentId = departments?.find(d => 
            d.name.toLowerCase() === row.department?.toLowerCase()
          )?.id || null;

          const managerId = profiles?.find(p => 
            p.employee_code === row.managerEmployeeId ||
            (row.managerName && p.full_name?.toLowerCase() === row.managerName?.toLowerCase())
          )?.id || null;

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              employee_code: String(row.employeeCode),
              designation: row.designation || null,
              department_id: departmentId,
              pms_grade: row.pmsGrade || null,
              reporting_manager_id: managerId,
            })
            .eq('email', row.email);

          if (updateError) throw updateError;

          // Assign default 'employee' role to new user
          if (newUserId) {
            // Check if role already exists
            const { data: existingRole } = await supabase
              .from('user_roles')
              .select('id')
              .eq('user_id', newUserId)
              .maybeSingle();

            if (!existingRole) {
              const { error: roleError } = await supabase
                .from('user_roles')
                .insert({
                  user_id: newUserId,
                  role: 'employee',
                });

              if (roleError) {
                console.error('Failed to assign role:', roleError);
              }
            }
          }

          successCount++;
        } else {
          // No email provided and employee not found - skip with warning
          importErrors.push(`Skipped ${row.fullName || row.employeeCode}: Employee not found and no email provided to create new user`);
        }
      } catch (error: any) {
        importErrors.push(`Failed to import ${row.fullName || row.employeeCode}: ${error.message}`);
      }
    }

    // Second pass: Identify managers from import data and assign 'manager' role
    // Collect all manager employee IDs/names from the import data
    const managerIdentifiers = new Set<string>();
    employeeData.forEach(row => {
      if (row.managerEmployeeId) managerIdentifiers.add(row.managerEmployeeId.toLowerCase());
      if (row.managerName) managerIdentifiers.add(row.managerName.toLowerCase());
    });

    // Refetch profiles to get latest data including newly created users
    const { data: updatedProfiles } = await supabase
      .from('profiles')
      .select('id, employee_code, full_name, email');

    if (updatedProfiles && managerIdentifiers.size > 0) {
      for (const profile of updatedProfiles) {
        const isManager = 
          (profile.employee_code && managerIdentifiers.has(profile.employee_code.toLowerCase())) ||
          (profile.full_name && managerIdentifiers.has(profile.full_name.toLowerCase()));

        if (isManager) {
          // Check current role
          const { data: existingRole } = await supabase
            .from('user_roles')
            .select('id, role')
            .eq('user_id', profile.id)
            .maybeSingle();

          if (existingRole) {
            // Update to manager if currently employee
            if (existingRole.role === 'employee') {
              await supabase
                .from('user_roles')
                .update({ role: 'manager' })
                .eq('id', existingRole.id);
            }
          } else {
            // Insert manager role
            await supabase
              .from('user_roles')
              .insert({ user_id: profile.id, role: 'manager' });
          }
        }
      }
    }

    setEmployeeImportSuccess(successCount);
    setEmployeeErrors(importErrors);
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
        month: 'Dec-25',
        reviewStatus: 'Pending',
        newCode: '100001',
        fullName: 'John Doe',
        category: 'Financial Performance',
        kra: 'Revenue Growth',
        kpi: 'Monthly Revenue Target',
        uom: '%',
        frequency: 'Monthly',
        kpiWeightage: 25,
        criteria: 'Higher is Better',
        target: '100',
        r5: '120',
        r4: '110',
        r3: '100',
        r2: '90',
        r1: '80',
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
        sourceOfData: 'SAP',
        kpiStatus: 'Active',
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
        division: 'Operations',
        businessUnit: 'Plant',
        department: 'HR',
        pmsGrade: 'A',
        managerEmployeeId: '100002',
        managerName: 'Jane Smith',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Template');
    XLSX.writeFile(wb, 'employee_import_template.xlsx');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground">Bulk import Employees and KRAs from Excel</p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Import Employees</TabsTrigger>
          <TabsTrigger value="kpis">Import PMS Data</TabsTrigger>
        </TabsList>

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
              <div className="flex gap-4">
                <Button variant="outline" onClick={downloadEmployeeTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleEmployeeFileUpload}
                    className="cursor-pointer"
                  />
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
                  <li><code>division</code> - Division Name</li>
                  <li><code>businessUnit</code> - Business Unit Name</li>
                  <li><code>department</code> - Department Name (must exist in system)</li>
                  <li><code>pmsGrade</code> - PMS Grade</li>
                  <li><code>managerEmployeeId</code> - Manager's Employee Code</li>
                  <li><code>managerName</code> - Manager's Full Name</li>
                </ul>
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    New employees will be created with default password: <code>Welcome@[EmployeeCode]</code>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {employeeErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 max-h-32 overflow-auto">
                  {employeeErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {employeeImportSuccess > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                Successfully imported {employeeImportSuccess} employees.
              </AlertDescription>
            </Alert>
          )}

          {employeeData.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>{employeeData.length} employees to import</CardDescription>
                </div>
                <Button onClick={handleEmployeeImport} disabled={isImportingEmployees || employeeErrors.length > 0}>
                  {isImportingEmployees ? 'Importing...' : `Import ${employeeData.length} Employees`}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead>Business Unit</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Manager ID</TableHead>
                        <TableHead>Manager Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.employeeCode}</TableCell>
                          <TableCell>{row.fullName}</TableCell>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>{row.designation || '-'}</TableCell>
                          <TableCell>{row.division || '-'}</TableCell>
                          <TableCell>{row.businessUnit || '-'}</TableCell>
                          <TableCell>{row.department || '-'}</TableCell>
                          <TableCell>{row.pmsGrade || '-'}</TableCell>
                          <TableCell>{row.managerEmployeeId || '-'}</TableCell>
                          <TableCell>{row.managerName || '-'}</TableCell>
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
              <div className="flex gap-4">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="cursor-pointer"
                  />
                </div>
              </div>

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
                  <li><code>r5</code>, <code>r4</code>, <code>r3</code>, <code>r2</code>, <code>r1</code> - Rating thresholds (5=Exceptional, 1=Needs Improvement)</li>
                  <li><code>uom</code> - Unit of Measure (%, ₹, units, etc.)</li>
                  <li><code>kpiWeightage</code> - KPI Weightage (0-100)</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Optional columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>frequency</code> - Review Frequency (Monthly, Quarterly, etc.)</li>
                  <li><code>sourceOfData</code> - Data Source (SAP, Excel, etc.)</li>
                  <li><code>targetAchieved</code>, <code>rating</code> - Achievement data</li>
                  <li><code>employeeRemarks</code>, <code>managerRemarks</code>, <code>auditRemarks</code></li>
                </ul>
                <Alert className="mt-4">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    New categories will be automatically created. Ratings are auto-calculated using R5-R0 thresholds.
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

          {importSuccess > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                Successfully imported {importSuccess} KPIs.
              </AlertDescription>
            </Alert>
          )}

          {importData.length > 0 && (
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
