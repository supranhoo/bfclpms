import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileText, Save, RotateCcw, Eye, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useEmailTemplateSchedules, type EmailScheduleConfig } from '@/hooks/useEmailTemplateSchedules';

interface EmailTemplate {
  key: string;
  label: string;
  description: string;
  subject: string;
  bodyTemplate: string;
  color: string;
  emoji: string;
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    key: 'kpi_submitted',
    label: 'KPI Submission',
    description: 'Sent to manager when employee submits self-review',
    subject: '[PMS] New KPI Submitted for Review - {{actor_name}}',
    bodyTemplate: `Hi {{recipient_name}},

{{actor_name}} has submitted their self-review for:

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please review and provide your feedback.`,
    color: '#6366f1',
    emoji: '📝',
  },
  {
    key: 'manager_approved',
    label: 'Manager Approval',
    description: 'Sent to employee when manager approves KPI',
    subject: '[PMS] Your KPI Has Been Approved',
    bodyTemplate: `Hi {{recipient_name}},

Great news! Your KPI has been approved by your manager.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

The review will now proceed to the next stage.`,
    color: '#10b981',
    emoji: '✅',
  },
  {
    key: 'manager_rejected',
    label: 'Send Back',
    description: 'Sent to employee when KPI is sent back for revision',
    subject: '[PMS] Action Required: KPI Sent Back for Revision',
    bodyTemplate: `Hi {{recipient_name}},

Your KPI has been sent back for revision.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

{{#if send_back_reason}}Reviewer's Remark:
{{send_back_reason}}

{{/if}}Please review the feedback and update your submission.`,
    color: '#f59e0b',
    emoji: '🔄',
  },
  {
    key: 'kpi_ready_for_audit',
    label: 'Ready for Audit',
    description: 'Sent to auditors when KPI is ready for audit review',
    subject: '[PMS] KPI Ready for Audit Review',
    bodyTemplate: `Hi {{recipient_name}},

A KPI is ready for your audit review.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please review and provide your assessment.`,
    color: '#8b5cf6',
    emoji: '🔍',
  },
  {
    key: 'kpi_ready_for_management',
    label: 'Ready for Management',
    description: 'Sent to management when KPI is ready for final review',
    subject: '[PMS] KPI Ready for Management Review',
    bodyTemplate: `Hi {{recipient_name}},

A KPI is ready for management review.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please review and provide final approval.`,
    color: '#0ea5e9',
    emoji: '👔',
  },
  {
    key: 'final_approved',
    label: 'Final Approval',
    description: 'Sent to employee when KPI receives final sign-off',
    subject: '[PMS] 🎉 Your KPI Has Been Finalized',
    bodyTemplate: `Hi {{recipient_name}},

Congratulations! Your KPI has received final approval and is now complete.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Thank you for your contribution!`,
    color: '#6366f1',
    emoji: '🎉',
  },
  {
    key: 'query_raised',
    label: 'Query Raised',
    description: 'Sent to recipient when a query is raised',
    subject: '[PMS] New Query Raised on Your KPI',
    bodyTemplate: `Hi {{recipient_name}},

{{actor_name}} has raised a query on your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Query: {{query_reason}}

Please respond to this query at your earliest convenience.`,
    color: '#f43f5e',
    emoji: '❓',
  },
  {
    key: 'query_response_received',
    label: 'Query Response',
    description: 'Sent to raiser when employee responds to query',
    subject: '[PMS] Query Response Received',
    bodyTemplate: `Hi {{recipient_name}},

A response has been submitted to your query.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Resolution: {{resolution_notes}}

Please review the response and take appropriate action.`,
    color: '#f59e0b',
    emoji: '💬',
  },
  {
    key: 'query_resolved',
    label: 'Query Resolved',
    description: 'Sent to employee when their query is resolved',
    subject: '[PMS] Your Query Has Been Resolved',
    bodyTemplate: `Hi {{recipient_name}},

Your query has been resolved by {{actor_name}}.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Resolution: {{resolution_notes}}`,
    color: '#10b981',
    emoji: '✅',
  },
  {
    key: 'kra_assigned',
    label: 'KRA Assignment',
    description: 'Sent to employee when new KRA is assigned',
    subject: '[PMS] New KRA Assigned to You',
    bodyTemplate: `Hi {{recipient_name}},

A new KRA has been assigned to you.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please review your new assignment.`,
    color: '#6366f1',
    emoji: '📋',
  },
  {
    key: 'period_locked',
    label: 'Period Locked',
    description: 'Sent when review period is locked',
    subject: '[PMS] Review Period Has Been Locked',
    bodyTemplate: `Hi {{recipient_name}},

The review period {{review_period}} {{review_year}} has been locked.

No further changes can be made to KPIs in this period unless unlocked by an administrator.`,
    color: '#64748b',
    emoji: '🔒',
  },
  {
    key: 'admin_status_change',
    label: 'Admin Status Change',
    description: 'Sent when admin changes KPI status',
    subject: '[PMS] Admin Status Change on Your KPI',
    bodyTemplate: `Hi {{recipient_name}},

An administrator has changed the status of your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please check your dashboard for updated details.`,
    color: '#64748b',
    emoji: '⚙️',
  },
  {
    key: 'admin_data_entry',
    label: 'Admin Data Entry',
    description: 'Sent when admin enters data for a KPI',
    subject: '[PMS] Admin Data Entry on Your KPI',
    bodyTemplate: `Hi {{recipient_name}},

An administrator has entered data for your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please check your dashboard for updated details.`,
    color: '#64748b',
    emoji: '📊',
  },
  {
    key: 'admin_data_override',
    label: 'Admin Data Override',
    description: 'Sent when admin overrides KPI data',
    subject: '[PMS] Admin Data Override on Your KPI',
    bodyTemplate: `Hi {{recipient_name}},

An administrator has overridden data on your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Please check your dashboard for updated details.`,
    color: '#64748b',
    emoji: '🔧',
  },
  {
    key: 'org_kpi_sent_back',
    label: 'Org KPI Sent Back',
    description: 'Sent when org KPI data is sent back for revision',
    subject: '[PMS] Org KPI Data Sent Back for Revision',
    bodyTemplate: `Hi {{recipient_name}},

The org KPI data you submitted has been sent back for revision.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Reason: {{send_back_reason}}

Please review the feedback and resubmit the data.`,
    color: '#f59e0b',
    emoji: '↩️',
  },
  {
    key: 'pip_initiated',
    label: 'PIP Started',
    description: 'Sent to employee when placed on Performance Improvement Plan',
    subject: '[PMS] Performance Improvement Plan Notification',
    bodyTemplate: `Hi {{recipient_name}},

You have been placed on a Performance Improvement Plan (PIP).

Start Date: {{pip_start_date}}
End Date: {{pip_end_date}}
Reason: {{pip_reason}}

Please check your email or contact HR for the formal PIP letter with detailed information about the improvement areas, milestones, and expectations.

We encourage you to take this opportunity seriously and work towards meeting the improvement goals.`,
    color: '#ef4444',
    emoji: '⚠️',
  },
  {
    key: 'pip_milestone_reminder',
    label: 'PIP Milestone',
    description: 'Reminder sent before PIP milestone check-in dates',
    subject: '[PMS] PIP Milestone Check-in Reminder',
    bodyTemplate: `Hi {{recipient_name}},

This is a reminder that you have an upcoming PIP milestone check-in.

Milestone Date: {{milestone_date}}
Description: {{milestone_description}}
Expected Outcome: {{milestone_expected_outcome}}

Please prepare for your check-in meeting with your manager.`,
    color: '#f59e0b',
    emoji: '📅',
  },
  {
    key: 'pip_completed',
    label: 'PIP Completed',
    description: 'Sent when PIP is successfully completed',
    subject: '[PMS] 🎉 Performance Improvement Plan Completed',
    bodyTemplate: `Hi {{recipient_name}},

Congratulations! Your Performance Improvement Plan has been successfully completed.

Outcome: {{pip_outcome}}
Remarks: {{pip_remarks}}

Thank you for your dedication and hard work during this period. We appreciate your commitment to improvement.`,
    color: '#10b981',
    emoji: '🎉',
  },
  {
    key: 'observation_raised',
    label: 'Observation Raised',
    description: 'Sent to KPI owner when a new observation is raised',
    subject: '[PMS] New Observation on {{kpi_name}}',
    bodyTemplate: `Hi {{recipient_name}},

{{actor_name}} has raised a new observation on your KPI.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Observation: {{observation_title}}
Type: {{observation_type}}
Description: {{observation_description}}

Please review and respond to the observation.`,
    color: '#f97316',
    emoji: '👁️',
  },
  {
    key: 'observation_reply',
    label: 'Observation Reply',
    description: 'Sent when someone replies to an observation',
    subject: '[PMS] New Reply on Observation - {{kpi_name}}',
    bodyTemplate: `Hi {{recipient_name}},

{{actor_name}} has replied to an observation on {{kpi_name}}.

Period: {{review_period}} {{review_year}}
Observation: {{observation_title}}

Please check the observation thread for the latest update.`,
    color: '#8b5cf6',
    emoji: '💬',
  },
  {
    key: 'observation_resolved',
    label: 'Observation Resolved',
    description: 'Sent when an observation is marked as resolved',
    subject: '[PMS] Observation Resolved - {{kpi_name}}',
    bodyTemplate: `Hi {{recipient_name}},

An observation on your KPI has been resolved.

KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}
Observation: {{observation_title}}

The observation has been closed. No further action is required.`,
    color: '#10b981',
    emoji: '✅',
  },
  {
    key: 'password_rollout',
    label: 'Password Rollout',
    description: 'Sent to users when admin generates login credentials',
    subject: '[PMS] Your Login Credentials',
    bodyTemplate: `Hi {{recipient_name}},

Your login credentials for the Performance Management System have been created.

Email: {{login_email}}
Password: {{generated_password}}

Please log in and change your password as soon as possible.

Login URL: {{login_url}}`,
    color: '#6366f1',
    emoji: '🔑',
  },
  {
    key: 'kra_batch_assigned',
    label: 'Batch KRA Assignment',
    description: 'Sent to employee & manager when multiple KRAs are assigned at once',
    subject: '[PMS] {{kra_count}} KRA(s) Assigned - {{review_period}} {{review_year}}',
    bodyTemplate: `Hi {{recipient_name}},

{{kra_count}} KRA(s) have been assigned to {{employee_name}} for {{review_period}} {{review_year}}.

{{kra_table}}

Total Weightage: {{total_weightage}}

Please log in to review the assignments.`,
    color: '#3b82f6',
    emoji: '📋',
  },
  {
    key: 'system_auto_scored',
    label: 'System Auto-Score',
    description: 'Sent to employee & manager when system auto-scores KPIs due to overdue review',
    subject: '[PMS] Your KPI(s) Have Been Rated by System',
    bodyTemplate: `Dear {{recipient_name}},

Your following KPI(s) for {{review_period}} {{review_year}} have been reviewed by the system due to {{auto_score_reason}}.

{{kpi_list}}

Kindly check your KPIs for more details.`,
    color: '#f97316',
    emoji: '⚡',
  },
  {
    key: 'monthly_review_reminder',
    label: 'Monthly Review Reminder',
    description: 'Sent on alternate dates (1st, 3rd, 5th, 7th, 9th) of each month to remind employees to complete self-review & team KRA review',
    subject: '[{{company_name}}] Reminder: Complete Your {{review_period}} {{review_year}} Performance Review',
    bodyTemplate: `Dear {{recipient_name}},

This is a reminder to complete your performance review for {{review_period}} {{review_year}}.

Please log in to the PMS portal and submit your self-review at the earliest.

If you have already submitted, kindly disregard this reminder.

Best regards,
{{company_name}} HR Team`,
    color: '#3b82f6',
    emoji: '📋',
  },
  {
    key: 'query_response_reminder',
    label: 'Query Response Reminder',
    description: 'Sent daily to employees with unresponded open queries',
    subject: '[PMS] ⏳ Reminder: {{pending_count}} Open Query(ies) Pending Your Response',
    bodyTemplate: `Hi {{recipient_name}},

This is a daily reminder that you have {{pending_count}} open query(ies) pending your response.

{{pending_list}}

Please log in and respond to these queries at your earliest convenience.`,
    color: '#f97316',
    emoji: '⏳',
  },
  {
    key: 'observation_response_reminder',
    label: 'Observation Response Reminder',
    description: 'Sent daily to employees with unacknowledged open observations',
    subject: '[PMS] ⏳ Reminder: {{pending_count}} Open Observation(s) Pending Acknowledgment',
    bodyTemplate: `Hi {{recipient_name}},

This is a daily reminder that you have {{pending_count}} open observation(s) pending your acknowledgment.

{{pending_list}}

Please log in and acknowledge these observations at your earliest convenience.`,
    color: '#f97316',
    emoji: '⏳',
  },
];

const PLACEHOLDERS = [
  { key: '{{recipient_name}}', description: 'Name of the email recipient' },
  { key: '{{actor_name}}', description: 'Name of the person who performed the action' },
  { key: '{{kra_name}}', description: 'Key Result Area name' },
  { key: '{{kpi_name}}', description: 'Key Performance Indicator name' },
  { key: '{{review_period}}', description: 'Review period (e.g., Q1, H1)' },
  { key: '{{review_year}}', description: 'Review year' },
  { key: '{{query_reason}}', description: 'Reason for the query (query events only)' },
  { key: '{{resolution_notes}}', description: 'Resolution notes (query resolved only)' },
  { key: '{{send_back_reason}}', description: 'Reason for sending back (send-back events only)' },
  { key: '{{pip_start_date}}', description: 'PIP start date (PIP events only)' },
  { key: '{{pip_end_date}}', description: 'PIP end date (PIP events only)' },
  { key: '{{pip_reason}}', description: 'Reason for PIP (PIP events only)' },
  { key: '{{pip_outcome}}', description: 'PIP outcome - improved/not improved (PIP completed only)' },
  { key: '{{pip_remarks}}', description: 'Completion remarks (PIP completed only)' },
  { key: '{{milestone_date}}', description: 'Milestone date (PIP milestone only)' },
  { key: '{{milestone_description}}', description: 'Milestone description (PIP milestone only)' },
  { key: '{{milestone_expected_outcome}}', description: 'Expected outcome (PIP milestone only)' },
  { key: '{{observation_title}}', description: 'Observation title (observation events only)' },
  { key: '{{observation_type}}', description: 'Observation type (observation raised only)' },
  { key: '{{observation_description}}', description: 'Observation description (observation events only)' },
  { key: '{{generated_password}}', description: 'Generated password (password rollout only)' },
  { key: '{{login_email}}', description: 'User login email (password rollout only)' },
  { key: '{{login_url}}', description: 'Application login URL (password rollout only)' },
  { key: '{{kra_count}}', description: 'Number of KRAs assigned (batch assignment only)' },
  { key: '{{kra_table}}', description: 'Auto-generated HTML table of assigned KRAs (batch assignment only, not editable)' },
  { key: '{{employee_name}}', description: 'Name of the employee (used in batch assignment & manager auto-score emails)' },
  { key: '{{total_weightage}}', description: 'Total weightage of assigned KRAs (batch assignment only)' },
  { key: '{{auto_score_reason}}', description: 'Reason for system auto-score (e.g. delayed self review)' },
  { key: '{{kpi_list}}', description: 'Bullet list of auto-scored KPI names (system auto-score only)' },
  { key: '{{pending_kpis_count}}', description: 'Number of pending KPIs (monthly review reminder only)' },
  { key: '{{pending_kpis_list}}', description: 'List of pending KPI names (monthly review reminder only)' },
  { key: '{{pending_count}}', description: 'Number of pending queries/observations (reminder emails only)' },
  { key: '{{pending_list}}', description: 'Formatted list of pending items (reminder emails only)' },
];

export function EmailTemplateEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState(DEFAULT_TEMPLATES[0].key);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, { subject: string; body: string }>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const { getSchedule, updateSchedule, isUpdating: isScheduleUpdating } = useEmailTemplateSchedules();
  const [scheduleEdits, setScheduleEdits] = useState<Record<string, EmailScheduleConfig>>({});

  // Fetch saved templates from system_settings
  const { data: savedTemplates, isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .like('setting_key', 'email_template_%');
      
      if (error) throw error;
      
      const templates: Record<string, { subject: string; body: string }> = {};
      for (const setting of data || []) {
        const key = setting.setting_key.replace('email_template_', '');
        try {
          const value = typeof setting.setting_value === 'string' 
            ? JSON.parse(setting.setting_value) 
            : setting.setting_value;
          templates[key] = value;
        } catch {
          // Skip invalid entries
        }
      }
      return templates;
    },
  });

  // Initialize edited templates with saved or default values
  useEffect(() => {
    if (savedTemplates) {
      const initial: Record<string, { subject: string; body: string }> = {};
      for (const template of DEFAULT_TEMPLATES) {
        initial[template.key] = savedTemplates[template.key] || {
          subject: template.subject,
          body: template.bodyTemplate,
        };
      }
      setEditedTemplates(initial);
    }
  }, [savedTemplates]);

  const updateTemplateMutation = useMutation({
    mutationFn: async (templates: Record<string, { subject: string; body: string }>) => {
      for (const [key, value] of Object.entries(templates)) {
        const settingKey = `email_template_${key}`;
        
        // Check if setting exists
        const { data: existing } = await supabase
          .from('system_settings')
          .select('id')
          .eq('setting_key', settingKey)
          .single();
        
        if (existing) {
          const { error } = await supabase
            .from('system_settings')
            .update({ setting_value: value })
            .eq('setting_key', settingKey);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('system_settings')
            .insert({
              setting_key: settingKey,
              setting_value: value,
              description: `Custom email template for ${key} notifications`,
            });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setHasChanges(false);
      toast({
        title: 'Templates Saved',
        description: 'Email templates have been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleTemplateChange = (key: string, field: 'subject' | 'body', value: string) => {
    setEditedTemplates(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
    setHasChanges(true);
  };

  const handleResetTemplate = (key: string) => {
    const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.key === key);
    if (defaultTemplate) {
      setEditedTemplates(prev => ({
        ...prev,
        [key]: {
          subject: defaultTemplate.subject,
          body: defaultTemplate.bodyTemplate,
        },
      }));
      setHasChanges(true);
    }
  };

  const handleSave = () => {
    updateTemplateMutation.mutate(editedTemplates);
  };

  const currentTemplate = DEFAULT_TEMPLATES.find(t => t.key === selectedTemplate);
  const currentEdited = editedTemplates[selectedTemplate];

  const renderPreview = () => {
    if (!currentTemplate || !currentEdited) return null;
    
    const sampleData: Record<string, string> = {
      '{{recipient_name}}': 'John Doe',
      '{{actor_name}}': 'Jane Smith',
      '{{kra_name}}': 'Sales Performance',
      '{{kpi_name}}': 'Monthly Sales Target',
      '{{review_period}}': 'Q1',
      '{{review_year}}': '2024',
      '{{query_reason}}': 'Please provide supporting documents',
      '{{resolution_notes}}': 'Documents have been uploaded and verified',
      '{{auto_score_reason}}': 'delayed self review',
      '{{kpi_list}}': '• Monthly Sales Target\n• Customer Satisfaction Score\n• Revenue Growth Rate',
      '{{employee_name}}': 'John Doe',
      '{{observation_title}}': 'Target Shortfall',
      '{{observation_type}}': 'negative',
      '{{observation_description}}': 'Missed the quarterly target by 15%',
      '{{send_back_reason}}': 'Please provide supporting evidence',
      '{{rollback_reason}}': 'Incorrect data entry needs correction',
    };
    
    let previewSubject = currentEdited.subject;
    let previewBody = currentEdited.body;
    
    for (const [placeholder, value] of Object.entries(sampleData)) {
      previewSubject = previewSubject.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
      previewBody = previewBody.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    return (
      <div className="border rounded-lg overflow-hidden">
        <div 
          className="p-4 text-white text-center"
          style={{ background: `linear-gradient(135deg, ${currentTemplate.color}, ${currentTemplate.color}dd)` }}
        >
          <span className="text-2xl">{currentTemplate.emoji}</span>
          <h3 className="font-semibold mt-1">{currentTemplate.label}</h3>
        </div>
        <div className="p-4 bg-muted/50">
          <p className="text-sm text-muted-foreground mb-1">Subject:</p>
          <p className="font-medium">{previewSubject}</p>
        </div>
        <div className="p-4 whitespace-pre-wrap text-sm">
          {previewBody}
        </div>
        <div className="p-4 bg-muted/30 text-center text-xs text-muted-foreground">
          This is an automated notification from the Performance Management System.
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Email Templates
        </CardTitle>
        <CardDescription>
          Customize the email content for each notification type. Use placeholders to include dynamic data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template Selection */}
        <Tabs value={selectedTemplate} onValueChange={setSelectedTemplate}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {DEFAULT_TEMPLATES.map((template) => (
              <TabsTrigger
                key={template.key}
                value={template.key}
                className="text-xs"
              >
                <span className="mr-1">{template.emoji}</span>
                {template.label}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {DEFAULT_TEMPLATES.map((template) => (
            <TabsContent key={template.key} value={template.key} className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{template.label}</h4>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </div>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="relative">
                        <Clock className="h-4 w-4 mr-1" />
                        Schedule
                        {(scheduleEdits[template.key]?.mode || getSchedule(template.key).mode) === 'scheduled' && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="end">
                      <div className="space-y-4">
                        <h4 className="font-medium text-sm">Email Dispatch Schedule</h4>
                        <RadioGroup
                          value={scheduleEdits[template.key]?.mode || getSchedule(template.key).mode}
                          onValueChange={(val) => {
                            const current = scheduleEdits[template.key] || getSchedule(template.key);
                            setScheduleEdits(prev => ({
                              ...prev,
                              [template.key]: { ...current, mode: val as 'immediate' | 'scheduled' },
                            }));
                          }}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="immediate" id={`immediate-${template.key}`} />
                            <Label htmlFor={`immediate-${template.key}`} className="text-sm font-normal">
                              Send Immediately
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="scheduled" id={`scheduled-${template.key}`} />
                            <Label htmlFor={`scheduled-${template.key}`} className="text-sm font-normal">
                              Send at Scheduled Time
                            </Label>
                          </div>
                        </RadioGroup>
                        {(scheduleEdits[template.key]?.mode || getSchedule(template.key).mode) === 'scheduled' && (
                          <div className="space-y-2">
                            <Label className="text-sm">Send Time (24h)</Label>
                            <Input
                              type="time"
                              value={scheduleEdits[template.key]?.time || getSchedule(template.key).time}
                              onChange={(e) => {
                                const current = scheduleEdits[template.key] || getSchedule(template.key);
                                setScheduleEdits(prev => ({
                                  ...prev,
                                  [template.key]: { ...current, time: e.target.value },
                                }));
                              }}
                            />
                            <p className="text-xs text-muted-foreground">
                              Timezone: Asia/Kolkata (IST)
                            </p>
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={isScheduleUpdating}
                          onClick={() => {
                            const config = scheduleEdits[template.key] || getSchedule(template.key);
                            updateSchedule({ templateKey: template.key, config });
                          }}
                        >
                          {isScheduleUpdating ? 'Saving...' : 'Save Schedule'}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Email Preview</DialogTitle>
                      </DialogHeader>
                      {renderPreview()}
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResetTemplate(template.key)}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`subject-${template.key}`}>Subject Line</Label>
                  <Input
                    id={`subject-${template.key}`}
                    value={editedTemplates[template.key]?.subject || template.subject}
                    onChange={(e) => handleTemplateChange(template.key, 'subject', e.target.value)}
                    placeholder="Email subject"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`body-${template.key}`}>Email Body</Label>
                  <Textarea
                    id={`body-${template.key}`}
                    value={editedTemplates[template.key]?.body || template.bodyTemplate}
                    onChange={(e) => handleTemplateChange(template.key, 'body', e.target.value)}
                    placeholder="Email content"
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        
        {/* Placeholders Reference */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <h4 className="font-medium mb-2">Available Placeholders</h4>
          <div className="flex flex-wrap gap-2">
            {PLACEHOLDERS.map((p) => (
              <Badge 
                key={p.key} 
                variant="secondary" 
                className="font-mono text-xs cursor-help"
                title={p.description}
              >
                {p.key}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Hover over a placeholder to see its description. These will be replaced with actual values when emails are sent.
          </p>
        </div>
        
        {/* Save Button */}
        <div className="flex justify-end border-t pt-4">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateTemplateMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateTemplateMutation.isPending ? 'Saving...' : 'Save Templates'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
