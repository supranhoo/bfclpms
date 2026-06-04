import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function maskEmail(addr: string) {
  const [local, domain] = addr.split("@");
  if (!domain) return { masked: "***", domain: "" };
  const head = local.length > 0 ? local[0] : "*";
  return { masked: `${head}***@${domain}`, domain };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      reply_to: opts.replyTo,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: j };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const client_id = String(body?.client_id ?? "");
    const to_email = String(body?.to_email ?? "").trim();
    const template_key = body?.template_key ? String(body.template_key) : null;
    if (!/^[0-9a-f-]{36}$/i.test(client_id)) return json({ error: "invalid_client_id" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to_email)) return json({ error: "invalid_email" }, 400);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    const [{ data: ownerRow }, { data: assignRow }] = await Promise.all([
      svc.from("user_roles").select("role").eq("user_id", user.id).eq("role", "platform_owner").maybeSingle(),
      svc.from("client_implementer_assignments").select("id").eq("user_id", user.id).eq("client_id", client_id).maybeSingle(),
    ]);
    if (!ownerRow && !assignRow) return json({ error: "forbidden" }, 403);

    const { data: client } = await svc.from("clients").select("id, client_key, display_name").eq("id", client_id).maybeSingle();
    if (!client) return json({ error: "client_not_found" }, 404);

    // Load sender identity
    const { data: smtp } = await svc
      .from("client_smtp_config")
      .select("from_name, from_email, reply_to, provider, secret_ref, secret_set_at")
      .eq("client_id", client_id).maybeSingle();
    if (!smtp || !smtp.from_email || !smtp.provider) {
      return json({ error: "sender_identity_incomplete" }, 400);
    }
    if (!smtp.secret_set_at && smtp.provider !== "lovable") {
      return json({ error: "secret_not_set" }, 400);
    }

    // Recipient allowlist for implementation_admin (platform_owner is unrestricted).
    // Allowed: same domain as sender's from_email, OR the caller's own auth email.
    if (!ownerRow) {
      const recipientDomain = to_email.split("@")[1]?.toLowerCase() ?? "";
      const fromDomain = (smtp.from_email as string).split("@")[1]?.toLowerCase() ?? "";
      const callerEmail = (user.email ?? "").toLowerCase();
      const allowed =
        (fromDomain && recipientDomain === fromDomain) ||
        (callerEmail && to_email.toLowerCase() === callerEmail);
      if (!allowed) {
        return json({ error: "recipient_not_allowed", allowed_domain: fromDomain }, 400);
      }
    }

    // ATOMIC rate-limit pre-increment — counts every attempt, not just successes.
    const bucket = new Date();
    bucket.setMinutes(0, 0, 0);
    const bucket_hour = bucket.toISOString();
    const { data: newCount, error: rateErr } = await svc.rpc("impl_console_try_increment_rate", {
      _actor_id: user.id,
      _client_id: client_id,
      _action: "test_email_send",
      _bucket_hour: bucket_hour,
      _limit: RATE_LIMIT,
    });
    if (rateErr) {
      console.error("rate increment failed");
      return json({ error: "rate_check_failed" }, 500);
    }
    if (newCount === null) {
      const retryAfter = Math.max(1, Math.ceil((bucket.getTime() + 3600_000 - Date.now()) / 1000));
      return json({ error: "rate_limited", retry_after_seconds: retryAfter, used: RATE_LIMIT, limit: RATE_LIMIT }, 429);
    }
    const used = newCount as number;

    // Resolve secret bytes for non-lovable providers
    let apiKey = "";
    if (smtp.provider === "resend" || smtp.provider === "sendgrid" || smtp.provider === "smtp") {
      const { data: sec } = await svc.from("system_settings").select("setting_value").eq("setting_key", smtp.secret_ref).maybeSingle();
      apiKey = (sec?.setting_value as string) ?? "";
      if (!apiKey) return json({ error: "secret_missing" }, 500);
    } else if (smtp.provider === "lovable") {
      apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
      if (!apiKey) return json({ error: "lovable_provider_unavailable" }, 500);
    }

    const subject = `PMS test email — ${client.display_name}`;
    const text = [
      `This is a test email from the Implementation Console.`,
      ``,
      `Client: ${client.display_name} (${client.client_key})`,
      `Triggered by: ${user.email ?? user.id}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join("\n");

    const fromAddress = smtp.from_name
      ? `${smtp.from_name} <${smtp.from_email}>`
      : smtp.from_email;

    let result: { ok: boolean; status: number; body: any } = { ok: false, status: 0, body: null };
    if (smtp.provider === "resend" || smtp.provider === "lovable") {
      result = await sendViaResend({
        apiKey,
        from: fromAddress,
        to: to_email,
        subject,
        text,
        replyTo: smtp.reply_to ?? undefined,
      });
    } else {
      return json({ error: "provider_not_implemented", provider: smtp.provider }, 501);
    }

    const masked = maskEmail(to_email);
    const recipientHash = (await sha256Hex(to_email.toLowerCase())).slice(0, 16);
    await svc.from("entitlement_audit").insert({
      actor_id: user.id,
      event_type: "update",
      entity_type: "client_smtp",
      entity_key: client.client_key,
      client_id,
      before: null,
      after: {
        recipient_masked: masked.masked,
        recipient_domain: masked.domain,
        recipient_hash: recipientHash,
        template_key,
        provider: smtp.provider,
        success: result.ok,
        status: result.status,
      },
      reason: "impl_console_test_email_send_client_smtp",
    });

    if (!result.ok) {
      return json({ ok: false, provider: smtp.provider, status: result.status, error: "send_failed", used, limit: RATE_LIMIT }, 502);
    }
    return json({ ok: true, provider: smtp.provider, message_id: result.body?.id, used, limit: RATE_LIMIT });
  } catch (e: any) {
    console.error("test email error", e?.name ?? "unknown");
    return json({ error: "internal_error" }, 500);
  }
});