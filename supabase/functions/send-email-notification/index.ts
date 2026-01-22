import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestEmailRequest {
  test: true;
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

Your manager has sent back your KPI for revision.

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

    // Handle test email
    if (body.test === true) {
      const { recipient_email } = body as TestEmailRequest;
      
      // Get sender settings
      const { data: settings } = await supabase
        .from("system_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["email_sender_name", "email_sender_address", "email_company_logo_url", "email_custom_footer"]);

      const settingsMap = Object.fromEntries(
        (settings || []).map((s) => [s.setting_key, s.setting_value])
      );

      const senderName = (settingsMap.email_sender_name || "PMS Notifications").replace(/^"|"$/g, "");
      const senderEmail = (settingsMap.email_sender_address || "onboarding@resend.dev").replace(/^"|"$/g, "");
      const logoUrl = (settingsMap.email_company_logo_url || "").replace(/^"|"$/g, "");
      const footerText = (settingsMap.email_custom_footer || "").replace(/^"|"$/g, "");

      const testHtml = buildEmailHtml('kpi_submitted', `This is a test email from the Performance Management System.

If you received this email, your email notification configuration is working correctly!

Sender Name: ${senderName}
Sender Email: ${senderEmail}`, { logoUrl, footerText });

      console.log(`Sending test email to ${recipient_email} from ${senderName} <${senderEmail}>`);

      const emailResponse = await resend.emails.send({
        from: `${senderName} <${senderEmail}>`,
        to: [recipient_email],
        subject: "[PMS] Test Email - Configuration Successful",
        html: testHtml,
      });

      console.log("Test email sent:", emailResponse);

      return new Response(JSON.stringify({ success: true, data: emailResponse }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle notification-triggered email
    const { event_type, recipient_email, recipient_name, kpi_name, kra_name, actor_name, query_reason, resolution_notes, review_period, review_year } = body;

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

    // Get sender settings and customization
    const { data: settings } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["email_sender_name", "email_sender_address", "email_company_logo_url", "email_custom_footer", `email_template_${event_type}`]);

    const settingsMap = Object.fromEntries(
      (settings || []).map((s) => [s.setting_key, s.setting_value])
    );

    const senderName = (settingsMap.email_sender_name || "PMS Notifications").replace(/^"|"$/g, "");
    const senderEmail = (settingsMap.email_sender_address || "onboarding@resend.dev").replace(/^"|"$/g, "");
    const logoUrl = (settingsMap.email_company_logo_url || "").replace(/^"|"$/g, "");
    const footerText = (settingsMap.email_custom_footer || "").replace(/^"|"$/g, "");

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
    };

    // Replace placeholders in subject and body
    const subject = replacePlaceholders(template.subject, placeholderData);
    const bodyContent = replacePlaceholders(template.body, placeholderData);
    const html = buildEmailHtml(event_type, bodyContent, { logoUrl, footerText });

    console.log(`Sending ${event_type} email to ${recipient_email}`);

    const emailResponse = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [recipient_email],
      subject,
      html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
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
