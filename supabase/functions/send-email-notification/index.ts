import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Get SMTP password: env secret first, then fall back to system_settings
const getSmtpPassword = async (supabase: any): Promise<string | null> => {
  const envPassword = Deno.env.get("SMTP_PASSWORD");
  if (envPassword) return envPassword;

  try {
    const { data } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "smtp_password")
      .single();
    if (data?.setting_value) {
      const val = data.setting_value;
      if (typeof val === "string") return val.replace(/^"|"$/g, "");
      return String(val);
    }
  } catch (e) {
    console.error("Failed to read smtp_password from system_settings:", e);
  }
  return null;
};

// Get a secret from system_settings
const getSecretFromSettings = async (supabase: any, key: string): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", key)
      .single();
    if (data?.setting_value) {
      const val = data.setting_value;
      if (typeof val === "string") return val.replace(/^"|"$/g, "");
      return String(val);
    }
  } catch (e) {
    console.error(`Failed to read ${key} from system_settings:`, e);
  }
  return null;
};

// Send email via Microsoft Graph API (OAuth2 client credentials)
const sendViaMicrosoftGraph = async (
  supabase: any,
  tenantId: string,
  clientId: string,
  fromAddress: string,
  fromName: string,
  toEmail: string,
  subject: string,
  html: string
): Promise<void> => {
  const clientSecret = await getSecretFromSettings(supabase, "graph_client_secret");
  if (!clientSecret) {
    throw new Error("Microsoft Graph Client Secret not configured. Please set it in System Settings → Email.");
  }

  console.log(`Getting OAuth2 token for tenant ${tenantId}`);

  const tokenUrl = `https://login.microsoftonline.com/${tenantId.trim()}/oauth2/v2.0/token`;
  const tokenBody = new URLSearchParams({
    client_id: clientId.trim(),
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });

  if (!tokenResponse.ok) {
    const tokenError = await tokenResponse.text();
    console.error("OAuth2 token error:", tokenError);
    throw new Error(`Failed to get Microsoft OAuth2 token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  console.log(`Sending email via Graph API from ${fromAddress} to ${toEmail}`);

  const graphUrl = `https://graph.microsoft.com/v1.0/users/${fromAddress.trim()}/sendMail`;
  const graphBody = {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      from: { emailAddress: { address: fromAddress.trim(), name: fromName.trim() } },
      toRecipients: [{ emailAddress: { address: toEmail.trim() } }],
    },
    saveToSentItems: false,
  };

  const graphResponse = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(graphBody),
  });

  if (!graphResponse.ok) {
    const graphError = await graphResponse.text();
    console.error("Graph API send error:", graphError);
    throw new Error(`Microsoft Graph API error: ${graphResponse.status} - ${graphError}`);
  }

  console.log("Microsoft Graph email sent successfully");
};

interface TestEmailRequest {
  test: true;
  recipient_email: string;
}

interface SmtpTestRequest {
  smtp_test: true;
  smtp_host: string;
  smtp_port: number;
  smtp_security: 'tls' | 'starttls' | 'none';
  smtp_username: string;
  smtp_from_address: string;
  smtp_from_name: string;
  recipient_email: string;
}

// Default templates for each event type
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  kpi_submitted: {
    subject: '[PMS] New KPI Submitted for Review - {{actor_name}}',
    body: `Hi {{recipient_name}},

{{actor_name}} has submitted their self-review for:

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please review and provide your feedback.`,
  },
  manager_approved: {
    subject: '[PMS] Your KPI Has Been Approved',
    body: `Hi {{recipient_name}},

Great news! Your KPI has been approved by your manager.

KRA: {{kra_name}}
KPI: {{kpi_name}}

The review will now proceed to the next stage.`,
  },
  manager_rejected: {
    subject: '[PMS] Action Required: KPI Sent Back for Revision',
    body: `Hi {{recipient_name}},

Your KPI has been sent back for revision.

KRA: {{kra_name}}
KPI: {{kpi_name}}

Please review the feedback and update your submission.`,
  },
  query_raised: {
    subject: '[PMS] New Query Raised on Your KPI',
    body: `Hi {{recipient_name}},

{{actor_name}} has raised a query on your KPI.

KPI: {{kpi_name}}
Query: {{query_reason}}

Please respond to this query at your earliest convenience.`,
  },
  query_resolved: {
    subject: '[PMS] Your Query Has Been Resolved',
    body: `Hi {{recipient_name}},

Your query has been resolved by {{actor_name}}.

KPI: {{kpi_name}}
Resolution: {{resolution_notes}}`,
  },
  final_approved: {
    subject: '[PMS] 🎉 Your KPI Has Been Finalized',
    body: `Hi {{recipient_name}},

Congratulations! Your KPI has received final approval and is now complete.

KRA: {{kra_name}}
KPI: {{kpi_name}}

Thank you for your contribution!`,
  },
  kra_assigned: {
    subject: '[PMS] New KRA Assigned to You',
    body: `Hi {{recipient_name}},

A new KRA has been assigned to you.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please review your new assignment.`,
  },
  period_locked: {
    subject: '[PMS] Review Period Has Been Locked',
    body: `Hi {{recipient_name}},

The review period {{review_period}} {{review_year}} has been locked.

No further changes can be made to KPIs in this period unless unlocked by an administrator.`,
  },
  pip_initiated: {
    subject: '[PMS] Performance Improvement Plan Notification',
    body: `Hi {{recipient_name}},

You have been placed on a Performance Improvement Plan (PIP).

Start Date: {{pip_start_date}}
End Date: {{pip_end_date}}
Reason: {{pip_reason}}

Please check your email or contact HR for the formal PIP letter with detailed information about the improvement areas, milestones, and expectations.

We encourage you to take this opportunity seriously and work towards meeting the improvement goals.`,
  },
  pip_milestone_reminder: {
    subject: '[PMS] PIP Milestone Check-in Reminder',
    body: `Hi {{recipient_name}},

This is a reminder that you have an upcoming PIP milestone check-in.

Milestone Date: {{milestone_date}}
Description: {{milestone_description}}
Expected Outcome: {{milestone_expected_outcome}}

Please prepare for your check-in meeting with your manager.`,
  },
  pip_completed: {
    subject: '[PMS] 🎉 Performance Improvement Plan Completed',
    body: `Hi {{recipient_name}},

Congratulations! Your Performance Improvement Plan has been successfully completed.

Outcome: {{pip_outcome}}
Remarks: {{pip_remarks}}

Thank you for your dedication and hard work during this period. We appreciate your commitment to improvement.`,
  },
  // New templates for previously unmapped notification types
  kpi_ready_for_audit: {
    subject: '[PMS] KPI Ready for Audit Review',
    body: `Hi {{recipient_name}},

A KPI is ready for your audit review.

KRA: {{kra_name}}
KPI: {{kpi_name}}

Please review and provide your assessment.`,
  },
  kpi_ready_for_management: {
    subject: '[PMS] KPI Ready for Management Review',
    body: `Hi {{recipient_name}},

A KPI is ready for management review.

KRA: {{kra_name}}
KPI: {{kpi_name}}

Please review and provide final approval.`,
  },
  query_response_received: {
    subject: '[PMS] Query Response Received',
    body: `Hi {{recipient_name}},

A response has been submitted to your query.

KPI: {{kpi_name}}
Resolution: {{resolution_notes}}

Please review the response and take appropriate action.`,
  },
  admin_status_change: {
    subject: '[PMS] Admin Status Change on Your KPI',
    body: `Hi {{recipient_name}},

An administrator has changed the status of your KPI.

KPI: {{kpi_name}}

Please check your dashboard for updated details.`,
  },
  admin_data_entry: {
    subject: '[PMS] Admin Data Entry on Your KPI',
    body: `Hi {{recipient_name}},

An administrator has entered data for your KPI.

KPI: {{kpi_name}}

Please check your dashboard for updated details.`,
  },
  admin_data_override: {
    subject: '[PMS] Admin Data Override on Your KPI',
    body: `Hi {{recipient_name}},

An administrator has overridden data on your KPI.

KPI: {{kpi_name}}

Please check your dashboard for updated details.`,
  },
  org_kpi_sent_back: {
    subject: '[PMS] Org KPI Data Sent Back for Revision',
    body: `Hi {{recipient_name}},

The org KPI data you submitted has been sent back for revision.

KPI: {{kpi_name}}
Reason: {{send_back_reason}}

Please review the feedback and resubmit the data.`,
  },
};

const EVENT_STYLES: Record<string, { color: string; emoji: string; title: string }> = {
  kpi_submitted: { color: '#6366f1', emoji: '📝', title: 'Self Review Submitted' },
  manager_approved: { color: '#10b981', emoji: '✅', title: 'KPI Approved' },
  manager_rejected: { color: '#f59e0b', emoji: '🔄', title: 'KPI Sent Back' },
  query_raised: { color: '#f43f5e', emoji: '❓', title: 'Query Raised' },
  query_resolved: { color: '#10b981', emoji: '✅', title: 'Query Resolved' },
  final_approved: { color: '#6366f1', emoji: '🎉', title: 'KPI Finalized' },
  kra_assigned: { color: '#6366f1', emoji: '📋', title: 'New KRA Assignment' },
  period_locked: { color: '#64748b', emoji: '🔒', title: 'Period Locked' },
  pip_initiated: { color: '#ef4444', emoji: '⚠️', title: 'Performance Improvement Plan' },
  pip_milestone_reminder: { color: '#f59e0b', emoji: '📅', title: 'PIP Milestone Reminder' },
  pip_completed: { color: '#10b981', emoji: '🎉', title: 'PIP Completed' },
  kpi_ready_for_audit: { color: '#8b5cf6', emoji: '🔍', title: 'Ready for Audit' },
  kpi_ready_for_management: { color: '#0ea5e9', emoji: '👔', title: 'Ready for Management' },
  query_response_received: { color: '#f59e0b', emoji: '💬', title: 'Query Response Received' },
  admin_status_change: { color: '#64748b', emoji: '⚙️', title: 'Admin Status Change' },
  admin_data_entry: { color: '#64748b', emoji: '📊', title: 'Admin Data Entry' },
  admin_data_override: { color: '#64748b', emoji: '🔧', title: 'Admin Data Override' },
  org_kpi_sent_back: { color: '#f59e0b', emoji: '↩️', title: 'Org KPI Sent Back' },
};

// Replace placeholders in template
const replacePlaceholders = (
  template: string,
  data: Record<string, string | number | undefined>
): string => {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value || 'N/A'));
  }
  return result;
};

// Build HTML email from template
const buildEmailHtml = (
  eventType: string,
  body: string,
  customization: {
    logoUrl?: string;
    footerText?: string;
  }
): string => {
  const style = EVENT_STYLES[eventType] || { color: '#6366f1', emoji: '📬', title: 'Notification' };
  const logoHtml = customization.logoUrl 
    ? `<img src="${customization.logoUrl}" alt="Company Logo" style="max-height: 50px; margin-bottom: 15px;" />`
    : '';
  const customFooterHtml = customization.footerText 
    ? `<p style="margin-top: 10px;">${customization.footerText}</p>`
    : '';

  // Convert newlines in body to HTML
  const htmlBody = body.split('\n').map(line => {
    if (line.trim() === '') return '<br/>';
    return `<p>${line}</p>`;
  }).join('');

  return `
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, ${style.color}, ${style.color}dd); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
        .content p { margin: 0 0 10px 0; }
        .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-radius: 0 0 8px 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logoHtml}
          <h1>${style.emoji} ${style.title}</h1>
        </div>
        <div class="content">
          ${htmlBody}
        </div>
        <div class="footer">
          <p>This is an automated notification from the Performance Management System.</p>
          ${customFooterHtml}
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send email via SMTP
const sendViaSmtp = async (
  host: string,
  port: number,
  security: 'tls' | 'starttls' | 'none',
  username: string,
  password: string,
  fromAddress: string,
  fromName: string,
  toEmail: string,
  subject: string,
  html: string
): Promise<void> => {
  // Trim inputs to prevent whitespace issues
  const trimmedHost = host.trim();
  const trimmedUsername = username.trim();
  const trimmedFromAddress = fromAddress.trim();
  const trimmedFromName = fromName.trim();

  console.log(`Connecting to SMTP server: ${trimmedHost}:${port} with security: ${security}`);

  if (security === 'starttls') {
    console.warn("STARTTLS is not supported in the edge runtime. Please use TLS (port 465) instead.");
    throw new Error("STARTTLS is not supported in the server environment. Please switch to TLS (port 465) or None (port 25).");
  }
  
  const client = new SMTPClient({
    connection: {
      hostname: trimmedHost,
      port: port,
      tls: security === 'tls',
      auth: {
        username: trimmedUsername,
        password: password,
      },
    },
  });

  try {
    await client.send({
      from: `${trimmedFromName} <${trimmedFromAddress}>`,
      to: toEmail.trim(),
      subject: subject,
      html: html,
    });
    console.log("SMTP email sent successfully");
  } finally {
    await client.close();
  }
};

// Send email via Resend
const sendViaResend = async (
  fromAddress: string,
  fromName: string,
  toEmail: string,
  subject: string,
  html: string
): Promise<any> => {
  const emailResponse = await resend.emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: [toEmail],
    subject,
    html,
  });
  console.log("Resend email sent:", emailResponse);
  return emailResponse;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Received request:", JSON.stringify(body));

    // Handle SMTP connection test
    if (body.smtp_test === true) {
      const { smtp_host, smtp_port, smtp_security, smtp_username, smtp_from_address, smtp_from_name, recipient_email } = body as SmtpTestRequest;
      const smtpPassword = await getSmtpPassword(supabase);
      
      if (!smtpPassword) {
        return new Response(JSON.stringify({ success: false, error: "SMTP password not configured. Please set it in System Settings → Email." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const testHtml = buildEmailHtml('kpi_submitted', `This is a test email from the Performance Management System.

If you received this email, your SMTP configuration is working correctly!

SMTP Host: ${smtp_host}
SMTP Port: ${smtp_port}
Security: ${smtp_security}
From Address: ${smtp_from_address}`, { logoUrl: '', footerText: '' });

      try {
        await sendViaSmtp(
          smtp_host,
          smtp_port,
          smtp_security,
          smtp_username,
          smtpPassword,
          smtp_from_address,
          smtp_from_name,
          recipient_email,
          "[PMS] SMTP Test - Configuration Successful",
          testHtml
        );

        return new Response(JSON.stringify({ success: true, message: "SMTP test email sent successfully" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (smtpError: any) {
        console.error("SMTP test failed:", smtpError);
        return new Response(JSON.stringify({ success: false, error: smtpError.message || "SMTP connection failed" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Handle test email (uses configured provider)
    if (body.test === true) {
      const { recipient_email } = body as TestEmailRequest;
      
      // Get all email settings including provider
      const { data: settings } = await supabase
        .from("system_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "email_sender_name", "email_sender_address", "email_company_logo_url", "email_custom_footer",
          "email_provider", "smtp_host", "smtp_port", "smtp_security", "smtp_username", "smtp_from_address", "smtp_from_name",
          "graph_tenant_id", "graph_client_id", "graph_from_address", "graph_from_name"
        ]);

      const settingsMap = Object.fromEntries(
        (settings || []).map((s) => [s.setting_key, s.setting_value])
      );

      const parseValue = (val: any): string => {
        if (typeof val === 'string') return val.replace(/^"|"$/g, '');
        if (typeof val === 'number') return String(val);
        return String(val || '');
      };

      const provider = parseValue(settingsMap.email_provider) || 'resend';
      const logoUrl = parseValue(settingsMap.email_company_logo_url);
      const footerText = parseValue(settingsMap.email_custom_footer);

      let senderName: string;
      let senderEmail: string;

      if (provider === 'smtp') {
        senderName = parseValue(settingsMap.smtp_from_name) || 'PMS Notifications';
        senderEmail = parseValue(settingsMap.smtp_from_address) || '';
      } else if (provider === 'microsoft_graph') {
        senderName = parseValue(settingsMap.graph_from_name) || 'PMS Notifications';
        senderEmail = parseValue(settingsMap.graph_from_address) || '';
      } else {
        senderName = parseValue(settingsMap.email_sender_name) || 'PMS Notifications';
        senderEmail = parseValue(settingsMap.email_sender_address) || 'onboarding@resend.dev';
      }

      const testHtml = buildEmailHtml('kpi_submitted', `This is a test email from the Performance Management System.

If you received this email, your email notification configuration is working correctly!

Provider: ${provider.toUpperCase()}
Sender Name: ${senderName}
Sender Email: ${senderEmail}`, { logoUrl, footerText });

      console.log(`Sending test email via ${provider} to ${recipient_email} from ${senderName} <${senderEmail}>`);

      if (provider === 'smtp') {
        const smtpPassword = await getSmtpPassword(supabase);
        if (!smtpPassword) {
          return new Response(JSON.stringify({ success: false, error: "SMTP password not configured. Please set it in System Settings → Email." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        await sendViaSmtp(
          parseValue(settingsMap.smtp_host),
          parseInt(parseValue(settingsMap.smtp_port)) || 587,
          (parseValue(settingsMap.smtp_security) || 'tls') as 'tls' | 'starttls' | 'none',
          parseValue(settingsMap.smtp_username),
          smtpPassword,
          senderEmail,
          senderName,
          recipient_email,
          "[PMS] Test Email - Configuration Successful",
          testHtml
        );

        return new Response(JSON.stringify({ success: true, message: "Test email sent via SMTP" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } else if (provider === 'microsoft_graph') {
        await sendViaMicrosoftGraph(
          supabase,
          parseValue(settingsMap.graph_tenant_id),
          parseValue(settingsMap.graph_client_id),
          senderEmail,
          senderName,
          recipient_email,
          "[PMS] Test Email - Configuration Successful",
          testHtml
        );

        return new Response(JSON.stringify({ success: true, message: "Test email sent via Microsoft Graph" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } else {
        const emailResponse = await sendViaResend(senderEmail, senderName, recipient_email, "[PMS] Test Email - Configuration Successful", testHtml);
        return new Response(JSON.stringify({ success: true, data: emailResponse }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Handle notification-triggered email
    const { event_type, recipient_email, recipient_name, kpi_name, kra_name, actor_name, query_reason, resolution_notes, review_period, review_year,
      pip_start_date, pip_end_date, pip_reason, pip_outcome, pip_remarks,
      milestone_date, milestone_description, milestone_expected_outcome,
      send_back_reason } = body;

    // Check if email notifications are enabled
    const { data: enabledSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "email_notifications_enabled")
      .single();

    const isEnabled = enabledSetting?.setting_value?.replace?.(/^"|"$/g, "") === "enabled";
    if (!isEnabled) {
      console.log("Email notifications are disabled");
      return new Response(JSON.stringify({ skipped: true, reason: "Email notifications disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if this event type is enabled
    const { data: eventsSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "email_notification_events")
      .single();

    let enabledEvents: string[] = [];
    try {
      const eventsValue = eventsSetting?.setting_value;
      if (Array.isArray(eventsValue)) {
        enabledEvents = eventsValue;
      } else if (typeof eventsValue === "string") {
        enabledEvents = JSON.parse(eventsValue);
      }
    } catch {
      enabledEvents = [];
    }

    if (!enabledEvents.includes(event_type)) {
      console.log(`Event type ${event_type} is not enabled`);
      return new Response(JSON.stringify({ skipped: true, reason: `Event type ${event_type} not enabled` }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get all settings including provider and SMTP config
    const { data: settings } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "email_sender_name", "email_sender_address", "email_company_logo_url", "email_custom_footer",
        "email_provider", "smtp_host", "smtp_port", "smtp_security", "smtp_username", "smtp_from_address", "smtp_from_name",
        "graph_tenant_id", "graph_client_id", "graph_from_address", "graph_from_name",
        `email_template_${event_type}`
      ]);

    const settingsMap = Object.fromEntries(
      (settings || []).map((s) => [s.setting_key, s.setting_value])
    );

    const parseValue = (val: any): string => {
      if (typeof val === 'string') return val.replace(/^"|"$/g, '');
      if (typeof val === 'number') return String(val);
      return String(val || '');
    };

    const provider = parseValue(settingsMap.email_provider) || 'resend';
    const logoUrl = parseValue(settingsMap.email_company_logo_url);
    const footerText = parseValue(settingsMap.email_custom_footer);

    let senderName: string;
    let senderEmail: string;

    if (provider === 'smtp') {
      senderName = parseValue(settingsMap.smtp_from_name) || 'PMS Notifications';
      senderEmail = parseValue(settingsMap.smtp_from_address) || '';
    } else if (provider === 'microsoft_graph') {
      senderName = parseValue(settingsMap.graph_from_name) || 'PMS Notifications';
      senderEmail = parseValue(settingsMap.graph_from_address) || '';
    } else {
      senderName = parseValue(settingsMap.email_sender_name) || 'PMS Notifications';
      senderEmail = parseValue(settingsMap.email_sender_address) || 'onboarding@resend.dev';
    }

    // Get template (custom or default)
    let template = DEFAULT_TEMPLATES[event_type] || DEFAULT_TEMPLATES.kpi_submitted;
    const customTemplate = settingsMap[`email_template_${event_type}`];
    if (customTemplate) {
      try {
        const parsed = typeof customTemplate === 'string' ? JSON.parse(customTemplate) : customTemplate;
        if (parsed.subject && parsed.body) {
          template = parsed;
        }
      } catch {
        // Use default template
      }
    }

    // Prepare placeholder data
    const placeholderData: Record<string, string | number | undefined> = {
      recipient_name,
      actor_name,
      kra_name,
      kpi_name,
      review_period,
      review_year,
      query_reason,
      resolution_notes,
      pip_start_date,
      pip_end_date,
      pip_reason,
      pip_outcome,
      pip_remarks,
      milestone_date,
      milestone_description,
      milestone_expected_outcome,
      send_back_reason,
    };

    // Replace placeholders in subject and body
    const subject = replacePlaceholders(template.subject, placeholderData);
    const bodyContent = replacePlaceholders(template.body, placeholderData);
    const html = buildEmailHtml(event_type, bodyContent, { logoUrl, footerText });

    console.log(`Sending ${event_type} email via ${provider} to ${recipient_email}`);

    if (provider === 'smtp') {
      const smtpPassword = await getSmtpPassword(supabase);
      if (!smtpPassword) {
        console.error("SMTP password not configured");
        return new Response(JSON.stringify({ error: "SMTP password not configured. Please set it in System Settings → Email." }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      await sendViaSmtp(
        parseValue(settingsMap.smtp_host),
        parseInt(parseValue(settingsMap.smtp_port)) || 587,
        (parseValue(settingsMap.smtp_security) || 'tls') as 'tls' | 'starttls' | 'none',
        parseValue(settingsMap.smtp_username),
        smtpPassword,
        senderEmail,
        senderName,
        recipient_email,
        subject,
        html
      );

      return new Response(JSON.stringify({ success: true, message: "Email sent via SMTP" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } else if (provider === 'microsoft_graph') {
      await sendViaMicrosoftGraph(
        supabase,
        parseValue(settingsMap.graph_tenant_id),
        parseValue(settingsMap.graph_client_id),
        senderEmail,
        senderName,
        recipient_email,
        subject,
        html
      );

      return new Response(JSON.stringify({ success: true, message: "Email sent via Microsoft Graph" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } else {
      const emailResponse = await sendViaResend(senderEmail, senderName, recipient_email, subject, html);
      return new Response(JSON.stringify({ success: true, data: emailResponse }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  } catch (error: any) {
    console.error("Error in send-email-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
