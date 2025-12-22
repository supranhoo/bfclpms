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

// Map numeric rating to rating level
const mapScoreToRating = (score: number | string | null | undefined): RatingLevel | null => {
  if (score === null || score === undefined || score === '') return null;
  const numScore = typeof score === 'string' ? parseFloat(score) : score;
  if (isNaN(numScore)) return null;
  
  if (numScore >= 4.5) return 'blue';
  if (numScore >= 3.5) return 'green';
  if (numScore >= 2.5) return 'yellow';
  return 'red';
};

// Determine review status based on review data
const determineReviewStatus = (row: KpiImportRow): 'kra_set' | 'self_review' | 'manager_check' | 'audit' | 'approved' => {
  if (row.auditRating || row.auditTargetAchieved) return 'approved';
  if (row.managerRating || row.managerTargetAchieved) return 'audit';
  if (row.employeeRating || row.employeeTargetAchieved || row.targetAchieved) return 'manager_check';
  return 'kra_set';
};

// Determine KPI status
const determineKpiStatus = (row: KpiImportRow): 'open' | 'submitted' | 'approved_by_manager' | 'locked' => {
  if (row.auditRating || row.auditTargetAchieved) return 'locked';
  if (row.managerRating || row.managerTargetAchieved) return 'approved_by_manager';
  if (row.employeeRating || row.employeeTargetAchieved || row.targetAchieved) return 'submitted';
  return 'open';
};

// Parse review period from month string
const parseReviewPeriod = (monthStr: string): { period: string | null; year: number } => {
  let reviewPeriod: string | null = null;
  let reviewYear = new Date().getFullYear();
  
  const trimmed = monthStr.trim();
  
  // Excel serial date
  const serialNum = parseInt(trimmed);
  if (!isNaN(serialNum) && serialNum > 40000 && serialNum < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + serialNum * 24 * 60 * 60 * 1000);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    reviewPeriod = monthNames[date.getMonth()];
    reviewYear = date.getFullYear();
  }
  // "Dec-25" or "Dec-2025" format
  else if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    const monthPart = parts[0];
    const yearPart = parts[1];
    
    const shortMonths: Record<string, string> = {
      'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April',
      'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August',
      'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December'
    };
    reviewPeriod = shortMonths[monthPart.toLowerCase()] || monthPart;
    
    if (yearPart) {
      const yearNum = parseInt(yearPart);
      reviewYear = yearNum < 100 ? 2000 + yearNum : yearNum;
    }
  }
  // "December 2025" format
  else if (trimmed.includes(' ')) {
    const parts = trimmed.split(' ');
    reviewPeriod = parts[0];
    const yearPart = parts.pop();
    if (yearPart) {
      const yearNum = parseInt(yearPart);
      if (!isNaN(yearNum)) {
        reviewYear = yearNum < 100 ? 2000 + yearNum : yearNum;
      }
    }
  }
  // Full month name
  else {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const matchedMonth = monthNames.find(m => 
      m.toLowerCase() === trimmed.toLowerCase() || 
      m.toLowerCase().startsWith(trimmed.toLowerCase().substring(0, 3))
    );
    reviewPeriod = matchedMonth || trimmed;
  }
  
  return { period: reviewPeriod, year: reviewYear };
};

// Random color for new categories
const getRandomColor = () => {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
  return colors[Math.floor(Math.random() * colors.length)];
};

async function processImport(
  supabaseAdmin: any,
  importData: KpiImportRow[],
  importId: string
) {
  console.log(`[${importId}] Starting background import of ${importData.length} rows`);
  
  let successCount = 0;
  let categoriesCreated = 0;
  let employeesCreated = 0;
  const errors: string[] = [];
  
  // Fetch existing data
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, employee_code, full_name');
  const { data: categories } = await supabaseAdmin.from('kra_categories').select('id, name');
  
  // Caches
  const categoryCache = new Map<string, string>();
  categories?.forEach((cat: any) => categoryCache.set(cat.name.toLowerCase(), cat.id));
  
  const employeeCache = new Map<string, string>();
  profiles?.forEach((p: any) => {
    if (p.employee_code) employeeCache.set(p.employee_code.toLowerCase(), p.id);
    if (p.full_name) employeeCache.set(p.full_name.toLowerCase(), p.id);
  });
  
  for (let i = 0; i < importData.length; i++) {
    const row = importData[i];
    
    try {
      // Find or create employee
      let employeeId = employeeCache.get(String(row.newCode).toLowerCase()) 
        || employeeCache.get(row.fullName?.toLowerCase() || '');
      
      if (!employeeId && (row.newCode || row.fullName)) {
        // Create employee profile
        const email = `emp${row.newCode || Date.now()}@temp.local`;
        const { data: newProfile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: crypto.randomUUID(),
            email: email,
            employee_code: String(row.newCode || ''),
            full_name: row.fullName || '',
          })
          .select('id')
          .single();
        
        if (profileError) {
          errors.push(`Row ${i + 1}: Failed to create employee ${row.newCode}: ${profileError.message}`);
          continue;
        }
        
        employeeId = newProfile.id;
        if (row.newCode) employeeCache.set(String(row.newCode).toLowerCase(), employeeId!);
        if (row.fullName) employeeCache.set(row.fullName.toLowerCase(), employeeId!);
        employeesCreated++;
      }
      
      if (!employeeId) {
        errors.push(`Row ${i + 1}: Employee not found: ${row.newCode} - ${row.fullName}`);
        continue;
      }
      
      // Find or create category
      let categoryId = categoryCache.get(row.category?.toLowerCase() || '');
      
      if (!categoryId && row.category) {
        const { data: newCategory, error: catError } = await supabaseAdmin
          .from('kra_categories')
          .insert({
            name: row.category,
            weightage: 0,
            color: getRandomColor(),
            description: 'Auto-created from import',
          })
          .select('id')
          .single();
        
        if (catError) {
          errors.push(`Row ${i + 1}: Failed to create category ${row.category}: ${catError.message}`);
          continue;
        }
        
        categoryId = newCategory.id;
        if (row.category) categoryCache.set(row.category.toLowerCase(), categoryId!);
        categoriesCreated++;
      }
      
      if (!categoryId) {
        errors.push(`Row ${i + 1}: Category not found: ${row.category}`);
        continue;
      }
      
      // Parse review period
      const { period: reviewPeriod, year: reviewYear } = row.month 
        ? parseReviewPeriod(String(row.month)) 
        : { period: null, year: new Date().getFullYear() };
      
      // Parse target value
      const targetValue = typeof row.target === 'number' ? row.target :
        row.target ? parseFloat(String(row.target).replace('%', '')) : null;
      
      // Determine status
      const reviewStatus = determineReviewStatus(row);
      
      // Insert KPI
      const { data: newKpi, error: kpiError } = await supabaseAdmin
        .from('kpis')
        .insert({
          employee_id: employeeId,
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
      
      if (kpiError) {
        errors.push(`Row ${i + 1}: Failed to create KPI: ${kpiError.message}`);
        continue;
      }
      
      // Create review submission if there's review data
      const hasReviewData = row.targetAchieved || row.employeeTargetAchieved ||
        row.employeeRating || row.managerRating || row.auditRating ||
        row.rating || row.managerTargetAchieved || row.auditTargetAchieved;
      
      if (hasReviewData && newKpi?.id) {
        const achievedValue = row.auditTargetAchieved || row.managerTargetAchieved ||
          row.employeeTargetAchieved || row.targetAchieved;
        
        const parseAchieved = (val: any): number | null => {
          if (val === null || val === undefined || val === '') return null;
          const strVal = String(val).replace('%', '').trim();
          const num = parseFloat(strVal);
          return isNaN(num) ? null : num;
        };
        
        await supabaseAdmin.from('review_submissions').insert({
          kpi_id: newKpi.id,
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
      
      successCount++;
      
      // Log progress every 100 rows
      if ((i + 1) % 100 === 0) {
        console.log(`[${importId}] Progress: ${i + 1}/${importData.length} rows processed`);
      }
    } catch (err: any) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }
  
  console.log(`[${importId}] Import complete: ${successCount} KPIs, ${employeesCreated} employees, ${categoriesCreated} categories created`);
  if (errors.length > 0) {
    console.log(`[${importId}] Errors (${errors.length}):`, errors.slice(0, 10));
  }
  
  return { successCount, employeesCreated, categoriesCreated, errors };
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

    // Verify auth
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

    // Check admin role
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
    console.log(`[${importId}] Received ${importData.length} rows for background import`);

    // Start background processing
    EdgeRuntime.waitUntil(processImport(supabaseAdmin, importData, importId));

    // Return immediate response
    return new Response(
      JSON.stringify({
        success: true,
        message: `Import started in background. Processing ${importData.length} rows.`,
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
