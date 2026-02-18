import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type EmailEventType = 
  | 'kpi_submitted'
  | 'manager_approved'
  | 'manager_rejected'
  | 'query_raised'
  | 'query_resolved'
  | 'final_approved'
  | 'kra_assigned'
  | 'period_locked'
  | 'pip_initiated'
  | 'pip_milestone_reminder'
  | 'pip_completed'
  | 'kpi_ready_for_audit'
  | 'kpi_ready_for_management'
  | 'query_response_received'
  | 'admin_status_change'
  | 'admin_data_entry'
  | 'admin_data_override'
  | 'org_kpi_sent_back'
  | 'observation_raised'
  | 'observation_reply'
  | 'observation_resolved'
  | 'password_rollout'
  | 'kra_batch_assigned'
  | 'admin_status_step_back'
  | 'rollback_requested'
  | 'rollback_approved'
  | 'rollback_rejected'
  | 'email_changed';

export type EmailProvider = 'resend' | 'smtp' | 'microsoft_graph';
export type SmtpSecurity = 'tls' | 'starttls' | 'none';

export interface EmailNotificationSettings {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  enabledEvents: EmailEventType[];
  companyLogoUrl: string;
  customFooterText: string;
  // SMTP configuration
  emailProvider: EmailProvider;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurity;
  smtpUsername: string;
  smtpFromAddress: string;
  smtpFromName: string;
  // Microsoft Graph configuration
  graphTenantId: string;
  graphClientId: string;
  graphFromAddress: string;
  graphFromName: string;
}

const EMAIL_SETTING_KEYS = [
  'email_notifications_enabled',
  'email_sender_name',
  'email_sender_address',
  'email_notification_events',
  'email_company_logo_url',
  'email_custom_footer',
  'email_provider',
  'smtp_host',
  'smtp_port',
  'smtp_security',
  'smtp_username',
  'smtp_from_address',
  'smtp_from_name',
  'graph_tenant_id',
  'graph_client_id',
  'graph_from_address',
  'graph_from_name',
];

export function useEmailNotificationSettings() {
  return useQuery({
    queryKey: ['email-notification-settings'],
    queryFn: async (): Promise<EmailNotificationSettings> => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .in('setting_key', EMAIL_SETTING_KEYS);
      
      if (error) throw error;
      
      const settingsMap = Object.fromEntries(
        (data || []).map((s) => [s.setting_key, s.setting_value])
      );
      
      // Parse values
      const parseStringValue = (val: unknown): string => {
        if (typeof val === 'string') {
          return val.replace(/^"|"$/g, '');
        }
        return String(val || '');
      };

      const parseNumberValue = (val: unknown, defaultVal: number): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const parsed = parseInt(val.replace(/^"|"$/g, ''), 10);
          return isNaN(parsed) ? defaultVal : parsed;
        }
        return defaultVal;
      };
      
      let enabledEvents: EmailEventType[] = [];
      try {
        const eventsVal = settingsMap.email_notification_events;
        if (Array.isArray(eventsVal)) {
          enabledEvents = eventsVal as EmailEventType[];
        } else if (typeof eventsVal === 'string') {
          enabledEvents = JSON.parse(eventsVal) as EmailEventType[];
        }
      } catch {
        enabledEvents = [];
      }
      
      return {
        enabled: parseStringValue(settingsMap.email_notifications_enabled) === 'enabled',
        senderName: parseStringValue(settingsMap.email_sender_name) || 'PMS Notifications',
        senderEmail: parseStringValue(settingsMap.email_sender_address) || 'onboarding@resend.dev',
        enabledEvents,
        companyLogoUrl: parseStringValue(settingsMap.email_company_logo_url) || '',
        customFooterText: parseStringValue(settingsMap.email_custom_footer) || '',
        // SMTP configuration
        emailProvider: (parseStringValue(settingsMap.email_provider) || 'resend') as EmailProvider,
        smtpHost: parseStringValue(settingsMap.smtp_host) || '',
        smtpPort: parseNumberValue(settingsMap.smtp_port, 587),
        smtpSecurity: (parseStringValue(settingsMap.smtp_security) || 'tls') as SmtpSecurity,
        smtpUsername: parseStringValue(settingsMap.smtp_username) || '',
        smtpFromAddress: parseStringValue(settingsMap.smtp_from_address) || '',
        smtpFromName: parseStringValue(settingsMap.smtp_from_name) || '',
        // Microsoft Graph configuration
        graphTenantId: parseStringValue(settingsMap.graph_tenant_id) || '',
        graphClientId: parseStringValue(settingsMap.graph_client_id) || '',
        graphFromAddress: parseStringValue(settingsMap.graph_from_address) || '',
        graphFromName: parseStringValue(settingsMap.graph_from_name) || '',
      };
    },
  });
}

export function useUpdateEmailSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (settings: EmailNotificationSettings) => {
      const updates = [
        { key: 'email_notifications_enabled', value: settings.enabled ? 'enabled' : 'disabled' },
        { key: 'email_sender_name', value: settings.senderName },
        { key: 'email_sender_address', value: settings.senderEmail },
        { key: 'email_notification_events', value: settings.enabledEvents },
        { key: 'email_company_logo_url', value: settings.companyLogoUrl },
        { key: 'email_custom_footer', value: settings.customFooterText },
        { key: 'email_provider', value: settings.emailProvider },
        { key: 'smtp_host', value: settings.smtpHost },
        { key: 'smtp_port', value: settings.smtpPort },
        { key: 'smtp_security', value: settings.smtpSecurity },
        { key: 'smtp_username', value: settings.smtpUsername },
        { key: 'smtp_from_address', value: settings.smtpFromAddress },
        { key: 'smtp_from_name', value: settings.smtpFromName },
        { key: 'graph_tenant_id', value: settings.graphTenantId },
        { key: 'graph_client_id', value: settings.graphClientId },
        { key: 'graph_from_address', value: settings.graphFromAddress },
        { key: 'graph_from_name', value: settings.graphFromName },
      ];
      
      for (const { key, value } of updates) {
        const { error } = await supabase
          .from('system_settings')
          .upsert(
            { setting_key: key, setting_value: typeof value === 'string' ? JSON.stringify(value) : value },
            { onConflict: 'setting_key' }
          );
        
        if (error) throw error;
      }
      
      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-notification-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Settings Saved',
        description: 'Email notification settings have been updated.',
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
}

export function useSendTestEmail() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (recipientEmail: string) => {
      const { data, error } = await supabase.functions.invoke('send-email-notification', {
        body: { test: true, recipient_email: recipientEmail },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Test Email Sent',
        description: 'Check your inbox for the test email.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Send Test Email',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useTestSmtpConnection() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (params: {
      smtpHost: string;
      smtpPort: number;
      smtpSecurity: SmtpSecurity;
      smtpUsername: string;
      smtpFromAddress: string;
      smtpFromName: string;
      recipientEmail: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('send-email-notification', {
        body: {
          smtp_test: true,
          smtp_host: params.smtpHost,
          smtp_port: params.smtpPort,
          smtp_security: params.smtpSecurity,
          smtp_username: params.smtpUsername,
          smtp_from_address: params.smtpFromAddress,
          smtp_from_name: params.smtpFromName,
          recipient_email: params.recipientEmail,
        },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'SMTP Test Successful',
        description: 'Connection verified. Check your inbox for the test email.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'SMTP Test Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
