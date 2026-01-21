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
  | 'period_locked';

export interface EmailNotificationSettings {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  enabledEvents: EmailEventType[];
  companyLogoUrl: string;
  customFooterText: string;
}

const EMAIL_SETTING_KEYS = [
  'email_notifications_enabled',
  'email_sender_name',
  'email_sender_address',
  'email_notification_events',
  'email_company_logo_url',
  'email_custom_footer',
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
      ];
      
      for (const { key, value } of updates) {
        const { error } = await supabase
          .from('system_settings')
          .update({ setting_value: typeof value === 'string' ? JSON.stringify(value) : value })
          .eq('setting_key', key);
        
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
