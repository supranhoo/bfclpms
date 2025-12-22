import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RatingLevel = 'red' | 'yellow' | 'green' | 'blue';

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
  criteria?: string;
  r5?: string | number;
  r4?: string | number;
  r3?: string | number;
  r2?: string | number;
  r1?: string | number;
  r0?: string | number;
  targetAchieved?: string | number;
  achievedWeight?: string;
  rating?: number;
  kpiWeightageScore?: number;
  employeeTargetAchieved?: string | number;
  employeeRating?: number;
  employeeRemarks?: string;
  managerTargetAchieved?: string | number;
  managerRating?: number;
  managerRemarks?: string;
  auditTargetAchieved?: string | number;
  auditRating?: number;
  auditRemarks?: string;
  sourceOfData?: string;
  kpiStatus?: string;
}

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

async function processImport(
  supabaseAdmin: any,
  importData: KpiImportRow[],
  importId: string
) {
  const startTime = Date.now();
  console.log(`[${importId}] Starting OPTIMIZED import of ${importData.length} rows`);
  
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
    }
  }
  
  // 4. Bulk create missing employees
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
    
    const targetValue = typeof row.target === 'number' ? row.target :
      row.target ? parseFloat(String(row.target).replace('%', '')) : null;
    
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
        const num = parseFloat(String(val).replace('%', '').trim());
        return isNaN(num) ? null : num;
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
  
  for (let i = 0; i < kpiChunks.length; i++) {
    const chunk = kpiChunks[i];
    const { error } = await supabaseAdmin.from('kpis').insert(chunk);
    if (error) {
      console.error(`[${importId}] KPI batch ${i + 1} error:`, error);
      errors.push(`Batch ${i + 1}: ${error.message}`);
    } else {
      kpisInserted += chunk.length;
    }
    
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
  console.log(`[${importId}] ✅ Import complete in ${duration}s: ${kpisInserted} KPIs, ${missingEmployees.size} employees, ${missingCategories.size} categories`);
  if (errors.length > 0) {
    console.log(`[${importId}] Errors (${errors.length}):`, errors.slice(0, 5));
  }
  
  return { 
    success: kpisInserted, 
    employees: missingEmployees.size, 
    categories: missingCategories.size,
    errors,
    duration 
  };
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

    const { importData } = await req.json();
    
    if (!importData || !Array.isArray(importData) || importData.length === 0) {
      return new Response(JSON.stringify({ error: 'No import data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const importId = `import-${Date.now()}`;
    console.log(`[${importId}] Received ${importData.length} rows for OPTIMIZED background import`);

    // Start background processing
    EdgeRuntime.waitUntil(processImport(supabaseAdmin, importData, importId));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Import started. Processing ${importData.length} rows with batch optimization.`,
        importId,
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
