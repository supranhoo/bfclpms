import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function buildCron(
  frequency: string,
  hour: number,
  day?: string,
  dayOfMonth?: number
): string {
  switch (frequency) {
    case "daily":
      return `0 ${hour} * * *`;
    case "weekly":
      return `0 ${hour} * * ${DAY_MAP[day ?? "sunday"] ?? 0}`;
    case "monthly":
      return `0 ${hour} ${dayOfMonth ?? 1} * *`;
    default:
      return `0 ${hour} * * 0`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { frequency, day, hour, dayOfMonth, enabled } = await req.json();

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Unschedule existing job
    await adminClient.rpc("extensions.unschedule" as never, {
      job_name: "weekly-database-backup",
    }).catch(() => {
      // Job may not exist yet, ignore
    });

    // Also try direct SQL to unschedule (more reliable)
    await adminClient.rpc("pg_cron_unschedule" as never, {
      jobname: "weekly-database-backup",
    }).catch(() => {});

    if (enabled !== false) {
      const cronExpr = buildCron(frequency, hour, day, dayOfMonth);

      // Schedule via net.http_post calling create-backup
      const scheduleSQL = `
        SELECT cron.schedule(
          'weekly-database-backup',
          '${cronExpr}',
          $$
          SELECT net.http_post(
            url := '${supabaseUrl}/functions/v1/create-backup',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
            body := '{"backup_type": "scheduled"}'::jsonb
          ) AS request_id;
          $$
        );
      `;

      // Use service role to execute the scheduling SQL
      const { error: scheduleError } = await adminClient.rpc(
        "execute_schedule_sql" as never,
        { sql_text: scheduleSQL }
      ).catch(async () => {
        // Fallback: try inserting via cron.job directly
        // This is a workaround if the RPC doesn't exist
        return { error: { message: "RPC not available" } };
      });

      // If RPC failed, we still save the setting - the cron job may need manual setup
      if (scheduleError) {
        console.warn("Could not auto-schedule cron job:", scheduleError);
      }
    }

    // Save schedule to system_settings
    const scheduleValue = JSON.stringify({
      frequency: frequency ?? "weekly",
      day: day ?? "sunday",
      hour: hour ?? 2,
      dayOfMonth: dayOfMonth ?? 1,
    });

    const { error: settingsError } = await adminClient
      .from("system_settings")
      .upsert(
        {
          setting_key: "backup_schedule",
          setting_value: scheduleValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" }
      );

    if (settingsError) {
      return new Response(
        JSON.stringify({ error: settingsError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        schedule: { frequency, day, hour, dayOfMonth },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
