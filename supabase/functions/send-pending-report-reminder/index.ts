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

    // Validate caller — mandatory auth: accept user JWT or service-role key
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceRoleKey) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify admin role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin");
      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { review_period, review_year } = await req.json();
    if (!review_period || !review_year) {
      return new Response(JSON.stringify({ error: "review_period and review_year are required" }), {
        status: 400,
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

    if (!enabledEvents.includes("org_kpi_pending_reminder")) {
      return new Response(JSON.stringify({ error: "Pending KPI reminder event is not enabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all org-level KPIs for the period (distinct by category+kra+kpi)
    const { data: orgKpis } = await supabase
      .from("kpis")
      .select("category_id, kra_name, kpi_name, target_value, uom, kra_categories(name)")
      .eq("is_org_level", true)
      .eq("review_period", review_period)
      .eq("review_year", review_year);

    if (!orgKpis || orgKpis.length === 0) {
      return new Response(JSON.stringify({ success: true, owners_notified: 0, total_pending: 0, message: "No org-level KPIs found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate KPIs by category+kra+kpi
    const uniqueKpis = new Map<string, typeof orgKpis[0]>();
    orgKpis.forEach(k => {
      const key = `${k.category_id}||${k.kra_name}||${k.kpi_name}`;
      if (!uniqueKpis.has(key)) uniqueKpis.set(key, k);
    });

    // Get existing values to determine which are pending
    const { data: existingValues } = await supabase
      .from("org_kpi_values")
      .select("category_id, kra_name, kpi_name, achieved_value, is_na")
      .eq("review_period", review_period)
      .eq("review_year", review_year);

    const enteredSet = new Set<string>();
    (existingValues || []).forEach(v => {
      if (v.achieved_value !== null || v.is_na) {
        enteredSet.add(`${v.category_id}||${v.kra_name}||${v.kpi_name}`);
      }
    });

    // Find pending KPIs
    const pendingKpis: Array<{ category: string; kra_name: string; kpi_name: string; target: string; uom: string; category_id: string }> = [];
    uniqueKpis.forEach((kpi, key) => {
      if (!enteredSet.has(key)) {
        pendingKpis.push({
          category: (kpi.kra_categories as any)?.name || "",
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
          target: kpi.target_value != null ? String(kpi.target_value) : "-",
          uom: kpi.uom || "-",
          category_id: kpi.category_id,
        });
      }
    });

    if (pendingKpis.length === 0) {
      return new Response(JSON.stringify({ success: true, owners_notified: 0, total_pending: 0, message: "No pending KPIs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get data owners with profiles
    const { data: owners } = await supabase
      .from("org_kpi_data_owners")
      .select("category_id, kra_name, kpi_name, owner_id, profiles:owner_id(full_name, email)");

    if (!owners || owners.length === 0) {
      return new Response(JSON.stringify({ success: true, owners_notified: 0, total_pending: pendingKpis.length, message: "No data owners assigned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group pending KPIs by owner
    const ownerPendingMap = new Map<string, {
      email: string;
      name: string;
      kpis: typeof pendingKpis;
    }>();

    owners.forEach(o => {
      const key = `${o.category_id}||${o.kra_name}||${o.kpi_name}`;
      const pending = pendingKpis.find(p => `${p.category_id}||${p.kra_name}||${p.kpi_name}` === key);
      if (!pending) return; // Not pending, skip

      const profile = o.profiles as any;
      if (!profile?.email) return;

      const existing = ownerPendingMap.get(o.owner_id) || {
        email: profile.email,
        name: profile.full_name || "Data Owner",
        kpis: [],
      };
      existing.kpis.push(pending);
      ownerPendingMap.set(o.owner_id, existing);
    });

    // Send emails via the send-email-notification function
    let ownersNotified = 0;
    let totalPending = 0;

    for (const [_ownerId, ownerData] of ownerPendingMap) {
      totalPending += ownerData.kpis.length;

      // Build HTML table
      const tableRows = ownerData.kpis.map((k, i) => `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:8px 12px;text-align:center;font-size:13px;">${i + 1}</td>
          <td style="padding:8px 12px;font-size:13px;">${k.category}</td>
          <td style="padding:8px 12px;font-size:13px;">${k.kra_name}</td>
          <td style="padding:8px 12px;font-size:13px;">${k.kpi_name}</td>
          <td style="padding:8px 12px;text-align:center;font-size:13px;">${k.target}</td>
          <td style="padding:8px 12px;text-align:center;font-size:13px;">${k.uom}</td>
        </tr>`).join("");

      const pendingTable = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;margin:16px 0;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Category</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">KRA</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">KPI</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Target</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">UOM</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`;

      // Invoke the central email function
      try {
        const { error } = await supabase.functions.invoke("send-email-notification", {
          body: {
            event_type: "org_kpi_pending_reminder",
            recipient_email: ownerData.email,
            recipient_name: ownerData.name,
            review_period: review_period,
            review_year: review_year,
            pending_count: String(ownerData.kpis.length),
            pending_table: pendingTable,
          },
        });
        if (!error) ownersNotified++;
        else console.error(`Failed to send to ${ownerData.email}:`, error);
      } catch (e) {
        console.error(`Error sending to ${ownerData.email}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, owners_notified: ownersNotified, total_pending: totalPending }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-pending-report-reminder error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
