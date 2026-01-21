import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  notification_id?: string;
  event_type: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  html_content: string;
}

interface TestEmailRequest {
  test: true;
  recipient_email: string;
}

// Email templates for different notification types
const getEmailTemplate = (
  eventType: string,
  data: {
    recipientName: string;
    kpiName?: string;
    kraName?: string;
    actorName?: string;
    queryReason?: string;
    resolutionNotes?: string;
    reviewPeriod?: string;
    reviewYear?: number;
  }
): { subject: string; html: string } => {
  const baseStyle = `
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
      .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
      .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
      .highlight { background: #ede9fe; padding: 15px; border-radius: 6px; margin: 15px 0; }
    </style>
  `;

  switch (eventType) {
    case 'kpi_submitted':
      return {
        subject: `[PMS] New KPI Submitted for Review - ${data.actorName || 'Employee'}`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h1>📝 Self Review Submitted</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p><strong>${data.actorName || 'An employee'}</strong> has submitted their self-review for:</p>
              <div class="highlight">
                <p><strong>KRA:</strong> ${data.kraName || 'N/A'}</p>
                <p><strong>KPI:</strong> ${data.kpiName || 'N/A'}</p>
                <p><strong>Period:</strong> ${data.reviewPeriod || ''} ${data.reviewYear || ''}</p>
              </div>
              <p>Please review and provide your feedback.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };

    case 'manager_approved':
      return {
        subject: `[PMS] Your KPI Has Been Approved`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header" style="background: linear-gradient(135deg, #10b981, #059669);">
              <h1>✅ KPI Approved</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p>Great news! Your KPI has been approved by your manager.</p>
              <div class="highlight">
                <p><strong>KRA:</strong> ${data.kraName || 'N/A'}</p>
                <p><strong>KPI:</strong> ${data.kpiName || 'N/A'}</p>
              </div>
              <p>The review will now proceed to the next stage.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };

    case 'manager_rejected':
      return {
        subject: `[PMS] Action Required: KPI Sent Back for Revision`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
              <h1>🔄 KPI Sent Back</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p>Your manager has sent back your KPI for revision.</p>
              <div class="highlight">
                <p><strong>KRA:</strong> ${data.kraName || 'N/A'}</p>
                <p><strong>KPI:</strong> ${data.kpiName || 'N/A'}</p>
              </div>
              <p>Please review the feedback and update your submission.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };

    case 'query_raised':
      return {
        subject: `[PMS] New Query Raised on Your KPI`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header" style="background: linear-gradient(135deg, #f43f5e, #e11d48);">
              <h1>❓ Query Raised</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p><strong>${data.actorName || 'Someone'}</strong> has raised a query on your KPI.</p>
              <div class="highlight">
                <p><strong>KPI:</strong> ${data.kpiName || 'N/A'}</p>
                <p><strong>Query:</strong> ${data.queryReason || 'N/A'}</p>
              </div>
              <p>Please respond to this query at your earliest convenience.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };

    case 'query_resolved':
      return {
        subject: `[PMS] Your Query Has Been Resolved`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header" style="background: linear-gradient(135deg, #10b981, #059669);">
              <h1>✅ Query Resolved</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p>Your query has been resolved by <strong>${data.actorName || 'the recipient'}</strong>.</p>
              <div class="highlight">
                <p><strong>KPI:</strong> ${data.kpiName || 'N/A'}</p>
                ${data.resolutionNotes ? `<p><strong>Resolution:</strong> ${data.resolutionNotes}</p>` : ''}
              </div>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };

    case 'final_approved':
      return {
        subject: `[PMS] 🎉 Your KPI Has Been Finalized`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
              <h1>🎉 KPI Finalized</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p>Congratulations! Your KPI has received final approval and is now complete.</p>
              <div class="highlight">
                <p><strong>KRA:</strong> ${data.kraName || 'N/A'}</p>
                <p><strong>KPI:</strong> ${data.kpiName || 'N/A'}</p>
              </div>
              <p>Thank you for your contribution!</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };

    case 'kra_assigned':
      return {
        subject: `[PMS] New KRA Assigned to You`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h1>📋 New KRA Assignment</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p>A new KRA has been assigned to you.</p>
              <div class="highlight">
                <p><strong>KRA:</strong> ${data.kraName || 'N/A'}</p>
                <p><strong>KPI:</strong> ${data.kpiName || 'N/A'}</p>
                <p><strong>Period:</strong> ${data.reviewPeriod || ''} ${data.reviewYear || ''}</p>
              </div>
              <p>Please review your new assignment.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };

    case 'period_locked':
      return {
        subject: `[PMS] Review Period Has Been Locked`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header" style="background: linear-gradient(135deg, #64748b, #475569);">
              <h1>🔒 Period Locked</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p>The review period <strong>${data.reviewPeriod} ${data.reviewYear}</strong> has been locked.</p>
              <p>No further changes can be made to KPIs in this period unless unlocked by an administrator.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };

    default:
      return {
        subject: `[PMS] Notification`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h1>📬 Notification</h1>
            </div>
            <div class="content">
              <p>Hi ${data.recipientName},</p>
              <p>You have a new notification in the Performance Management System.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from the Performance Management System.</p>
            </div>
          </div>
        `,
      };
  }
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
        .in("setting_key", ["email_sender_name", "email_sender_address"]);

      const settingsMap = Object.fromEntries(
        (settings || []).map((s) => [s.setting_key, s.setting_value])
      );

      const senderName = (settingsMap.email_sender_name || "PMS Notifications").replace(/^"|"$/g, "");
      const senderEmail = (settingsMap.email_sender_address || "onboarding@resend.dev").replace(/^"|"$/g, "");

      const testHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1>🎉 Test Email Successful!</h1>
          </div>
          <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0;">
            <p>This is a test email from the Performance Management System.</p>
            <p>If you received this email, your email notification configuration is working correctly!</p>
            <div style="background: #ede9fe; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <p><strong>Sender Name:</strong> ${senderName}</p>
              <p><strong>Sender Email:</strong> ${senderEmail}</p>
            </div>
          </div>
          <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-radius: 0 0 8px 8px;">
            <p>This is an automated test notification from the Performance Management System.</p>
          </div>
        </div>
      `;

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
    const { notification_id, event_type, recipient_email, recipient_name, kpi_name, kra_name, actor_name, query_reason, resolution_notes, review_period, review_year } = body;

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

    // Get sender settings
    const { data: settings } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["email_sender_name", "email_sender_address"]);

    const settingsMap = Object.fromEntries(
      (settings || []).map((s) => [s.setting_key, s.setting_value])
    );

    const senderName = (settingsMap.email_sender_name || "PMS Notifications").replace(/^"|"$/g, "");
    const senderEmail = (settingsMap.email_sender_address || "onboarding@resend.dev").replace(/^"|"$/g, "");

    // Get email template
    const { subject, html } = getEmailTemplate(event_type, {
      recipientName: recipient_name,
      kpiName: kpi_name,
      kraName: kra_name,
      actorName: actor_name,
      queryReason: query_reason,
      resolutionNotes: resolution_notes,
      reviewPeriod: review_period,
      reviewYear: review_year,
    });

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
