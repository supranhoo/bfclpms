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
const MAX_TEXT_LENGTH = 500;
const MAX_REMARKS_LENGTH = 1000;
const MAX_ROWS = 10000;

const KpiImportRowSchema = z.object({
  sNo: z.number().optional(),
  month: z.string().max(MAX_TEXT_LENGTH).optional(),
  reviewStatus: z.string().max(100).optional(),
  newCode: z.string().min(1).max(100),
  fullName: z.string().min(1).max(MAX_TEXT_LENGTH),
  category: z.string().min(1).max(MAX_TEXT_LENGTH),
  kra: z.string().min(1).max(MAX_TEXT_LENGTH),
  kpi: z.string().min(1).max(MAX_TEXT_LENGTH),
  target: z.union([z.string(), z.number()]),
  uom: z.string().max(100).optional(),
  frequency: z.string().max(100).optional(),
  kpiWeightage: z.number().min(0).max(100).optional(),
  criteria: z.string().max(100).optional(),
  r5: z.union([z.string(), z.number()]).optional(),
  r4: z.union([z.string(), z.number()]).optional(),
  r3: z.union([z.string(), z.number()]).optional(),
  r2: z.union([z.string(), z.number()]).optional(),
  r1: z.union([z.string(), z.number()]).optional(),
  r0: z.union([z.string(), z.number()]).optional(),
  targetAchieved: z.union([z.string(), z.number()]).optional(),
  achievedWeight: z.string().max(100).optional(),
  rating: z.number().min(0).max(10).optional(),
  kpiWeightageScore: z.number().optional(),
  employeeTargetAchieved: z.union([z.string(), z.number()]).optional(),
  employeeRating: z.number().min(0).max(10).optional(),
  employeeRemarks: z.string().max(MAX_REMARKS_LENGTH).optional(),
  managerTargetAchieved: z.union([z.string(), z.number()]).optional(),
  managerRating: z.number().min(0).max(10).optional(),
  managerRemarks: z.string().max(MAX_REMARKS_LENGTH).optional(),
  auditTargetAchieved: z.union([z.string(), z.number()]).optional(),
  auditRating: z.number().min(0).max(10).optional(),
  auditRemarks: z.string().max(MAX_REMARKS_LENGTH).optional(),
  sourceOfData: z.string().max(MAX_TEXT_LENGTH).optional(),
  kpiStatus: z.string().max(100).optional(),
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
    // 1. Fetch all existing data upfront
    console.log(`[${importId}] Fetching existing profiles and categories...`);
    const [profilesResult, categoriesResult] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, employee_code, full_name'),
      supabaseAdmin.from('kra_categories').select('id, name')
    ]);
    
    const profiles = profilesResult.data || [];
    const categories = categoriesResult.data || [];
    
    // Build lookup maps
    const employeeByCode = new Map<string, string>();
    const employeeByName = new Map<string, string>();
    profiles.forEach((p: any) => {
      if (p.employee_code) employeeByCode.set(p.employee_code.toLowerCase(), p.id);
      if (p.full_name) employeeByName.set(p.full_name.toLowerCase(), p.id);
    });
    
    const categoryByName = new Map<string, string>();
    categories.forEach((c: any) => categoryByName.set(c.name.toLowerCase(), c.id));
    
    // 2. Identify missing employees and categories
    console.log(`[${importId}] Identifying missing employees and categories...`);
    const missingEmployees = new Map<string, { code: string; name: string }>();
    const missingCategories = new Set<string>();
    
    for (const row of importData) {
      const code = String(row.newCode || '').toLowerCase();
      const name = (row.fullName || '').toLowerCase();
      
      if (!employeeByCode.has(code) && !employeeByName.has(name)) {
        const key = code || name;
        if (key && !missingEmployees.has(key)) {
          missingEmployees.set(key, { code: row.newCode || '', name: row.fullName || '' });
        }
      }
      
      if (row.category && !categoryByName.has(row.category.toLowerCase())) {
        missingCategories.add(row.category);
      }
    }
    
    // 3. Bulk create missing categories
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
    
    // 4. Bulk create missing employees
    let employeesCreated = 0;
    if (missingEmployees.size > 0) {
      console.log(`[${importId}] Creating ${missingEmployees.size} new employees...`);
      const employeeInserts = Array.from(missingEmployees.values()).map(emp => ({
        id: crypto.randomUUID(),
        email: `emp${emp.code || Date.now()}@temp.local`,
        employee_code: emp.code,
        full_name: emp.name,
      }));
      
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
        r5: row.r5 ? String(row.r5) : null,
        r4: row.r4 ? String(row.r4) : null,
        r3: row.r3 ? String(row.r3) : null,
        r2: row.r2 ? String(row.r2) : null,
        r1: row.r1 ? String(row.r1) : null,
        r0: row.r0 ? String(row.r0) : null,
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
    
    for (let i = 0; i < rawImportData.length; i++) {
      const { data, error } = validateAndSanitizeRow(rawImportData[i], i);
      if (data) {
        validatedData.push(data);
      } else if (error) {
        validationErrors.push(error);
        // Stop after 50 validation errors to avoid overwhelming response
        if (validationErrors.length >= 50) {
          validationErrors.push(`... and ${rawImportData.length - i - 1} more rows not validated`);
          break;
        }
      }
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