import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface RolloverResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  kpis_copied?: number;
  employees_affected?: number;
  source_period?: string;
  source_year?: number;
  target_period?: string;
  target_year?: number;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for manual trigger info
    let triggeredBy = 'system';
    let forceRollover = false;
    try {
      const body = await req.json();
      triggeredBy = body.triggered_by || 'system';
      forceRollover = body.force === true;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`Auto-rollover triggered by: ${triggeredBy}, force: ${forceRollover}`);

    // Check if auto-rollover is enabled (skip check if manual trigger with force)
    if (!forceRollover) {
      const { data: setting, error: settingError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'auto_kra_rollover')
        .single();

      if (settingError) {
        console.error('Error fetching setting:', settingError);
        throw new Error('Failed to fetch auto-rollover setting');
      }

      // Parse the setting value - it's stored as JSON string
      let isEnabled = false;
      if (setting?.setting_value) {
        const value = typeof setting.setting_value === 'string' 
          ? setting.setting_value.replace(/^"|"$/g, '')
          : setting.setting_value;
        isEnabled = value === 'enabled';
      }

      if (!isEnabled) {
        console.log('Auto-rollover is disabled, skipping');
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'Auto-rollover is disabled' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Calculate source and target periods
    const currentDate = new Date();
    const targetMonthIndex = currentDate.getMonth();
    const targetMonth = MONTHS[targetMonthIndex];
    const targetYear = currentDate.getFullYear();

    // Previous month calculation
    const sourceMonthIndex = (targetMonthIndex + 11) % 12;
    const sourceMonth = MONTHS[sourceMonthIndex];
    const sourceYear = sourceMonthIndex === 11 ? targetYear - 1 : targetYear;

    console.log(`Source: ${sourceMonth} ${sourceYear}, Target: ${targetMonth} ${targetYear}`);

    // Check if target period already has KPIs (prevent duplicate rollover)
    const { count: existingCount, error: countError } = await supabase
      .from('kpis')
      .select('*', { count: 'exact', head: true })
      .eq('review_period', targetMonth)
      .eq('review_year', targetYear);

    if (countError) {
      console.error('Error checking existing KPIs:', countError);
      throw new Error('Failed to check existing KPIs');
    }

    if (existingCount && existingCount > 0 && !forceRollover) {
      console.log(`Target period already has ${existingCount} KPIs, skipping`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true, 
          reason: `Target period ${targetMonth} ${targetYear} already has ${existingCount} KPIs` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create review period record if it doesn't exist
    const { error: periodError } = await supabase
      .from('review_periods')
      .upsert({
        period_name: targetMonth,
        review_year: targetYear,
        is_locked: false,
      }, {
        onConflict: 'period_name,review_year',
        ignoreDuplicates: true
      });

    if (periodError) {
      console.log('Note: Could not create review period (may already exist):', periodError.message);
    }

    // Fetch source KPIs
    const { data: sourceKpis, error: fetchError } = await supabase
      .from('kpis')
      .select('*')
      .eq('review_period', sourceMonth)
      .eq('review_year', sourceYear);

    if (fetchError) {
      console.error('Error fetching source KPIs:', fetchError);
      throw new Error('Failed to fetch source KPIs');
    }

    if (!sourceKpis || sourceKpis.length === 0) {
      console.log('No KPIs found in source period');
      
      // Log the empty rollover
      await supabase.from('kra_rollover_logs').insert({
        source_period: sourceMonth,
        source_year: sourceYear,
        target_period: targetMonth,
        target_year: targetYear,
        kpis_copied: 0,
        employees_affected: 0,
        triggered_by: triggeredBy,
        status: 'completed',
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true, 
          reason: `No KPIs found in source period ${sourceMonth} ${sourceYear}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${sourceKpis.length} KPIs to copy`);

    // Prepare new KPIs - copy definition only, reset status and clear values
    const newKpis = sourceKpis.map(kpi => ({
      employee_id: kpi.employee_id,
      category_id: kpi.category_id,
      kra_name: kpi.kra_name,
      kpi_name: kpi.kpi_name,
      target_value: kpi.target_value,
      uom: kpi.uom,
      weightage: kpi.weightage,
      frequency: kpi.frequency,
      criteria: kpi.criteria,
      source_of_data: kpi.source_of_data,
      r5: kpi.r5,
      r4: kpi.r4,
      r3: kpi.r3,
      r2: kpi.r2,
      r1: kpi.r1,
      r0: kpi.r0,
      review_period: targetMonth,
      review_year: targetYear,
      status: 'kra_set',
    }));

    // Insert new KPIs
    const { data: insertedKpis, error: insertError } = await supabase
      .from('kpis')
      .insert(newKpis)
      .select('id, employee_id');

    if (insertError) {
      console.error('Error inserting KPIs:', insertError);
      
      // Log the failed rollover
      await supabase.from('kra_rollover_logs').insert({
        source_period: sourceMonth,
        source_year: sourceYear,
        target_period: targetMonth,
        target_year: targetYear,
        kpis_copied: 0,
        employees_affected: 0,
        triggered_by: triggeredBy,
        status: 'failed',
        error_message: insertError.message,
      });

      throw new Error(`Failed to insert KPIs: ${insertError.message}`);
    }

    // Count unique employees affected
    const uniqueEmployees = new Set(insertedKpis?.map(k => k.employee_id) || []);
    const kpisCopied = insertedKpis?.length || 0;
    const employeesAffected = uniqueEmployees.size;

    console.log(`Successfully copied ${kpisCopied} KPIs for ${employeesAffected} employees`);

    // Log the successful rollover
    await supabase.from('kra_rollover_logs').insert({
      source_period: sourceMonth,
      source_year: sourceYear,
      target_period: targetMonth,
      target_year: targetYear,
      kpis_copied: kpisCopied,
      employees_affected: employeesAffected,
      triggered_by: triggeredBy,
      status: 'completed',
    });

    const result: RolloverResult = {
      success: true,
      kpis_copied: kpisCopied,
      employees_affected: employeesAffected,
      source_period: sourceMonth,
      source_year: sourceYear,
      target_period: targetMonth,
      target_year: targetYear,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Auto-rollover error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
