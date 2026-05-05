import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;

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

    const body = await req.json();
    const { frequency: rawFrequency, day: rawDay, hour: rawHour, dayOfMonth: rawDom, enabled } = body ?? {};

    // ---- Strict input validation (defence-in-depth on top of admin auth) ----
    const ALLOWED_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
    const ALLOWED_DAYS = Object.keys(DAY_MAP);

    const frequency = ALLOWED_FREQUENCIES.includes(rawFrequency)
      ? rawFrequency
      : "weekly";

    const hourNum = Number(rawHour);
    if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
      return new Response(
        JSON.stringify({ error: "Invalid 'hour' — must be integer 0-23" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const hour = hourNum;

    const day = typeof rawDay === "string" && ALLOWED_DAYS.includes(rawDay) ? rawDay : "sunday";

    let dayOfMonth: number = 1;
    if (rawDom !== undefined && rawDom !== null) {
      const domNum = Number(rawDom);
      if (!Number.isInteger(domNum) || domNum < 1 || domNum > 31) {
        return new Response(
          JSON.stringify({ error: "Invalid 'dayOfMonth' — must be integer 1-31" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      dayOfMonth = domNum;
    }

    // Connect directly to Postgres to manage cron jobs
    const sql = postgres(dbUrl, { ssl: "require" });

    try {
      // Unschedule existing job (ignore if not found)
      await sql`SELECT cron.unschedule('weekly-database-backup')`.catch(() => {});

      if (enabled !== false) {
        const cronExpr = buildCron(frequency, hour, day, dayOfMonth);

        // Schedule the new cron job that calls create-backup via net.http_post
        const cronSecretValue = Deno.env.get('CRON_SECRET') || '';
        await sql.unsafe(`
          SELECT cron.schedule(
            'weekly-database-backup',
            '${cronExpr}',
            $$
            SELECT net.http_post(
              url := '${supabaseUrl}/functions/v1/create-backup',
              headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}", "X-Cron-Secret": "${cronSecretValue}"}'::jsonb,
              body := '{"backup_type": "scheduled"}'::jsonb
            ) AS request_id;
            $$
          );
        `);
      }

      // Save schedule to system_settings
      const scheduleValue = JSON.stringify({
        frequency: frequency ?? "weekly",
        day: day ?? "sunday",
        hour: hour ?? 2,
        dayOfMonth: dayOfMonth ?? 1,
      });

      await sql`
        INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
        VALUES ('backup_schedule', ${scheduleValue}, now())
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = ${scheduleValue}, updated_at = now()
      `;
    } finally {
      await sql.end();
    }

    return new Response(
      JSON.stringify({
        success: true,
        schedule: { frequency, day, hour, dayOfMonth },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
