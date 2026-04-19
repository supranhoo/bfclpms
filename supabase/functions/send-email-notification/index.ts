import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { withRetry } from "../_shared/retry.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Auth helper: validate service-role key, anon key, apikey header, or valid user JWT ---
const validateCaller = async (req: Request): Promise<{ authorized: boolean; error?: string }> => {
  const authHeader = req.headers.get("Authorization");
  const apiKeyHeader = req.headers.get("apikey");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  // The publishable key (JWT format, ~208 chars) may differ from SUPABASE_ANON_KEY (raw, ~46 chars)
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");

  // Collect all valid keys for comparison
  const validKeys = new Set<string>();
  if (anonKey) validKeys.add(anonKey);
  if (serviceRoleKey) validKeys.add(serviceRoleKey);
  if (publishableKey) validKeys.add(publishableKey);

  // Debug logging for trigger auth diagnosis
  console.log("[validateCaller] authHeader present:", !!authHeader, "apikey header present:", !!apiKeyHeader);
  console.log("[validateCaller] SUPABASE_ANON_KEY len:", anonKey?.length ?? 0, "SERVICE_ROLE_KEY len:", serviceRoleKey?.length ?? 0, "PUBLISHABLE_KEY len:", publishableKey?.length ?? 0);

  // Check apikey header first (used by DB triggers via net.http_post)
  if (apiKeyHeader) {
    if (validKeys.has(apiKeyHeader)) {
      console.log("[validateCaller] Authorized via apikey header match");
      return { authorized: true };
    }
    console.log("[validateCaller] apikey header present but no match. apikey length:", apiKeyHeader.length);
  }

  // Check Authorization Bearer token
  if (!authHeader) {
    // Last resort: read the stored publishable JWT from system_settings and compare
    if (apiKeyHeader) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey!);
        const { data } = await supabase
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", "supabase_anon_key")
          .single();
        if (data?.setting_value) {
          const storedKey = typeof data.setting_value === "string"
            ? data.setting_value.replace(/^"|"$/g, "")
            : String(data.setting_value);
          if (apiKeyHeader === storedKey) {
            console.log("[validateCaller] Authorized via apikey matching system_settings stored key");
            return { authorized: true };
          }
        }
      } catch (e) {
        console.error("[validateCaller] Failed to read stored anon key:", e);
      }
    }
    console.log("[validateCaller] No Authorization header and apikey did not match");
    return { authorized: false, error: "Authorization required" };
  }

  const token = authHeader.replace("Bearer ", "");

  // Check token against all known valid keys
  if (validKeys.has(token)) {
    console.log("[validateCaller] Authorized via Bearer token match");
    return { authorized: true };
  }

  // Check token against stored key in system_settings (handles JWT vs raw key mismatch)
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey!);
    const { data } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "supabase_anon_key")
      .single();
    if (data?.setting_value) {
      const storedKey = typeof data.setting_value === "string"
        ? data.setting_value.replace(/^"|"$/g, "")
        : String(data.setting_value);
      if (token === storedKey) {
        console.log("[validateCaller] Authorized via Bearer matching system_settings stored key");
        return { authorized: true };
      }
    }
  } catch (e) {
    console.error("[validateCaller] Failed to read stored key for Bearer match:", e);
  }

  // Allow authenticated user callers (admin test emails from frontend)
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey!);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      console.log("[validateCaller] Authorized via user JWT for:", user.email);
      return { authorized: true };
    }
  } catch (e) {
    console.error("[validateCaller] Failed to verify user JWT:", e);
  }

  console.log("[validateCaller] All auth checks failed. Bearer token length:", token.length);
  return { authorized: false, error: "Invalid authorization" };
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
Period: {{review_period}} {{review_year}}

The review will now proceed to the next stage.`,
  },
  manager_rejected: {
    subject: '[PMS] Action Required: KPI Sent Back for Revision',
    body: `Hi {{recipient_name}},

Your KPI has been sent back for revision.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please review the feedback and update your submission.`,
  },
  query_raised: {
    subject: '[PMS] New Query Raised on Your KPI',
    body: `Hi {{recipient_name}},

{{actor_name}} has raised a query on your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Query: {{query_reason}}

Please respond to this query at your earliest convenience.`,
  },
  query_resolved: {
    subject: '[PMS] Your Query Has Been Resolved',
    body: `Hi {{recipient_name}},

Your query has been resolved by {{actor_name}}.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Resolution: {{resolution_notes}}`,
  },
  final_approved: {
    subject: '[PMS] 🎉 Your KPI Has Been Finalized — Score: {{final_score}}/5',
    body: `Hi {{recipient_name}},

Congratulations! Your KPI has received final approval and is now complete.

✅ Final Approved Score: {{final_score}} / 5 — {{score_label}}

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

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
Period: {{review_period}} {{review_year}}

Please review and provide your assessment.`,
  },
  kpi_ready_for_management: {
    subject: '[PMS] KPI Ready for Management Review',
    body: `Hi {{recipient_name}},

A KPI is ready for management review.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please review and provide final approval.`,
  },
  query_response_received: {
    subject: '[PMS] Query Response Received',
    body: `Hi {{recipient_name}},

A response has been submitted to your query.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Resolution: {{resolution_notes}}

Please review the response and take appropriate action.`,
  },
  admin_status_change: {
    subject: '[PMS] Admin Status Change on Your KPI',
    body: `Hi {{recipient_name}},

An administrator has changed the status of your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please check your dashboard for updated details.`,
  },
  admin_data_entry: {
    subject: '[PMS] Admin Data Entry on Your KPI',
    body: `Hi {{recipient_name}},

An administrator has entered data for your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please check your dashboard for updated details.`,
  },
  admin_data_override: {
    subject: '[PMS] Admin Data Override on Your KPI',
    body: `Hi {{recipient_name}},

An administrator has overridden data on your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please check your dashboard for updated details.`,
  },
  org_kpi_sent_back: {
    subject: '[PMS] Org KPI Data Sent Back for Revision',
    body: `Hi {{recipient_name}},

{{#if_data_owner}}The org KPI data you submitted has been sent back for revision. Please review the feedback and resubmit the corrected data.{{/if_data_owner}}{{#if_employee}}The org-level data for your KPI has been sent back for revision by the reviewer. You will be notified once the data owner resubmits the corrected value.{{/if_employee}}

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Reason: {{send_back_reason}}`,
  },
  password_rollout: {
    subject: '[PMS] Your Login Credentials',
    body: `Hi {{recipient_name}},

Your login credentials for the {{app_name}} have been created.

Email: {{login_email}}
Password: {{generated_password}}

Please log in and change your password immediately after your first sign-in.

If you did not expect this email, please contact your administrator.`,
  },
  kra_batch_assigned: {
    subject: '[PMS] {{kra_count}} KRA(s) Assigned - {{review_period}} {{review_year}}',
    body: `Hi {{recipient_name}},

{{kra_count}} KRA(s) have been assigned to {{employee_name}} for {{review_period}} {{review_year}}.

{{kra_table}}

Total Weightage: {{total_weightage}}

Please log in to review the assignments.`,
  },
  admin_status_step_back: {
    subject: '[PMS] Admin Moved Your KPI Back',
    body: `Hi {{recipient_name}},

An administrator has moved your KPI back one stage in the workflow.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please check your dashboard for details and take any required action.`,
  },
  rollback_requested: {
    subject: '[PMS] Rollback Requested on KPI',
    body: `Hi {{recipient_name}},

A rollback has been requested on a KPI that requires your review.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Reason: {{rollback_reason}}

Please log in to review and approve or dismiss this request.`,
  },
  rollback_approved: {
    subject: '[PMS] Rollback Approved',
    body: `Hi {{recipient_name}},

Your rollback request has been approved.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

You can now edit and resubmit your KPI.`,
  },
  rollback_rejected: {
    subject: '[PMS] Rollback Request Dismissed',
    body: `Hi {{recipient_name}},

Your rollback request has been dismissed by the reviewer.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

The KPI will remain at its current stage. Please contact your reviewer if you have questions.`,
  },
  email_changed: {
    subject: '[PMS] Your Email Address Has Been Updated',
    body: `Hi {{recipient_name}},

Your email address on the Performance Management System has been successfully updated.

Previous Email: {{old_email}}
New Email: {{new_email}}

You will now use {{new_email}} to log in to the system.

If you did not make this change, please contact your administrator immediately.`,
  },
  observation_raised: {
    subject: '[PMS] New Observation Raised on Your KPI',
    body: `Hi {{recipient_name}},

{{actor_name}} has raised a new observation on your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Observation: {{observation_title}}
Type: {{observation_type}}
Description: {{observation_description}}

Please log in to review the observation and respond if needed.`,
  },
  observation_reply: {
    subject: '[PMS] New Reply on Observation - {{observation_title}}',
    body: `Hi {{recipient_name}},

{{actor_name}} has replied to an observation on {{kpi_name}}:

Period: {{review_period}} {{review_year}}
Observation: {{observation_title}}
Type: {{observation_type}}
Description: {{observation_description}}

Reply:
{{reply_content}}

Please check the observation thread for the latest update.`,
  },
  observation_resolved: {
    subject: '[PMS] Observation Resolved',
    body: `Hi {{recipient_name}},

An observation on your KPI has been resolved.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Observation: {{observation_title}}

No further action is needed on this observation.`,
  },
  observation_mention: {
    subject: '[PMS] You were mentioned in an Observation',
    body: `Hi {{recipient_name}},

{{actor_name}} mentioned you in an observation.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Observation: {{observation_title}}
Type: {{observation_type}}
Description: {{observation_description}}

Please log in to review the observation and respond if needed.`,
  },
  org_kpi_pending_reminder: {
    subject: '[PMS] Pending Org KPI Data Entry Reminder - {{review_period}} {{review_year}}',
    body: `Hi {{recipient_name}},

You have {{pending_count}} pending organization KPI(s) that require data entry for {{review_period}} {{review_year}}.

{{pending_table}}

Please log in and enter the required data at your earliest convenience.`,
  },
  system_auto_scored: {
    subject: '[PMS] Your KPI(s) Have Been Rated by System',
    body: `Dear {{recipient_name}},

Your following KPI(s) for {{review_period}} {{review_year}} have been reviewed by the system due to {{auto_score_reason}}.

{{kpi_list}}

Kindly check your KPIs for more details.`,
  },
  pending_review_reminder: {
    subject: '[PMS] Reminder: KPI Sent Back for Correction - {{kpi_name}}',
    body: `Hi {{recipient_name}},

This is a reminder that your KPI has been sent back for correction and is still pending your action.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Sent Back By: {{sent_back_by}}
Reason: {{reason}}

Please log in and complete the required corrections at your earliest convenience.`,
  },
  incentive_retroactive_alert: {
    subject: '[PMS] ⚠️ Incentive Slab Changes Detected — Action Required',
    body: `Hi {{recipient_name}},

{{revisions_count}} incentive slab change(s) have been detected due to Quarterly/Bi-Monthly KPI resolution.

Source Period: {{source_period}} {{review_year}}
Affected Employees: {{affected_employees}}
Affected Past Months: {{affected_months}}

These changes may require payroll adjustments. Please review the Incentive Report for full details.

Action Required: Log in to PMS → Reports → Incentive Report → Retroactive Adjustments tab to review and process these changes.`,
  },
  monthly_review_reminder: {
    subject: '[PMS] Monthly Reminder: Complete Your Self-Review & Team KRA Review — {{review_period}} {{review_year}}',
    body: `Dear {{recipient_name}},

This is a friendly reminder that KRAs for {{review_period}} {{review_year}} require your attention.

📋 Self-Review
Please log in and complete your self-assessment for any pending KPIs at your earliest convenience.

👥 Team KRA Review (If Applicable)
If you are a reporting manager, kindly review your team members' KPIs to ensure timely feedback and keep the review cycle on track.

Timely completion of reviews helps maintain a smooth and transparent appraisal process for everyone.

Note: If you have already completed your review and team's review (if applicable), please disregard this reminder.

Best regards,
{{company_name}} PMS System`,
  },
  query_response_reminder: {
    subject: '[PMS] ⏳ Reminder: {{pending_count}} Open Query(ies) Pending Your Response',
    body: `Hi {{recipient_name}},

This is a daily reminder that you have {{pending_count}} open query(ies) pending your response.

{{pending_list}}

Please log in and respond to these queries at your earliest convenience. Reminders will continue daily until all queries are addressed.`,
  },
  observation_response_reminder: {
    subject: '[PMS] ⏳ Reminder: {{pending_count}} Open Observation(s) Pending Acknowledgment',
    body: `Hi {{recipient_name}},

This is a daily reminder that you have {{pending_count}} open observation(s) pending your acknowledgment.

{{pending_list}}

Please log in and acknowledge these observations at your earliest convenience. Reminders will continue daily until all observations are addressed.`,
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
  password_rollout: { color: '#6366f1', emoji: '🔑', title: 'Login Credentials' },
  kra_batch_assigned: { color: '#3b82f6', emoji: '📋', title: 'New KRA Assignment' },
  admin_status_step_back: { color: '#f97316', emoji: '⏪', title: 'Admin Step Back' },
  rollback_requested: { color: '#f59e0b', emoji: '🔙', title: 'Rollback Requested' },
  rollback_approved: { color: '#10b981', emoji: '✅', title: 'Rollback Approved' },
  rollback_rejected: { color: '#64748b', emoji: '🚫', title: 'Rollback Dismissed' },
  email_changed: { color: '#6366f1', emoji: '✉️', title: 'Email Address Updated' },
  observation_raised: { color: '#f97316', emoji: '👁️', title: 'Observation Raised' },
  observation_reply: { color: '#8b5cf6', emoji: '💬', title: 'Observation Reply' },
  observation_resolved: { color: '#10b981', emoji: '✅', title: 'Observation Resolved' },
  observation_mention: { color: '#3b82f6', emoji: '@', title: 'Mentioned in Observation' },
  org_kpi_pending_reminder: { color: '#f97316', emoji: '⏳', title: 'Pending KPI Reminder' },
  system_auto_scored: { color: '#f97316', emoji: '⚡', title: 'System Auto-Score' },
  pending_review_reminder: { color: '#f59e0b', emoji: '🔔', title: 'Sent-Back KPI Reminder' },
  incentive_retroactive_alert: { color: '#ef4444', emoji: '⚠️', title: 'Incentive Slab Changes' },
  monthly_review_reminder: { color: '#3b82f6', emoji: '📋', title: 'Monthly Review Reminder' },
  query_response_reminder: { color: '#f97316', emoji: '⏳', title: 'Query Response Reminder' },
  observation_response_reminder: { color: '#f97316', emoji: '⏳', title: 'Observation Response Reminder' },
};

// Build KRA table HTML for batch assignment emails
const buildKraTableHtml = (kraList: Array<{ kra_name: string; kpi_name: string; target_value: string; weightage: string; uom: string }>): string => {
  if (!kraList || kraList.length === 0) return '';
  const rows = kraList.map((kra, i) => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:8px 12px;text-align:center;font-size:13px;">${i + 1}</td>
      <td style="padding:8px 12px;font-size:13px;">${kra.kra_name}</td>
      <td style="padding:8px 12px;font-size:13px;">${kra.kpi_name}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px;">${kra.target_value}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px;">${kra.weightage}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px;">${kra.uom}</td>
    </tr>`).join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;margin:16px 0;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">#</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">KRA</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">KPI</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Target</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Wt%</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">UOM</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
};

// Strip @[Name](uuid) mention syntax to plain @Name for emails
const stripMentionSyntax = (text: string): string => {
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
};

// Replace placeholders in template
const replacePlaceholders = (
  template: string,
  data: Record<string, string | number | undefined>
): string => {
  let result = template;

  // Handle conditional blocks: {{#if_<role>}}...{{/if_<role>}}
  const recipientRole = data.recipient_role ? String(data.recipient_role) : '';
  result = result.replace(/\{\{#if_(\w+)\}\}([\s\S]*?)\{\{\/if_\1\}\}/g, (_match, role, content) => {
    return recipientRole === role ? content : '';
  });

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
    finalScore?: string;
  }
): string => {
  const style = EVENT_STYLES[eventType] || { color: '#6366f1', emoji: '📬', title: 'Notification' };
  const logoHtml = customization.logoUrl 
    ? `<td style="text-align:left;vertical-align:middle;width:60px;"><img src="${customization.logoUrl}" alt="Company Logo" style="max-height:50px;max-width:60px;" /></td>`
    : '';
  const customFooterHtml = customization.footerText 
    ? `<p style="margin-top: 10px;">${customization.footerText}</p>`
    : '';

  // Convert newlines in body to HTML, auto-linkify URLs
  const htmlBody = body.split('\n').map(line => {
    if (line.trim() === '') return '<br/>';
    // Auto-convert URLs to clickable hyperlinks
    const linked = line.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#2563eb;text-decoration:underline;">$1</a>'
    );
    return `<p>${linked}</p>`;
  }).join('');

  // Build sparkle celebration HTML for score 5 (Outstanding)
  let sparkleStyleBlock = '';
  let sparkleBannerHtml = '';
  if (eventType === 'final_approved' && customization.finalScore && parseFloat(customization.finalScore) >= 4) {
    const sparkleEmojis = ['✨', '⭐', '🌟', '✨', '⭐', '🌟', '✨', '⭐', '🌟', '✨'];
    const positions = [5, 15, 25, 35, 45, 55, 65, 75, 85, 92];
    const durations = [3.5, 4.2, 3.8, 5.0, 4.5, 3.2, 4.8, 3.6, 5.2, 4.0];
    const delays = [0, 0.8, 1.5, 0.3, 2.0, 1.2, 0.5, 2.5, 1.8, 3.0];
    const sizes = [20, 16, 24, 18, 22, 14, 20, 16, 24, 18];

    sparkleStyleBlock = `
        @keyframes sparkle-float {
          0% { transform: translateY(0) rotate(0deg) scale(0.5); opacity: 0; }
          10% { opacity: 1; transform: translateY(-30px) rotate(45deg) scale(1); }
          50% { opacity: 0.8; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-350px) rotate(720deg) scale(0.3); opacity: 0; }
        }
        @keyframes sparkle-sway {
          0%, 100% { margin-left: 0; }
          25% { margin-left: 15px; }
          75% { margin-left: -15px; }
        }
    `;

    const sparkleElements = sparkleEmojis.map((emoji, i) => 
      `<span style="position:absolute;left:${positions[i]}%;bottom:0;font-size:${sizes[i]}px;animation:sparkle-float ${durations[i]}s ${delays[i]}s infinite linear, sparkle-sway ${durations[i] * 0.7}s ${delays[i]}s infinite ease-in-out;pointer-events:none;">${emoji}</span>`
    ).join('');

    sparkleBannerHtml = `
      <div style="position:relative;overflow:hidden;height:120px;background:linear-gradient(135deg, #fbbf24, #f59e0b, #d97706);border-radius:8px 8px 0 0;text-align:center;padding:20px;">
        ${sparkleElements}
        <div style="position:relative;z-index:1;">
          <p style="font-size:36px;margin:0;line-height:1;">🎉</p>
          <h2 style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#ffffff;text-shadow:0 1px 3px rgba(0,0,0,0.3);">Congratulations! Exceptional Performance!</h2>
        </div>
      </div>
    `;
  }

  return `
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, ${style.color}, ${style.color}dd); color: white; padding: 30px; border-radius: ${sparkleBannerHtml ? '0' : '8px 8px 0 0'}; }
        .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
        .content p { margin: 0 0 10px 0; }
        .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-radius: 0 0 8px 8px; }
        ${sparkleStyleBlock}
      </style>
    </head>
    <body>
      <div class="container">
        ${sparkleBannerHtml}
        <div class="header">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            ${logoHtml}
            <td style="text-align:right;vertical-align:middle;"><h1 style="margin:0;font-size:22px;">${style.emoji} ${style.title}</h1></td>
          </tr></table>
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

  // --- Auth gate: require service-role key or valid user JWT ---
  const authResult = await validateCaller(req);
  if (!authResult.authorized) {
    return new Response(
      JSON.stringify({ error: authResult.error }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Received request:", JSON.stringify(body));

    // Helper: fire-and-forget email log insert
    const logEmail = async (logData: {
      event_type: string;
      recipient_email: string;
      recipient_name?: string;
      subject?: string;
      status: string;
      error_message?: string;
      provider?: string;
      metadata?: Record<string, any>;
    }) => {
      try {
        await supabase.from("email_logs").insert({
          event_type: logData.event_type,
          recipient_email: logData.recipient_email,
          recipient_name: logData.recipient_name || null,
          subject: logData.subject || null,
          status: logData.status,
          error_message: logData.error_message || null,
          provider: logData.provider || null,
          metadata: logData.metadata || null,
        });
      } catch (logErr) {
        console.warn("Failed to insert email log:", logErr);
      }
    };

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

      // Fetch branding logo for SMTP test email
      let smtpTestLogoUrl = '';
      try {
        const { data: appSettings } = await supabase
          .from("app_settings")
          .select("logo_url")
          .eq("id", "00000000-0000-0000-0000-000000000001")
          .maybeSingle();
        if (appSettings?.logo_url) smtpTestLogoUrl = appSettings.logo_url;
      } catch (e) { /* ignore */ }

      const testHtml = buildEmailHtml('kpi_submitted', `This is a test email from the Performance Management System.

If you received this email, your SMTP configuration is working correctly!

SMTP Host: ${smtp_host}
SMTP Port: ${smtp_port}
Security: ${smtp_security}
From Address: ${smtp_from_address}`, { logoUrl: smtpTestLogoUrl, footerText: '' });

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

        await logEmail({
          event_type: 'test',
          recipient_email,
          recipient_name: 'Test',
          subject: '[PMS] SMTP Test - Configuration Successful',
          status: 'sent',
          provider: 'smtp',
          error_message: null,
          metadata: { test: true, smtp_test: true, smtp_host },
        });

        return new Response(JSON.stringify({ success: true, message: "SMTP test email sent successfully" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (smtpError: any) {
        console.error("SMTP test failed:", smtpError);

        await logEmail({
          event_type: 'test',
          recipient_email,
          recipient_name: 'Test',
          subject: '[PMS] SMTP Test - Configuration Successful',
          status: 'failed',
          provider: 'smtp',
          error_message: smtpError.message || 'SMTP connection failed',
          metadata: { test: true, smtp_test: true, smtp_host },
        });

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
      const emailLogoUrl = parseValue(settingsMap.email_company_logo_url);
      const footerText = parseValue(settingsMap.email_custom_footer);

      // Prefer Global Branding app logo, fall back to email-specific logo
      let logoUrl = emailLogoUrl;
      try {
        const { data: appSettings } = await supabase
          .from("app_settings")
          .select("logo_url")
          .eq("id", "00000000-0000-0000-0000-000000000001")
          .maybeSingle();
        if (appSettings?.logo_url) {
          logoUrl = appSettings.logo_url;
        }
      } catch (e) {
        console.error("Failed to fetch app_settings logo:", e);
      }

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

        try {
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
          await logEmail({ event_type: 'test', recipient_email, recipient_name: 'Test', subject: '[PMS] Test Email - Configuration Successful', status: 'sent', provider: 'smtp', error_message: null, metadata: { test: true } });
          return new Response(JSON.stringify({ success: true, message: "Test email sent via SMTP" }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (err: any) {
          await logEmail({ event_type: 'test', recipient_email, recipient_name: 'Test', subject: '[PMS] Test Email - Configuration Successful', status: 'failed', provider: 'smtp', error_message: err.message, metadata: { test: true } });
          throw err;
        }
      } else if (provider === 'microsoft_graph') {
        try {
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
          await logEmail({ event_type: 'test', recipient_email, recipient_name: 'Test', subject: '[PMS] Test Email - Configuration Successful', status: 'sent', provider: 'microsoft_graph', error_message: null, metadata: { test: true } });
          return new Response(JSON.stringify({ success: true, message: "Test email sent via Microsoft Graph" }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (err: any) {
          await logEmail({ event_type: 'test', recipient_email, recipient_name: 'Test', subject: '[PMS] Test Email - Configuration Successful', status: 'failed', provider: 'microsoft_graph', error_message: err.message, metadata: { test: true } });
          throw err;
        }
      } else {
        try {
          const emailResponse = await sendViaResend(senderEmail, senderName, recipient_email, "[PMS] Test Email - Configuration Successful", testHtml);
          await logEmail({ event_type: 'test', recipient_email, recipient_name: 'Test', subject: '[PMS] Test Email - Configuration Successful', status: 'sent', provider: 'resend', error_message: null, metadata: { test: true } });
          return new Response(JSON.stringify({ success: true, data: emailResponse }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (err: any) {
          await logEmail({ event_type: 'test', recipient_email, recipient_name: 'Test', subject: '[PMS] Test Email - Configuration Successful', status: 'failed', provider: 'resend', error_message: err.message, metadata: { test: true } });
          throw err;
        }
      }
    }

    // Handle notification-triggered email
    const { event_type, recipient_email, recipient_name, kpi_name, kra_name, actor_name, query_reason, resolution_notes, review_period, review_year,
      pip_start_date, pip_end_date, pip_reason, pip_outcome, pip_remarks,
      milestone_date, milestone_description, milestone_expected_outcome,
      send_back_reason, generated_password, login_email, employee_code, app_name,
      kra_list, kra_count, employee_name, total_weightage,
      old_email, new_email,
      observation_title, observation_type, observation_description, reply_content,
      auto_score_reason, kpi_list, final_score, _from_scheduler } = body;

    // Check if email notifications are enabled
    const { data: enabledSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "email_notifications_enabled")
      .single();

    const isEnabled = enabledSetting?.setting_value?.replace?.(/^"|"$/g, "") === "enabled";
    if (!isEnabled) {
      console.log("Email notifications are disabled");
      await logEmail({ event_type, recipient_email, recipient_name, status: 'skipped', metadata: { reason: 'Email notifications disabled' } });
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

    // Security-critical events that always send, regardless of admin toggle settings
    const ALWAYS_SEND_EVENTS = ['email_changed', 'password_rollout'];

    if (!ALWAYS_SEND_EVENTS.includes(event_type) && !enabledEvents.includes(event_type)) {
      console.log(`Event type ${event_type} is not enabled`);
      await logEmail({ event_type, recipient_email, recipient_name, status: 'skipped', metadata: { reason: `Event type ${event_type} not enabled` } });
      return new Response(JSON.stringify({ skipped: true, reason: `Event type ${event_type} not enabled` }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // --- Schedule check: if template is "scheduled" and NOT called from scheduler, queue it ---
    if (!_from_scheduler) {
      const { data: scheduleSetting } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", `email_schedule_${event_type}`)
        .maybeSingle();

      if (scheduleSetting?.setting_value) {
        try {
          const schedConfig = typeof scheduleSetting.setting_value === "string"
            ? JSON.parse(scheduleSetting.setting_value)
            : scheduleSetting.setting_value;

          if (schedConfig && schedConfig.mode === "scheduled") {
            // Queue the email instead of sending immediately
            const metadata = { ...body };
            delete metadata.event_type;
            delete metadata.recipient_email;
            delete metadata.recipient_name;

            const { error: queueError } = await supabase
              .from("email_dispatch_queue")
              .insert({
                template_key: event_type,
                recipient_email,
                recipient_name: recipient_name || null,
                metadata,
              });

            if (queueError) {
              console.error("Failed to queue scheduled email:", queueError);
              // Fall through to send immediately as fallback
            } else {
              console.log(`Email queued for scheduled delivery: ${event_type} → ${recipient_email}`);
              await logEmail({
                event_type,
                recipient_email,
                recipient_name,
                status: 'queued',
                metadata: { reason: `Queued for scheduled delivery at ${schedConfig.time}` },
              });
              return new Response(
                JSON.stringify({ queued: true, scheduled_time: schedConfig.time }),
                { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
              );
            }
          }
        } catch {
          // Invalid config, proceed with immediate send
        }
      }
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
    const emailLogoUrl = parseValue(settingsMap.email_company_logo_url);
    const footerText = parseValue(settingsMap.email_custom_footer);

    // Prefer Global Branding app logo, fall back to email-specific logo
    let logoUrl = emailLogoUrl;
    try {
      const { data: appSettings } = await supabase
        .from("app_settings")
        .select("logo_url")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();
      if (appSettings?.logo_url) {
        logoUrl = appSettings.logo_url;
      }
    } catch (e) {
      console.error("Failed to fetch app_settings logo:", e);
    }

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
      generated_password,
      login_email,
      employee_code,
      app_name,
      kra_count,
      employee_name,
      total_weightage,
      old_email,
      new_email,
      observation_title,
      observation_type,
      observation_description: observation_description ? stripMentionSyntax(observation_description) : observation_description,
      reply_content: reply_content ? stripMentionSyntax(reply_content) : reply_content,
    };

    // For final_approved, inject final_score and score_label
    if (event_type === 'final_approved') {
      const scoreLabels: Record<string, string> = {
        '5': 'Outstanding',
        '4': 'Exceeds Expectations',
        '3': 'Meets Expectations',
        '2': 'Needs Improvement',
        '1': 'Below Expectations',
        '0': 'Not Achieved',
      };
      const scoreStr = final_score != null ? String(final_score) : 'N/A';
      const roundedScore = Math.round(Number(scoreStr)).toString();
      placeholderData.final_score = scoreStr !== 'N/A' ? scoreStr : 'N/A';
      placeholderData.score_label = scoreLabels[roundedScore] || 'N/A';
    }

    // For kra_batch_assigned, inject the KRA table HTML into the placeholder
    if (event_type === 'kra_batch_assigned' && Array.isArray(kra_list)) {
      placeholderData.kra_table = buildKraTableHtml(kra_list);
    }

    // For system_auto_scored, inject kpi_list and auto_score_reason
    // Always normalize kpi_list into a readable string before placeholder replacement
    if (auto_score_reason) {
      placeholderData.auto_score_reason = auto_score_reason;
    }
    if (kpi_list) {
      let renderedKpiList: string;
      if (typeof kpi_list === 'string') {
        renderedKpiList = kpi_list;
      } else if (Array.isArray(kpi_list)) {
        // Extract just the first line of each KPI name (before any \r\n description)
        const kpiNames = kpi_list.map((k: string) => {
          const firstLine = String(k).split(/\r?\n/)[0].trim();
          return `• ${firstLine}`;
        });
        renderedKpiList = kpiNames.join('\n');
      } else {
        renderedKpiList = String(kpi_list);
      }
      placeholderData.kpi_list = renderedKpiList;
      // Also set kpi_name from first KPI as fallback for simpler templates
      if (!placeholderData.kpi_name && Array.isArray(kpi_list) && kpi_list.length > 0) {
        placeholderData.kpi_name = String(kpi_list[0]).split(/\r?\n/)[0].trim();
      }
    }

    // For system_auto_scored sent to manager (employee_name present), override subject & body
    if (event_type === 'system_auto_scored' && employee_name) {
      template.subject = `[PMS] KPI(s) of {{employee_name}} Have Been Rated by System`;
      template.body = template.body
        .replace(/Your following KPI\(s\)/i, 'The following KPI(s) of your team member {{employee_name}}')
        .replace(/your KPI/gi, 'the KPI(s) of {{employee_name}}');
      placeholderData.employee_name = employee_name;
    }

    // Replace placeholders in subject and body
    const subject = replacePlaceholders(template.subject, placeholderData);
    const bodyContent = replacePlaceholders(template.body, placeholderData);
    const finalScoreStr = final_score != null ? String(final_score) : undefined;
    const roundedFinalScore = finalScoreStr ? String(Math.round(Number(finalScoreStr))) : undefined;
    const html = buildEmailHtml(event_type, bodyContent, { logoUrl, footerText, finalScore: roundedFinalScore });

    console.log(`Sending ${event_type} email via ${provider} to ${recipient_email}`);

    const logMeta: Record<string, any> = { review_period, review_year, employee_name };
    if (kra_count) logMeta.kra_count = kra_count;

    try {
      if (provider === 'smtp') {
        const smtpPassword = await getSmtpPassword(supabase);
        if (!smtpPassword) {
          console.error("SMTP password not configured");
          await logEmail({ event_type, recipient_email, recipient_name, subject, status: 'failed', error_message: 'SMTP password not configured', provider, metadata: logMeta });
          return new Response(JSON.stringify({ error: "SMTP password not configured. Please set it in System Settings → Email." }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        await withRetry(() => sendViaSmtp(
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
        ));

        await logEmail({ event_type, recipient_email, recipient_name, subject, status: 'sent', provider: 'smtp', metadata: logMeta });
        return new Response(JSON.stringify({ success: true, message: "Email sent via SMTP" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } else if (provider === 'microsoft_graph') {
        await withRetry(() => sendViaMicrosoftGraph(
          supabase,
          parseValue(settingsMap.graph_tenant_id),
          parseValue(settingsMap.graph_client_id),
          senderEmail,
          senderName,
          recipient_email,
          subject,
          html
        ));

        await logEmail({ event_type, recipient_email, recipient_name, subject, status: 'sent', provider: 'microsoft_graph', metadata: logMeta });
        return new Response(JSON.stringify({ success: true, message: "Email sent via Microsoft Graph" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } else {
        const emailResponse = await withRetry(() => sendViaResend(senderEmail, senderName, recipient_email, subject, html));
        await logEmail({ event_type, recipient_email, recipient_name, subject, status: 'sent', provider: 'resend', metadata: logMeta });
        return new Response(JSON.stringify({ success: true, data: emailResponse }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    } catch (sendError: any) {
      console.error("Email send failed after retries:", sendError);
      await logEmail({ event_type, recipient_email, recipient_name, subject, status: 'failed', error_message: sendError.message, provider, metadata: logMeta });
      return new Response(
        JSON.stringify({ error: sendError.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
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
