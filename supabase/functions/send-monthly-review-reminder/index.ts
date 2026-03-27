import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate caller — accept service-role key, cron secret, or admin JWT
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("X-Cron-Secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    let authorized = false;

    // Check cron secret
    if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      authorized = true;
    }

    // Check service-role key via Authorization header
    if (!authorized && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (token === serviceRoleKey) {
        authorized = true;
      } else {
        // Check if valid admin user
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin");
          if (roles && roles.length > 0) authorized = true;
        }
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if email notifications are enabled and this event is active
    const { data: settings } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["email_notifications_enabled", "email_notification_events"]);

    const settingsMap = Object.fromEntries(
      (settings || []).map((s: any) => [s.setting_key, s.setting_value])
    );

    const parseStr = (val: unknown): string => {
      if (typeof val === "string") return val.replace(/^"|"$/g, "");
      return String(val || "");
    };

    if (parseStr(settingsMap.email_notifications_enabled) !== "enabled") {
      return new Response(JSON.stringify({ error: "Email notifications are disabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enabledEvents: string[] = [];
    try {
      const eventsVal = settingsMap.email_notification_events;
      if (Array.isArray(eventsVal)) enabledEvents = eventsVal;
      else if (typeof eventsVal === "string") enabledEvents = JSON.parse(eventsVal);
    } catch { /* empty */ }

    if (!enabledEvents.includes("monthly_review_reminder")) {
      return new Response(JSON.stringify({ error: "Monthly review reminder event is not enabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute last month name + current year
    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const lastMonth = monthNames[lastMonthDate.getMonth()];
    const currentYear = now.getFullYear();

    // Get company name from app_settings
    const { data: appSettings } = await supabase
      .from("app_settings")
      .select("organization_name")
      .limit(1)
      .single();
    const companyName = appSettings?.organization_name || "PMS";

    // Get all distinct employees who have KPIs for last month + current year
    const { data: kpiEmployees, error: kpiError } = await supabase
      .from("kpis")
      .select("employee_id")
      .eq("review_period", lastMonth)
      .eq("review_year", currentYear);

    if (kpiError) {
      console.error("Error querying KPIs:", kpiError);
      throw kpiError;
    }

    if (!kpiEmployees || kpiEmployees.length === 0) {
      return new Response(
        JSON.stringify({ success: true, emails_sent: 0, message: `No KPIs found for ${lastMonth} ${currentYear}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate employee IDs
    const uniqueEmployeeIds = [...new Set(kpiEmployees.map((k: any) => k.employee_id))];

    // Fetch profiles for these employees (batch in chunks of 500)
    const allProfiles: any[] = [];
    for (let i = 0; i < uniqueEmployeeIds.length; i += 500) {
      const chunk = uniqueEmployeeIds.slice(i, i + 500);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", chunk);
      if (profiles) allProfiles.push(...profiles);
    }

    // Send emails
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const profile of allProfiles) {
      if (!profile.email) continue;

      try {
        const { error } = await supabase.functions.invoke("send-email-notification", {
          body: {
            event_type: "monthly_review_reminder",
            recipient_email: profile.email,
            recipient_name: profile.full_name || "Employee",
            review_period: lastMonth,
            review_year: String(currentYear),
            company_name: companyName,
          },
        });
        if (!error) emailsSent++;
        else {
          console.error(`Failed to send to ${profile.email}:`, error);
          emailsFailed++;
        }
      } catch (e) {
        console.error(`Error sending to ${profile.email}:`, e);
        emailsFailed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        emails_sent: emailsSent,
        emails_failed: emailsFailed,
        total_employees: uniqueEmployeeIds.length,
        period: `${lastMonth} ${currentYear}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-monthly-review-reminder error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
