import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PIPLetterRequest {
  pip_id: string;
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const generatePIPLetterHtml = (
  pip: any,
  employee: any,
  manager: any,
  milestones: any[],
  customization: { logoUrl?: string; footerText?: string; companyName?: string }
): string => {
  const logoHtml = customization.logoUrl 
    ? `<img src="${customization.logoUrl}" alt="Company Logo" style="max-height: 60px; margin-bottom: 20px;" />`
    : '';
  
  const companyName = customization.companyName || 'Company';
  const currentDate = formatDate(new Date().toISOString());
  const startDate = formatDate(pip.start_date);
  const endDate = formatDate(pip.extended_end_date || pip.end_date);
  
  // Parse improvement areas
  let improvementAreas: { area: string; details: string }[] = [];
  try {
    improvementAreas = Array.isArray(pip.improvement_areas) ? pip.improvement_areas : JSON.parse(pip.improvement_areas || '[]');
  } catch {
    improvementAreas = [];
  }
  
  const improvementAreasHtml = improvementAreas.length > 0 
    ? improvementAreas.map((item: any, idx: number) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #e2e8f0;">${idx + 1}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0;">${item.area || item}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0;">${item.details || '-'}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">No specific areas defined</td></tr>';
  
  const milestonesHtml = milestones.length > 0
    ? milestones.map((m, idx) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #e2e8f0;">${idx + 1}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0;">${formatDate(m.milestone_date)}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0;">${m.description}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0;">${m.expected_outcome}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">No milestones defined</td></tr>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Performance Improvement Plan</title>
  <style>
    @page { margin: 1in; size: A4; }
    body { 
      font-family: 'Times New Roman', Times, serif; 
      line-height: 1.6; 
      color: #1a1a1a; 
      margin: 0; 
      padding: 40px;
      font-size: 12pt;
    }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; }
    .header h1 { margin: 0; font-size: 18pt; text-transform: uppercase; letter-spacing: 2px; }
    .header p { margin: 5px 0; color: #666; }
    .reference { text-align: right; margin-bottom: 20px; font-size: 11pt; }
    .date { margin-bottom: 20px; }
    .employee-info { margin-bottom: 30px; }
    .employee-info table { border-collapse: collapse; }
    .employee-info td { padding: 4px 15px 4px 0; }
    .employee-info td:first-child { font-weight: bold; width: 120px; }
    .subject { font-weight: bold; text-align: center; margin: 30px 0; font-size: 14pt; text-decoration: underline; }
    .content { margin-bottom: 20px; text-align: justify; }
    .section-title { font-weight: bold; margin: 25px 0 15px 0; font-size: 12pt; text-decoration: underline; }
    table.data-table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11pt; }
    table.data-table th { background: #f1f5f9; padding: 10px 8px; border: 1px solid #e2e8f0; text-align: left; font-weight: bold; }
    table.data-table td { padding: 8px; border: 1px solid #e2e8f0; }
    .consequences { background: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0; }
    .signatures { margin-top: 60px; }
    .signature-row { display: flex; justify-content: space-between; margin-top: 50px; }
    .signature-box { width: 45%; }
    .signature-line { border-top: 1px solid #1a1a1a; margin-top: 50px; padding-top: 5px; }
    .footer { margin-top: 40px; text-align: center; font-size: 10pt; color: #666; border-top: 1px solid #e2e8f0; padding-top: 15px; }
    .acknowledgment { margin-top: 40px; padding: 20px; border: 1px solid #e2e8f0; background: #f8fafc; }
  </style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <h1>${companyName}</h1>
    <p>Human Resources Department</p>
  </div>
  
  <div class="reference">
    <strong>Ref:</strong> PIP/${new Date().getFullYear()}/${pip.id.substring(0, 8).toUpperCase()}
  </div>
  
  <div class="date">
    <strong>Date:</strong> ${currentDate}
  </div>
  
  <div class="employee-info">
    <table>
      <tr><td>To:</td><td>${employee.full_name || 'Employee'}</td></tr>
      <tr><td>Employee Code:</td><td>${employee.employee_code || 'N/A'}</td></tr>
      <tr><td>Designation:</td><td>${employee.designation || 'N/A'}</td></tr>
      <tr><td>Department:</td><td>${employee.department?.name || 'N/A'}</td></tr>
    </table>
  </div>
  
  <div class="subject">
    SUBJECT: PERFORMANCE IMPROVEMENT PLAN (PIP) NOTIFICATION
  </div>
  
  <div class="content">
    <p>Dear ${employee.full_name?.split(' ')[0] || 'Employee'},</p>
    
    <p>
      This letter serves as formal notification that you have been placed on a Performance Improvement Plan (PIP) 
      effective from <strong>${startDate}</strong> to <strong>${endDate}</strong>.
    </p>
    
    <p>
      This plan has been developed to address specific performance concerns and to provide you with the support 
      and guidance needed to meet the expected standards of your role.
    </p>
  </div>
  
  <div class="section-title">1. Reason for Performance Improvement Plan</div>
  <div class="content">
    <p>${pip.reason}</p>
  </div>
  
  <div class="section-title">2. Areas Requiring Improvement</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 40px;">#</th>
        <th>Area</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${improvementAreasHtml}
    </tbody>
  </table>
  
  <div class="section-title">3. Success Criteria</div>
  <div class="content">
    <p>${pip.success_criteria}</p>
  </div>
  
  <div class="section-title">4. Improvement Milestones & Check-in Schedule</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 40px;">#</th>
        <th style="width: 120px;">Date</th>
        <th>Milestone</th>
        <th>Expected Outcome</th>
      </tr>
    </thead>
    <tbody>
      ${milestonesHtml}
    </tbody>
  </table>
  
  <div class="section-title">5. Support & Resources</div>
  <div class="content">
    <p>
      Your reporting manager and HR will provide necessary support during this period. You are encouraged to:
    </p>
    <ul>
      <li>Schedule regular check-ins with your manager to discuss progress</li>
      <li>Seek clarification on expectations whenever needed</li>
      <li>Utilize available training and development resources</li>
      <li>Document your progress and achievements</li>
    </ul>
  </div>
  
  <div class="consequences">
    <strong>Important Notice:</strong> Failure to meet the improvement milestones and success criteria by the end 
    of this PIP period may result in further disciplinary action, which could include termination of employment. 
    We encourage you to take this plan seriously and work diligently towards improvement.
  </div>
  
  <div class="acknowledgment">
    <strong>Employee Acknowledgment</strong>
    <p style="margin-top: 10px;">
      I acknowledge that I have received and understood the Performance Improvement Plan outlined above. 
      I understand the expectations set forth and commit to working towards meeting them.
    </p>
    <div style="margin-top: 30px;">
      <table style="width: 100%;">
        <tr>
          <td style="width: 60%;">
            Employee Signature: _________________________
          </td>
          <td>
            Date: _____________
          </td>
        </tr>
      </table>
    </div>
  </div>
  
  <div class="signatures">
    <div style="display: flex; justify-content: space-between;">
      <div style="width: 45%;">
        <div class="signature-line">
          <strong>${manager?.full_name || 'Reporting Manager'}</strong><br/>
          Reporting Manager
        </div>
      </div>
      <div style="width: 45%;">
        <div class="signature-line">
          <strong>HR Representative</strong><br/>
          Human Resources
        </div>
      </div>
    </div>
  </div>
  
  <div class="footer">
    <p>This document is confidential and intended solely for the named recipient.</p>
    ${customization.footerText ? `<p>${customization.footerText}</p>` : ''}
  </div>
</body>
</html>
  `;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ---- Authentication: require a logged-in user ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { pip_id }: PIPLetterRequest = await req.json();
    
    if (!pip_id) {
      return new Response(
        JSON.stringify({ error: "pip_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate pip_id is a UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pip_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid pip_id format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Generating PIP letter for PIP ID: ${pip_id}`);

    // Fetch PIP details
    const { data: pip, error: pipError } = await supabase
      .from("performance_improvement_plans")
      .select("*")
      .eq("id", pip_id)
      .single();

    if (pipError || !pip) {
      console.error("PIP not found:", pipError);
      return new Response(
        JSON.stringify({ error: "PIP not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ---- Authorization: only admin, HR PMS, the initiating manager, or the employee themselves ----
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = new Set((roleRows ?? []).map((r: any) => r.role));
    const isPrivileged = roles.has("admin") || roles.has("hr_pms") || roles.has("management");
    const isInitiator = pip.initiated_by === user.id;
    const isEmployee = pip.employee_id === user.id;

    // Also allow direct reporting manager
    let isReportingManager = false;
    if (!isPrivileged && !isInitiator && !isEmployee) {
      const { data: empProfile } = await supabase
        .from("profiles")
        .select("reporting_manager_id")
        .eq("id", pip.employee_id)
        .maybeSingle();
      isReportingManager = empProfile?.reporting_manager_id === user.id;
    }

    if (!isPrivileged && !isInitiator && !isEmployee && !isReportingManager) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch employee details
    const { data: employee, error: empError } = await supabase
      .from("profiles")
      .select(`
        *,
        department:departments(name)
      `)
      .eq("id", pip.employee_id)
      .single();

    if (empError) {
      console.error("Error fetching employee:", empError);
    }

    // Fetch manager details
    const { data: manager, error: mgrError } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", pip.initiated_by)
      .single();

    if (mgrError) {
      console.error("Error fetching manager:", mgrError);
    }

    // Fetch milestones
    const { data: milestones, error: msError } = await supabase
      .from("pip_milestones")
      .select("*")
      .eq("pip_id", pip_id)
      .order("milestone_date", { ascending: true });

    if (msError) {
      console.error("Error fetching milestones:", msError);
    }

    // Fetch customization settings
    const { data: settings } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["email_company_logo_url", "email_custom_footer", "company_name"]);

    const settingsMap = Object.fromEntries(
      (settings || []).map((s) => [s.setting_key, s.setting_value])
    );

    const cleanString = (val: any): string => {
      if (typeof val === 'string') {
        return val.replace(/^"|"$/g, '');
      }
      return String(val || '');
    };

    const customization = {
      logoUrl: cleanString(settingsMap.email_company_logo_url),
      footerText: cleanString(settingsMap.email_custom_footer),
      companyName: cleanString(settingsMap.company_name) || 'Company',
    };

    // Generate HTML
    const html = generatePIPLetterHtml(pip, employee || {}, manager || {}, milestones || [], customization);

    console.log("PIP letter HTML generated successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        html,
        pip_id,
        employee_name: employee?.full_name || 'Employee',
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error generating PIP letter:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
