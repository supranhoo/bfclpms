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
    if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      authorized = true;
    }
    if (!authorized && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (token === serviceRoleKey) {
        authorized = true;
      } else {
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

    // Read all email schedule configs from system_settings
    const { data: scheduleSettings } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .like("setting_key", "email_schedule_%");

    if (!scheduleSettings || scheduleSettings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No schedule configs found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse schedule configs and find which templates should send now
    const now = new Date();
    const templateKeysToProcess: string[] = [];

    for (const setting of scheduleSettings) {
      try {
        const config = typeof setting.setting_value === "string"
          ? JSON.parse(setting.setting_value)
          : setting.setting_value;

        if (!config || config.mode !== "scheduled" || !config.time) continue;

        const timezone = config.timezone || "Asia/Kolkata";
        const scheduledTime = config.time; // "HH:MM"

        // Get current time in the configured timezone
        const nowInTz = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
        const currentHour = nowInTz.getHours();
        const currentMinute = nowInTz.getMinutes();

        const [schedHour, schedMinute] = scheduledTime.split(":").map(Number);

        // Match within a 15-minute window (since cron runs every 15 min)
        const currentTotalMin = currentHour * 60 + currentMinute;
        const schedTotalMin = schedHour * 60 + schedMinute;
        const diff = currentTotalMin - schedTotalMin;

        if (diff >= 0 && diff < 15) {
          const templateKey = setting.setting_key.replace("email_schedule_", "");
          templateKeysToProcess.push(templateKey);
        }
      } catch {
        // Skip invalid configs
      }
    }

    if (templateKeysToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No templates scheduled for this time window" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing scheduled emails for templates: ${templateKeysToProcess.join(", ")}`);

    // ------------------------------------------------------------------
    // ADR-205 — PIP milestone reminder producer.
    // The `pip_milestone_reminder` template existed with no producer, so the
    // reminder never fired. When that template is due in this window we
    // enqueue one row per milestone that is either approaching (within
    // `pip_milestone_lead_days`) or overdue (up to `pip_milestone_overdue_days`).
    // Idempotency: a milestone is skipped if a queue row for it already exists
    // in the last 24h (sent or not), so a re-run cannot double-send.
    // ------------------------------------------------------------------
    if (templateKeysToProcess.includes("pip_milestone_reminder")) {
      try {
        const { data: slaRows } = await supabase
          .from("system_settings")
          .select("setting_key, setting_value")
          .in("setting_key", ["pip_milestone_lead_days", "pip_milestone_overdue_days"]);

        const num = (key: string, fallback: number) => {
          const raw = slaRows?.find((r: any) => r.setting_key === key)?.setting_value;
          const parsed = Number(typeof raw === "string" ? raw.replace(/"/g, "") : raw);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
        };
        const leadDays = num("pip_milestone_lead_days", 3);
        const overdueDays = num("pip_milestone_overdue_days", 7);

        const day = 24 * 60 * 60 * 1000;
        const fromDate = new Date(now.getTime() - overdueDays * day).toISOString().split("T")[0];
        const toDate = new Date(now.getTime() + leadDays * day).toISOString().split("T")[0];

        const { data: dueMilestones, error: msErr } = await supabase
          .from("pip_milestones")
          .select(
            "id, milestone_date, description, expected_outcome, pip_id, performance_improvement_plans!inner(id, status, employee_id, initiated_by)"
          )
          .eq("status", "pending")
          .gte("milestone_date", fromDate)
          .lte("milestone_date", toDate)
          .in("performance_improvement_plans.status", ["active", "extended"])
          .limit(500);

        if (msErr) throw msErr;

        if (dueMilestones && dueMilestones.length > 0) {
          const recipientIds = new Set<string>();
          for (const ms of dueMilestones as any[]) {
            recipientIds.add(ms.performance_improvement_plans.employee_id);
            recipientIds.add(ms.performance_improvement_plans.initiated_by);
          }

          const { data: people } = await supabase
            .from("profiles")
            .select("id, full_name, email, is_active")
            .in("id", Array.from(recipientIds));
          const byId = new Map((people ?? []).map((p: any) => [p.id, p]));

          const dedupeCutoff = new Date(now.getTime() - day).toISOString();
          const { data: recentQueue } = await supabase
            .from("email_dispatch_queue")
            .select("metadata")
            .eq("template_key", "pip_milestone_reminder")
            .gte("created_at", dedupeCutoff)
            .limit(2000);
          const alreadyQueued = new Set(
            (recentQueue ?? [])
              .map((r: any) => `${r.metadata?.milestone_id}:${r.metadata?.recipient_id}`)
              .filter(Boolean)
          );

          const rows: any[] = [];
          for (const ms of dueMilestones as any[]) {
            const plan = ms.performance_improvement_plans;
            const overdue = ms.milestone_date < now.toISOString().split("T")[0];
            for (const personId of [plan.employee_id, plan.initiated_by]) {
              const person = byId.get(personId);
              if (!person?.email || person.is_active === false) continue;
              if (alreadyQueued.has(`${ms.id}:${personId}`)) continue;
              alreadyQueued.add(`${ms.id}:${personId}`);
              rows.push({
                template_key: "pip_milestone_reminder",
                recipient_email: person.email,
                recipient_name: person.full_name,
                metadata: {
                  recipient_id: personId,
                  milestone_id: ms.id,
                  pip_id: plan.id,
                  milestone_date: ms.milestone_date,
                  milestone_description: ms.description,
                  expected_outcome: ms.expected_outcome,
                  is_overdue: overdue,
                },
              });
            }
          }

          if (rows.length > 0) {
            const { error: insErr } = await supabase.from("email_dispatch_queue").insert(rows);
            if (insErr) throw insErr;
            console.log(`Enqueued ${rows.length} PIP milestone reminder(s)`);
          }
        }
      } catch (err) {
        // Never let the producer break the dispatch loop for other templates.
        console.error("PIP milestone reminder producer failed:", err);
      }
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const templateKey of templateKeysToProcess) {
      // Fetch pending (unsent) queue items for this template, skip stale items > 24h
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const { data: pendingItems, error: fetchError } = await supabase
        .from("email_dispatch_queue")
        .select("*")
        .eq("template_key", templateKey)
        .is("sent_at", null)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(500);

      if (fetchError) {
        console.error(`Error fetching queue for ${templateKey}:`, fetchError);
        continue;
      }

      if (!pendingItems || pendingItems.length === 0) continue;

      console.log(`Found ${pendingItems.length} pending emails for template: ${templateKey}`);

      for (const item of pendingItems) {
        try {
          // Send via send-email-notification, passing _from_scheduler flag
          const { error: sendError } = await supabase.functions.invoke("send-email-notification", {
            body: {
              ...item.metadata,
              event_type: templateKey,
              recipient_email: item.recipient_email,
              recipient_name: item.recipient_name,
              _from_scheduler: true, // bypass queue-check in send-email-notification
            },
          });

          if (sendError) {
            console.error(`Failed to send queued email ${item.id}:`, sendError);
            totalFailed++;
          } else {
            // Mark as sent
            await supabase
              .from("email_dispatch_queue")
              .update({ sent_at: new Date().toISOString() })
              .eq("id", item.id);
            totalProcessed++;
          }
        } catch (err) {
          console.error(`Error processing queue item ${item.id}:`, err);
          totalFailed++;
        }
      }
    }

    // Clean up old sent items (older than 7 days)
    const cleanupCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("email_dispatch_queue")
      .delete()
      .not("sent_at", "is", null)
      .lt("sent_at", cleanupCutoff);

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        failed: totalFailed,
        templates_checked: templateKeysToProcess,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-scheduled-emails error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
