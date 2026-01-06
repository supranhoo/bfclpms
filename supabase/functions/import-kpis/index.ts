import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RatingLevel = 'red' | 'yellow' | 'green' | 'blue';

// Server-side validation schema matching client-side limits
const MAX_TEXT_LENGTH = 1000;
const MAX_REMARKS_LENGTH = 2000;
const MAX_ROWS = 10000;

const optionalNumber = (opts?: { min?: number; max?: number }) => {
  let base = z.number();
  if (opts?.min !== undefined) base = base.min(opts.min);
  if (opts?.max !== undefined) base = base.max(opts.max);

  return z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace('%', '').trim());
    return Number.isFinite(n) ? n : v;
  }, base.optional());
};

const optionalString = (max: number) =>
  z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined;
    return String(v);
  }, z.string().max(max).optional());

const KpiImportRowSchema = z.object({
  sNo: z.union([z.number(), z.string()]).optional(),
  month: optionalString(MAX_TEXT_LENGTH),
  reviewStatus: optionalString(100),
  newCode: z.string().min(1).max(100),
  fullName: z.string().min(1).max(MAX_TEXT_LENGTH),
  category: z.string().min(1).max(MAX_TEXT_LENGTH),
  kra: z.string().min(1).max(MAX_TEXT_LENGTH),
  kpi: z.string().min(1).max(MAX_TEXT_LENGTH),
  target: z.union([z.string(), z.number()]).optional(),
  uom: optionalString(100),
  frequency: optionalString(100),
  kpiWeightage: optionalNumber({ min: 0, max: 100 }),
  criteria: optionalString(100),
  r5: z.union([z.string(), z.number()]).optional(),
  r4: z.union([z.string(), z.number()]).optional(),
  r3: z.union([z.string(), z.number()]).optional(),
  r2: z.union([z.string(), z.number()]).optional(),
  r1: z.union([z.string(), z.number()]).optional(),
  r0: z.union([z.string(), z.number()]).optional(),
  targetAchieved: z.union([z.string(), z.number()]).optional(),
  achievedWeight: optionalString(100),
  rating: optionalNumber({ min: 0, max: 10 }),
  kpiWeightageScore: optionalNumber({ min: 0, max: 500 }),
  employeeTargetAchieved: z.union([z.string(), z.number()]).optional(),
  employeeRating: optionalNumber({ min: 0, max: 10 }),
  employeeRemarks: optionalString(MAX_REMARKS_LENGTH),
  managerTargetAchieved: z.union([z.string(), z.number()]).optional(),
  managerRating: optionalNumber({ min: 0, max: 10 }),
  managerRemarks: optionalString(MAX_REMARKS_LENGTH),
  auditTargetAchieved: z.union([z.string(), z.number()]).optional(),
  auditRating: optionalNumber({ min: 0, max: 10 }),
  auditRemarks: optionalString(MAX_REMARKS_LENGTH),
  sourceOfData: optionalString(MAX_TEXT_LENGTH),
  kpiStatus: optionalString(100),
  // Organization structure fields
  division: optionalString(MAX_TEXT_LENGTH),
  businessUnit: optionalString(MAX_TEXT_LENGTH),
  department: optionalString(MAX_TEXT_LENGTH),
  subBranch: optionalString(MAX_TEXT_LENGTH),
});

type KpiImportRow = z.infer<typeof KpiImportRowSchema>;

// Sanitize text to prevent XSS and Excel formula injection
const sanitizeText = (text: string | undefined | null): string => {
  if (!text) return '';

  let sanitized = String(text);

  // Remove leading characters that could trigger Excel formula execution
  sanitized = sanitized.replace(/^[=+\-@\t\r]/, '');

  // Remove script tags and dangerous content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[\"'][^\"']*[\"']/gi, '');

  // Remove javascript: URIs
  sanitized = sanitized.replace(/javascript\s*:/gi, '');

  return sanitized.trim();
};

// Truncate text to max length
const truncateText = (text: string | undefined | null, maxLength: number): string => {
  if (!text) return '';
  const str = String(text);
  return str.length > maxLength ? str.slice(0, maxLength).trim() : str.trim();
};

// Validate and sanitize a row, returns null if invalid
const validateAndSanitizeRow = (row: unknown, index: number): { data: KpiImportRow | null; error: string | null } => {
  try {
    // First, parse with Zod for type validation
    const parsed = KpiImportRowSchema.parse(row);

    // Then apply sanitization
    const sanitized: KpiImportRow = {
      ...parsed,
      month: parsed.month ? truncateText(sanitizeText(parsed.month), MAX_TEXT_LENGTH) : undefined,
      newCode: truncateText(sanitizeText(parsed.newCode), 100),
      fullName: truncateText(sanitizeText(parsed.fullName), MAX_TEXT_LENGTH),
      category: truncateText(sanitizeText(parsed.category), MAX_TEXT_LENGTH),
      kra: truncateText(sanitizeText(parsed.kra), MAX_TEXT_LENGTH),
      kpi: truncateText(sanitizeText(parsed.kpi), MAX_TEXT_LENGTH),
      uom: parsed.uom ? truncateText(sanitizeText(parsed.uom), 100) : undefined,
      frequency: parsed.frequency ? truncateText(sanitizeText(parsed.frequency), 100) : undefined,
      criteria: parsed.criteria ? truncateText(sanitizeText(parsed.criteria), 100) : undefined,
      employeeRemarks: parsed.employeeRemarks ? truncateText(sanitizeText(parsed.employeeRemarks), MAX_REMARKS_LENGTH) : undefined,
      managerRemarks: parsed.managerRemarks ? truncateText(sanitizeText(parsed.managerRemarks), MAX_REMARKS_LENGTH) : undefined,
      auditRemarks: parsed.auditRemarks ? truncateText(sanitizeText(parsed.auditRemarks), MAX_REMARKS_LENGTH) : undefined,
      sourceOfData: parsed.sourceOfData ? truncateText(sanitizeText(parsed.sourceOfData), MAX_TEXT_LENGTH) : undefined,
      division: parsed.division ? truncateText(sanitizeText(parsed.division), MAX_TEXT_LENGTH) : undefined,
      businessUnit: parsed.businessUnit ? truncateText(sanitizeText(parsed.businessUnit), MAX_TEXT_LENGTH) : undefined,
      department: parsed.department ? truncateText(sanitizeText(parsed.department), MAX_TEXT_LENGTH) : undefined,
      subBranch: parsed.subBranch ? truncateText(sanitizeText(parsed.subBranch), MAX_TEXT_LENGTH) : undefined,
    };

    return { data: sanitized, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      return { data: null, error: `Row ${index + 1}: Validation failed - ${issues}` };
    }
    return { data: null, error: `Row ${index + 1}: Unknown validation error` };
  }
};

const mapScoreToRating = (score: number | string | null | undefined): RatingLevel | null => {
  if (score === null || score === undefined || score === '') return null;
  const numScore = typeof score === 'string' ? parseFloat(score) : score;
  if (isNaN(numScore)) return null;
  if (numScore >= 4.5) return 'blue';
  if (numScore >= 3.5) return 'green';
  if (numScore >= 2.5) return 'yellow';
  return 'red';
};

const determineReviewStatus = (row: KpiImportRow): 'kra_set' | 'self_review' | 'manager_check' | 'audit' | 'approved' => {
  if (row.auditRating || row.auditTargetAchieved) return 'approved';
  if (row.managerRating || row.managerTargetAchieved) return 'audit';
  if (row.employeeRating || row.employeeTargetAchieved || row.targetAchieved) return 'manager_check';
  return 'kra_set';
};

const determineKpiStatus = (row: KpiImportRow): 'open' | 'submitted' | 'approved_by_manager' | 'locked' => {
  if (row.auditRating || row.auditTargetAchieved) return 'locked';
  if (row.managerRating || row.managerTargetAchieved) return 'approved_by_manager';
  if (row.employeeRating || row.employeeTargetAchieved || row.targetAchieved) return 'submitted';
  return 'open';
};

const parseReviewPeriod = (monthStr: string): { period: string | null; year: number } => {
  let reviewPeriod: string | null = null;
  let reviewYear = new Date().getFullYear();
  const trimmed = monthStr.trim();
  
  const serialNum = parseInt(trimmed);
  if (!isNaN(serialNum) && serialNum > 40000 && serialNum < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + serialNum * 24 * 60 * 60 * 1000);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    reviewPeriod = monthNames[date.getMonth()];
    reviewYear = date.getFullYear();
  } else if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    const shortMonths: Record<string, string> = {
      'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April',
      'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August',
      'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December'
    };
    reviewPeriod = shortMonths[parts[0].toLowerCase()] || parts[0];
    if (parts[1]) {
      const yearNum = parseInt(parts[1]);
      reviewYear = yearNum < 100 ? 2000 + yearNum : yearNum;
    }
  } else if (trimmed.includes(' ')) {
    const parts = trimmed.split(' ');
    reviewPeriod = parts[0];
    const yearPart = parts.pop();
    if (yearPart) {
      const yearNum = parseInt(yearPart);
      if (!isNaN(yearNum)) reviewYear = yearNum < 100 ? 2000 + yearNum : yearNum;
    }
  } else {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    reviewPeriod = monthNames.find(m => 
      m.toLowerCase() === trimmed.toLowerCase() || 
      m.toLowerCase().startsWith(trimmed.toLowerCase().substring(0, 3))
    ) || trimmed;
  }
  return { period: reviewPeriod, year: reviewYear };
};

// Format rating threshold values (R1-R5) from Excel
// Excel percentage cells are read as decimals: 140% -> 1.4, 99.95% -> 0.9995
// We need to convert these back to percentage format for display
const formatRatingThreshold = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null;
  
  const strValue = String(value).trim();
  
  // If already has % sign, it's already formatted - just preserve it
  if (strValue.includes('%')) {
    const numPart = parseFloat(strValue.replace('%', '').replace(',', '.'));
    if (isNaN(numPart)) return strValue;
    return Number.isInteger(numPart) ? `${numPart}%` : `${numPart.toFixed(2).replace(/\.?0+$/, '')}%`;
  }
  
  // Parse the numeric value
  const num = typeof value === 'number' ? value : parseFloat(strValue.replace(',', '.'));
  if (isNaN(num)) return strValue;
  
  // If it's 0, store as "0" (absolute mode for target=0 KPIs)
  if (num === 0) return '0';
  
  // Excel sends percentage-formatted cells as decimals:
  // 140% -> 1.4, 100% -> 1.0, 99.95% -> 0.9995, 77.78% -> 0.7778
  // So we multiply by 100 to get the actual percentage value
  // This applies to ALL decimal values from Excel percentage cells
  const percentValue = num * 100;
  return Number.isInteger(percentValue) ? `${percentValue}%` : `${percentValue.toFixed(2).replace(/\.?0+$/, '')}%`;
};

const getRandomColor = () => {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Batch size for bulk operations
const BATCH_SIZE = 100;

// Helper to chunk array
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Update progress in database
async function updateProgress(
  supabaseAdmin: any,
  importId: string,
  updates: {
    status?: string;
    processed_rows?: number;
    kpis_imported?: number;
    employees_created?: number;
    categories_created?: number;
    errors?: string[];
    completed_at?: string;
  }
) {
  try {
    const updateData: any = { ...updates };
    if (updates.errors) {
      updateData.errors = JSON.stringify(updates.errors.slice(0, 50)); // Limit to 50 errors
    }
    
    await supabaseAdmin
      .from('import_progress')
      .update(updateData)
      .eq('id', importId);
  } catch (e) {
    console.error(`[${importId}] Failed to update progress:`, e);
  }
}

async function processImport(
  supabaseAdmin: any,
  importData: KpiImportRow[],
  importId: string,
  userId: string
) {
  const startTime = Date.now();
  console.log(`[${importId}] Starting OPTIMIZED import of ${importData.length} rows`);
  
  // Initialize progress record
  await supabaseAdmin.from('import_progress').insert({
    id: importId,
    user_id: userId,
    status: 'running',
    total_rows: importData.length,
    processed_rows: 0,
    kpis_imported: 0,
    employees_created: 0,
    categories_created: 0,
    errors: JSON.stringify([]),
  });
  
  try {
    // 1. Fetch all existing data upfront (including org structure)
    console.log(`[${importId}] Fetching existing profiles, categories, and org structure...`);
    const [profilesResult, categoriesResult, divisionsResult, businessUnitsResult, departmentsResult] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, employee_code, full_name, department_id'),
      supabaseAdmin.from('kra_categories').select('id, name'),
      supabaseAdmin.from('divisions').select('id, name'),
      supabaseAdmin.from('business_units').select('id, name, division_id'),
      supabaseAdmin.from('departments').select('id, name, business_unit_id'),
    ]);
    
    const profiles = profilesResult.data || [];
    const categories = categoriesResult.data || [];
    const divisions = divisionsResult.data || [];
    const businessUnits = businessUnitsResult.data || [];
    const departments = departmentsResult.data || [];
    
    // Build lookup maps
    const employeeByCode = new Map<string, string>();
    const employeeByName = new Map<string, string>();
    profiles.forEach((p: any) => {
      if (p.employee_code) employeeByCode.set(p.employee_code.toLowerCase(), p.id);
      if (p.full_name) employeeByName.set(p.full_name.toLowerCase(), p.id);
    });
    
    const categoryByName = new Map<string, string>();
    categories.forEach((c: any) => categoryByName.set(c.name.toLowerCase(), c.id));
    
    // Org structure maps
    const divisionByName = new Map<string, string>();
    divisions.forEach((d: any) => divisionByName.set(d.name.toLowerCase(), d.id));
    
    const businessUnitByName = new Map<string, { id: string; division_id: string }>();
    businessUnits.forEach((bu: any) => businessUnitByName.set(bu.name.toLowerCase(), { id: bu.id, division_id: bu.division_id }));
    
    const departmentByName = new Map<string, { id: string; business_unit_id: string }>();
    departments.forEach((d: any) => departmentByName.set(d.name.toLowerCase(), { id: d.id, business_unit_id: d.business_unit_id }));
    
    // 2. Identify missing employees, categories, and org structure
    console.log(`[${importId}] Identifying missing data...`);
    const missingEmployees = new Map<string, { code: string; name: string; division?: string; businessUnit?: string; department?: string }>();
    const missingCategories = new Set<string>();
    const missingDivisions = new Set<string>();
    const missingBusinessUnits = new Map<string, string>(); // bu name -> division name
    const missingDepartments = new Map<string, string>(); // dept name -> bu name
    
    for (const row of importData) {
      const code = String(row.newCode || '').toLowerCase();
      const name = (row.fullName || '').toLowerCase();
      
      if (!employeeByCode.has(code) && !employeeByName.has(name)) {
        const key = code || name;
        if (key && !missingEmployees.has(key)) {
          missingEmployees.set(key, { 
            code: row.newCode || '', 
            name: row.fullName || '',
            division: row.division,
            businessUnit: row.businessUnit,
            department: row.department,
          });
        }
      }
      
      if (row.category && !categoryByName.has(row.category.toLowerCase())) {
        missingCategories.add(row.category);
      }
      
      // Track missing org structure
      if (row.division && !divisionByName.has(row.division.toLowerCase())) {
        missingDivisions.add(row.division);
      }
      if (row.businessUnit && !businessUnitByName.has(row.businessUnit.toLowerCase())) {
        missingBusinessUnits.set(row.businessUnit, row.division || '');
      }
      if (row.department && !departmentByName.has(row.department.toLowerCase())) {
        missingDepartments.set(row.department, row.businessUnit || '');
      }
    }
    
    // 3. Create missing divisions
    if (missingDivisions.size > 0) {
      console.log(`[${importId}] Creating ${missingDivisions.size} new divisions...`);
      const divisionInserts = Array.from(missingDivisions).map(name => ({ name }));
      const { data: newDivs, error: divError } = await supabaseAdmin
        .from('divisions')
        .insert(divisionInserts)
        .select('id, name');
      
      if (divError) {
        console.error(`[${importId}] Division creation error:`, divError);
      } else {
        newDivs?.forEach((d: any) => divisionByName.set(d.name.toLowerCase(), d.id));
        console.log(`[${importId}] Created ${newDivs?.length || 0} divisions`);
      }
    }
    
    // 4. Create missing business units (need division IDs)
    if (missingBusinessUnits.size > 0) {
      console.log(`[${importId}] Creating ${missingBusinessUnits.size} new business units...`);
      const buInserts = Array.from(missingBusinessUnits.entries()).map(([buName, divName]) => ({
        name: buName,
        division_id: divName ? divisionByName.get(divName.toLowerCase()) || null : null,
      }));
      const { data: newBUs, error: buError } = await supabaseAdmin
        .from('business_units')
        .insert(buInserts)
        .select('id, name, division_id');
      
      if (buError) {
        console.error(`[${importId}] Business unit creation error:`, buError);
      } else {
        newBUs?.forEach((bu: any) => businessUnitByName.set(bu.name.toLowerCase(), { id: bu.id, division_id: bu.division_id }));
        console.log(`[${importId}] Created ${newBUs?.length || 0} business units`);
      }
    }
    
    // 5. Create missing departments (need business unit IDs)
    if (missingDepartments.size > 0) {
      console.log(`[${importId}] Creating ${missingDepartments.size} new departments...`);
      const deptInserts = Array.from(missingDepartments.entries()).map(([deptName, buName]) => ({
        name: deptName,
        business_unit_id: buName ? businessUnitByName.get(buName.toLowerCase())?.id || null : null,
      }));
      const { data: newDepts, error: deptError } = await supabaseAdmin
        .from('departments')
        .insert(deptInserts)
        .select('id, name, business_unit_id');
      
      if (deptError) {
        console.error(`[${importId}] Department creation error:`, deptError);
      } else {
        newDepts?.forEach((d: any) => departmentByName.set(d.name.toLowerCase(), { id: d.id, business_unit_id: d.business_unit_id }));
        console.log(`[${importId}] Created ${newDepts?.length || 0} departments`);
      }
    }
    
    // 6. Bulk create missing categories
    let categoriesCreated = 0;
    if (missingCategories.size > 0) {
      console.log(`[${importId}] Creating ${missingCategories.size} new categories...`);
      const categoryInserts = Array.from(missingCategories).map(name => ({
        name,
        weightage: 0,
        color: getRandomColor(),
        description: 'Auto-created from import',
      }));
      
      const { data: newCats, error: catError } = await supabaseAdmin
        .from('kra_categories')
        .insert(categoryInserts)
        .select('id, name');
      
      if (catError) {
        console.error(`[${importId}] Category creation error:`, catError);
      } else {
        newCats?.forEach((c: any) => categoryByName.set(c.name.toLowerCase(), c.id));
        categoriesCreated = newCats?.length || 0;
      }
      
      await updateProgress(supabaseAdmin, importId, { categories_created: categoriesCreated });
    }
    
    // 7. Bulk create missing employees with department linkage
    let employeesCreated = 0;
    if (missingEmployees.size > 0) {
      console.log(`[${importId}] Creating ${missingEmployees.size} new employees...`);
      const employeeInserts = Array.from(missingEmployees.values()).map(emp => {
        // Find department ID based on org structure
        let departmentId: string | null = null;
        if (emp.department) {
          const dept = departmentByName.get(emp.department.toLowerCase());
          if (dept) departmentId = dept.id;
        }
        
        return {
          id: crypto.randomUUID(),
          email: `emp${emp.code || Date.now()}@temp.local`,
          employee_code: emp.code,
          full_name: emp.name,
          department_id: departmentId,
        };
      });
      
      const { data: newEmps, error: empError } = await supabaseAdmin
        .from('profiles')
        .insert(employeeInserts)
        .select('id, employee_code, full_name');
      
      if (empError) {
        console.error(`[${importId}] Employee creation error:`, empError);
      } else {
        newEmps?.forEach((e: any) => {
          if (e.employee_code) employeeByCode.set(e.employee_code.toLowerCase(), e.id);
          if (e.full_name) employeeByName.set(e.full_name.toLowerCase(), e.id);
        });
        employeesCreated = newEmps?.length || 0;
      }
      
      await updateProgress(supabaseAdmin, importId, { employees_created: employeesCreated });
    }
    
    // 8. Update existing employees with department if they don't have one
    const employeeDeptUpdates: { id: string; department_id: string }[] = [];
    for (const row of importData) {
      if (!row.department) continue;
      
      const code = String(row.newCode || '').toLowerCase();
      const name = (row.fullName || '').toLowerCase();
      const employeeId = employeeByCode.get(code) || employeeByName.get(name);
      
      if (employeeId) {
        const existingProfile = profiles.find((p: any) => p.id === employeeId);
        if (existingProfile && !existingProfile.department_id) {
          const dept = departmentByName.get(row.department.toLowerCase());
          if (dept && !employeeDeptUpdates.find(u => u.id === employeeId)) {
            employeeDeptUpdates.push({ id: employeeId, department_id: dept.id });
          }
        }
      }
    }
    
    if (employeeDeptUpdates.length > 0) {
      console.log(`[${importId}] Updating ${employeeDeptUpdates.length} employee department assignments...`);
      for (const update of employeeDeptUpdates) {
        await supabaseAdmin
          .from('profiles')
          .update({ department_id: update.department_id })
          .eq('id', update.id);
      }
    }
    
    // 5. Prepare all KPI inserts
    console.log(`[${importId}] Preparing KPI records...`);
    const kpiRecords: any[] = [];
    const submissionRecords: any[] = [];
    const errors: string[] = [];
    
    for (let i = 0; i < importData.length; i++) {
      const row = importData[i];
      
      // Find employee
      const code = String(row.newCode || '').toLowerCase();
      const name = (row.fullName || '').toLowerCase();
      const employeeId = employeeByCode.get(code) || employeeByName.get(name);
      
      if (!employeeId) {
        errors.push(`Row ${i + 1}: Employee not found: ${row.newCode} - ${row.fullName}`);
        continue;
      }
      
      // Find category
      const categoryId = categoryByName.get((row.category || '').toLowerCase());
      if (!categoryId) {
        errors.push(`Row ${i + 1}: Category not found: ${row.category}`);
        continue;
      }
      
      // Parse values
      const { period: reviewPeriod, year: reviewYear } = row.month 
        ? parseReviewPeriod(String(row.month)) 
        : { period: null, year: new Date().getFullYear() };
      
      const isPercentage = row.uom?.toLowerCase().includes('%') || row.uom?.toLowerCase() === 'percentage';
      let targetValue = typeof row.target === 'number' ? row.target :
        row.target ? parseFloat(String(row.target).replace('%', '')) : null;
      
      // Convert decimal to percentage if UOM is % and value looks like a decimal (0-1 range)
      if (isPercentage && targetValue !== null && targetValue > 0 && targetValue <= 1) {
        targetValue = targetValue * 100;
      }
      
      const kpiId = crypto.randomUUID();
      
      kpiRecords.push({
        id: kpiId,
        employee_id: employeeId,
        category_id: categoryId,
        kra_name: row.kra,
        kpi_name: row.kpi,
        target_value: targetValue,
        uom: row.uom || null,
        weightage: row.kpiWeightage || row.kpiWeightageScore || 0,
        criteria: row.criteria || 'Higher is Better',
        status: determineReviewStatus(row),
        review_period: reviewPeriod,
        review_year: reviewYear,
        r5: formatRatingThreshold(row.r5),
        r4: formatRatingThreshold(row.r4),
        r3: formatRatingThreshold(row.r3),
        r2: formatRatingThreshold(row.r2),
        r1: formatRatingThreshold(row.r1),
        r0: formatRatingThreshold(row.r0),
        frequency: row.frequency || null,
        source_of_data: row.sourceOfData || null,
      });
      
      // Prepare submission if review data exists
      const hasReviewData = row.targetAchieved || row.employeeTargetAchieved ||
        row.employeeRating || row.managerRating || row.auditRating ||
        row.rating || row.managerTargetAchieved || row.auditTargetAchieved;
      
      if (hasReviewData) {
        const achievedValue = row.auditTargetAchieved || row.managerTargetAchieved ||
          row.employeeTargetAchieved || row.targetAchieved;
        
        const parseAchieved = (val: any): number | null => {
          if (val === null || val === undefined || val === '') return null;
          let num = parseFloat(String(val).replace('%', '').trim());
          if (isNaN(num)) return null;
          // Convert decimal to percentage if UOM is % and value looks like a decimal (0-1 range)
          if (isPercentage && num > 0 && num <= 1) {
            num = num * 100;
          }
          return num;
        };
        
        submissionRecords.push({
          kpi_id: kpiId,
          achieved_value: parseAchieved(achievedValue),
          self_rating: mapScoreToRating(row.employeeRating || row.rating),
          self_score: row.employeeRating || row.rating || null,
          self_remarks: row.employeeRemarks || null,
          manager_rating: mapScoreToRating(row.managerRating),
          manager_score: row.managerRating || null,
          manager_remarks: row.managerRemarks || null,
          auditor_rating: mapScoreToRating(row.auditRating),
          auditor_score: row.auditRating || null,
          auditor_remarks: row.auditRemarks || null,
          final_rating: mapScoreToRating(row.auditRating || row.managerRating || row.employeeRating || row.rating),
          final_score: row.auditRating || row.managerRating || row.employeeRating || row.rating || null,
          kpi_status: determineKpiStatus(row),
          is_na: false,
        });
      }
    }
    
    // 6. Batch insert KPIs
    console.log(`[${importId}] Inserting ${kpiRecords.length} KPIs in batches of ${BATCH_SIZE}...`);
    const kpiChunks = chunkArray(kpiRecords, BATCH_SIZE);
    let kpisInserted = 0;
    let processedRows = 0;
    
    for (let i = 0; i < kpiChunks.length; i++) {
      const chunk = kpiChunks[i];
      const { error } = await supabaseAdmin.from('kpis').insert(chunk);
      if (error) {
        console.error(`[${importId}] KPI batch ${i + 1} error:`, error);
        errors.push(`Batch ${i + 1}: ${error.message}`);
      } else {
        kpisInserted += chunk.length;
      }
      
      processedRows += chunk.length;
      
      // Update progress every batch
      await updateProgress(supabaseAdmin, importId, {
        processed_rows: processedRows,
        kpis_imported: kpisInserted,
        errors: errors,
      });
      
      if ((i + 1) % 10 === 0) {
        console.log(`[${importId}] Progress: ${i + 1}/${kpiChunks.length} batches (${kpisInserted} KPIs)`);
      }
    }
    
    // 7. Batch insert submissions
    if (submissionRecords.length > 0) {
      console.log(`[${importId}] Inserting ${submissionRecords.length} submissions in batches...`);
      const subChunks = chunkArray(submissionRecords, BATCH_SIZE);
      
      for (let i = 0; i < subChunks.length; i++) {
        const { error } = await supabaseAdmin.from('review_submissions').insert(subChunks[i]);
        if (error) {
          console.error(`[${importId}] Submission batch ${i + 1} error:`, error);
        }
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${importId}] ✅ Import complete in ${duration}s: ${kpisInserted} KPIs, ${employeesCreated} employees, ${categoriesCreated} categories`);
    
    // Mark as completed
    await updateProgress(supabaseAdmin, importId, {
      status: 'completed',
      processed_rows: importData.length,
      kpis_imported: kpisInserted,
      employees_created: employeesCreated,
      categories_created: categoriesCreated,
      errors: errors,
      completed_at: new Date().toISOString(),
    });
    
    return { 
      success: kpisInserted, 
      employees: employeesCreated, 
      categories: categoriesCreated,
      errors,
      duration 
    };
  } catch (error: any) {
    console.error(`[${importId}] Import failed:`, error);
    
    await updateProgress(supabaseAdmin, importId, {
      status: 'failed',
      errors: [error.message],
      completed_at: new Date().toISOString(),
    });
    
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { importData: rawImportData } = await req.json();
    
    if (!rawImportData || !Array.isArray(rawImportData) || rawImportData.length === 0) {
      return new Response(JSON.stringify({ error: 'No import data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Server-side row limit enforcement
    if (rawImportData.length > MAX_ROWS) {
      return new Response(JSON.stringify({ 
        error: `Import exceeds maximum allowed rows (${MAX_ROWS}). Received: ${rawImportData.length}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate and sanitize all rows server-side
    console.log(`Validating ${rawImportData.length} rows...`);
    const validatedData: KpiImportRow[] = [];
    const validationErrors: string[] = [];
    
    // Log first row structure for debugging
    if (rawImportData.length > 0) {
      console.log('First row keys:', Object.keys(rawImportData[0]));
      console.log('First row sample:', JSON.stringify(rawImportData[0]).slice(0, 500));
    }
    
    for (let i = 0; i < rawImportData.length; i++) {
      const { data, error } = validateAndSanitizeRow(rawImportData[i], i);
      if (data) {
        validatedData.push(data);
      } else if (error) {
        validationErrors.push(error);
        // Log first few errors for debugging
        if (validationErrors.length <= 5) {
          console.log(`Validation error: ${error}`);
        }
        // Stop after 50 validation errors to avoid overwhelming response
        if (validationErrors.length >= 50) {
          validationErrors.push(`... and ${rawImportData.length - i - 1} more rows not validated`);
          break;
        }
      }
    }
    
    console.log(`Validation complete: ${validatedData.length} valid, ${validationErrors.length} errors`);

    // If no valid rows, reject the import
    if (validatedData.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'All rows failed validation. Check column names match expected format.',
        validationErrors: validationErrors.slice(0, 20),
        totalErrors: validationErrors.length,
        totalRows: rawImportData.length,
        expectedColumns: ['newCode', 'fullName', 'category', 'kra', 'kpi']
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If more than 10% of rows failed validation, reject the import
    const failureRate = validationErrors.length / rawImportData.length;
    if (failureRate > 0.1 && validationErrors.length > 5) {
      return new Response(JSON.stringify({ 
        error: 'Too many validation errors in import data',
        validationErrors: validationErrors.slice(0, 20),
        totalErrors: validationErrors.length,
        totalRows: rawImportData.length
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const importData = validatedData;

    const importId = `import-${Date.now()}`;
    console.log(`[${importId}] Received ${importData.length} rows for OPTIMIZED background import`);

    // Start background processing with userId for tracking
    EdgeRuntime.waitUntil(processImport(supabaseAdmin, importData, importId, user.id));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Import started. Processing ${importData.length} rows with batch optimization.`,
        importId,
        totalRows: importData.length,
      }),
      {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});