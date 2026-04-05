import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate cron/service-role caller
    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("apikey");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const validKeys = new Set<string>();
    if (anonKey) validKeys.add(anonKey);
    if (serviceRoleKey) validKeys.add(serviceRoleKey);

    let authorized = false;
    if (apiKeyHeader && validKeys.has(apiKeyHeader)) authorized = true;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (validKeys.has(token)) authorized = true;
    }

    // Also accept CRON_SECRET
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret) {
      try {
        const body = await req.clone().json();
        if (body?.cron_secret === cronSecret) authorized = true;
      } catch { /* not JSON body, ignore */ }
    }

    if (!authorized) {
      console.log("[reminders] Unauthorized caller");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey!, {
      auth: { persistSession: false },
    });

    // Check if email notifications are enabled
    const { data: enabledSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "email_notifications_enabled")
      .maybeSingle();

    const emailEnabled = enabledSetting?.setting_value
      ? String(enabledSetting.setting_value).replace(/^"|"$/g, "") === "enabled"
      : false;

    if (!emailEnabled) {
      console.log("[reminders] Email notifications are disabled, skipping");
      return new Response(JSON.stringify({ skipped: true, reason: "Email notifications disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check which reminder events are enabled
    const { data: eventsSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "email_notification_events")
      .maybeSingle();

    let enabledEvents: string[] = [];
    try {
      const val = eventsSetting?.setting_value;
      if (Array.isArray(val)) enabledEvents = val;
      else if (typeof val === "string") enabledEvents = JSON.parse(val);
    } catch { /* default empty */ }

    const queryReminderEnabled = enabledEvents.includes("query_response_reminder");
    const observationReminderEnabled = enabledEvents.includes("observation_response_reminder");

    if (!queryReminderEnabled && !observationReminderEnabled) {
      console.log("[reminders] Both reminder event types are disabled, skipping");
      return new Response(JSON.stringify({ skipped: true, reason: "Reminder events disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let queriesSent = 0;
    let observationsSent = 0;

    // --- Process open queries ---
    if (queryReminderEnabled) {
      const { data: openQueries, error: qErr } = await supabase
        .from("kpi_queries")
        .select(`
          id, reason, created_at, query_type,
          kpi_id, raised_to, raised_by,
          kpis:kpi_id ( kpi_name, kra_name, review_period, review_year ),
          raised_to_profile:profiles!kpi_queries_raised_to_fkey ( full_name, email ),
          raised_by_profile:profiles!kpi_queries_raised_by_fkey ( full_name )
        `)
        .eq("status", "open");

      if (qErr) {
        console.error("[reminders] Error fetching open queries:", qErr);
      } else if (openQueries && openQueries.length > 0) {
        // Group by raised_to
        const grouped: Record<string, {
          recipientName: string;
          recipientEmail: string;
          queries: Array<{
            kpiName: string;
            kraName: string;
            raisedBy: string;
            reason: string;
            date: string;
            period: string;
            year: string;
          }>;
        }> = {};

        for (const q of openQueries) {
          const recipientId = q.raised_to;
          const profile = q.raised_to_profile as any;
          const kpi = q.kpis as any;
          const raiserProfile = q.raised_by_profile as any;

          if (!profile?.email) continue;

          if (!grouped[recipientId]) {
            grouped[recipientId] = {
              recipientName: profile.full_name || "Team Member",
              recipientEmail: profile.email,
              queries: [],
            };
          }

          grouped[recipientId].queries.push({
            kpiName: kpi?.kpi_name ? String(kpi.kpi_name).split("\n")[0].substring(0, 80) : "N/A",
            kraName: kpi?.kra_name || "N/A",
            raisedBy: raiserProfile?.full_name || "Unknown",
            reason: q.reason ? String(q.reason).substring(0, 100) : "N/A",
            date: new Date(q.created_at).toLocaleDateString("en-IN"),
            period: kpi?.review_period || "",
            year: kpi?.review_year ? String(kpi.review_year) : "",
          });
        }

        // Send consolidated reminder per recipient
        for (const [, info] of Object.entries(grouped)) {
          const queryTableRows = info.queries.map((q, i) =>
            `${i + 1}. ${q.kpiName} (${q.period} ${q.year}) — raised by ${q.raisedBy} on ${q.date}`
          ).join("\n");

          try {
            await supabase.functions.invoke("send-email-notification", {
              body: {
                event_type: "query_response_reminder",
                recipient_email: info.recipientEmail,
                recipient_name: info.recipientName,
                metadata: {
                  recipient_name: info.recipientName,
                  pending_count: String(info.queries.length),
                  pending_list: queryTableRows,
                },
              },
            });
            queriesSent++;
          } catch (e) {
            console.error(`[reminders] Failed to send query reminder to ${info.recipientEmail}:`, e);
          }
        }
      }
    }

    // --- Process open observations ---
    if (observationReminderEnabled) {
      const { data: openObservations, error: oErr } = await supabase
        .from("kpi_observations")
        .select(`
          id, title, observation_type, created_at, status,
          kpi_id,
          created_by,
          kpis:kpi_id ( kpi_name, kra_name, review_period, review_year, employee_id ),
          creator_profile:profiles!kpi_observations_created_by_fkey ( full_name )
        `)
        .eq("status", "open");

      if (oErr) {
        console.error("[reminders] Error fetching open observations:", oErr);
      } else if (openObservations && openObservations.length > 0) {
        // For observations, the tagged employee is the KPI owner (employee_id on the KPI)
        // Group by KPI employee
        const employeeIds = new Set<string>();
        for (const obs of openObservations) {
          const kpi = obs.kpis as any;
          if (kpi?.employee_id) employeeIds.add(kpi.employee_id);
        }

        // Fetch employee profiles
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", Array.from(employeeIds));

        const profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, p])
        );

        const grouped: Record<string, {
          recipientName: string;
          recipientEmail: string;
          observations: Array<{
            kpiName: string;
            title: string;
            raisedBy: string;
            date: string;
            period: string;
            year: string;
          }>;
        }> = {};

        for (const obs of openObservations) {
          const kpi = obs.kpis as any;
          if (!kpi?.employee_id) continue;

          const profile = profileMap.get(kpi.employee_id);
          if (!profile?.email) continue;

          const employeeId = kpi.employee_id;
          if (!grouped[employeeId]) {
            grouped[employeeId] = {
              recipientName: profile.full_name || "Team Member",
              recipientEmail: profile.email,
              observations: [],
            };
          }

          const creator = obs.creator_profile as any;
          grouped[employeeId].observations.push({
            kpiName: kpi.kpi_name ? String(kpi.kpi_name).split("\n")[0].substring(0, 80) : "N/A",
            title: obs.title || "Observation",
            raisedBy: creator?.full_name || "Unknown",
            date: new Date(obs.created_at).toLocaleDateString("en-IN"),
            period: kpi.review_period || "",
            year: kpi.review_year ? String(kpi.review_year) : "",
          });
        }

        // Send consolidated reminder per employee
        for (const [, info] of Object.entries(grouped)) {
          const obsListRows = info.observations.map((o, i) =>
            `${i + 1}. "${o.title}" on ${o.kpiName} (${o.period} ${o.year}) — raised by ${o.raisedBy} on ${o.date}`
          ).join("\n");

          try {
            await supabase.functions.invoke("send-email-notification", {
              body: {
                event_type: "observation_response_reminder",
                recipient_email: info.recipientEmail,
                recipient_name: info.recipientName,
                metadata: {
                  recipient_name: info.recipientName,
                  pending_count: String(info.observations.length),
                  pending_list: obsListRows,
                },
              },
            });
            observationsSent++;
          } catch (e) {
            console.error(`[reminders] Failed to send observation reminder to ${info.recipientEmail}:`, e);
          }
        }
      }
    }

    console.log(`[reminders] Completed. Query reminders: ${queriesSent}, Observation reminders: ${observationsSent}`);
    return new Response(
      JSON.stringify({ success: true, queriesSent, observationsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[reminders] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
