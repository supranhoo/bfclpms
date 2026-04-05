import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EmailScheduleConfig {
  mode: 'immediate' | 'scheduled';
  time: string; // HH:MM format
  timezone: string;
}

const DEFAULT_SCHEDULE: EmailScheduleConfig = {
  mode: 'immediate',
  time: '09:00',
  timezone: 'Asia/Kolkata',
};

export function useEmailTemplateSchedules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['email-template-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .like('setting_key', 'email_schedule_%');

      if (error) throw error;

      const map: Record<string, EmailScheduleConfig> = {};
      for (const row of data || []) {
        const templateKey = row.setting_key.replace('email_schedule_', '');
        try {
          const val = typeof row.setting_value === 'string'
            ? JSON.parse(row.setting_value)
            : row.setting_value;
          if (val && typeof val === 'object' && 'mode' in val) {
            map[templateKey] = val as EmailScheduleConfig;
          }
        } catch {
          // skip invalid
        }
      }
      return map;
    },
  });

  const getSchedule = (templateKey: string): EmailScheduleConfig => {
    return schedules?.[templateKey] || DEFAULT_SCHEDULE;
  };

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ templateKey, config }: { templateKey: string; config: EmailScheduleConfig }) => {
      const settingKey = `email_schedule_${templateKey}`;
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          {
            setting_key: settingKey,
            setting_value: config as any,
            description: `Email schedule config for ${templateKey}`,
          },
          { onConflict: 'setting_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-template-schedules'] });
      toast({
        title: 'Schedule Updated',
        description: 'Email schedule has been saved successfully.',
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

  return {
    schedules: schedules || {},
    isLoading,
    getSchedule,
    updateSchedule: updateScheduleMutation.mutate,
    isUpdating: updateScheduleMutation.isPending,
  };
}
