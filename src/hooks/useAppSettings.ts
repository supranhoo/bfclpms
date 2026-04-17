import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUploadLimits } from '@/hooks/useUploadLimits';

// Singleton ID for app_settings (only one row exists)
const APP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export interface AppSettings {
  id: string;
  organization_name: string;
  app_name: string;
  logo_url: string | null;
  login_background_url: string | null;
  login_wallpapers: string[];
  login_hero_headline: string | null;
  login_hero_description: string | null;
  pms_policy_url: string | null;
  pms_policy_content: string | null;
  pms_policy_visible_roles: string[];
  view_mode_strip_color: string;
  created_at: string;
  updated_at: string;
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: async (): Promise<AppSettings | null> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', APP_SETTINGS_ID)
        .maybeSingle();

      if (error) {
        console.error('Error fetching app settings:', error);
        throw error;
      }

      // Ensure login_wallpapers is always an array of strings
      if (data) {
        const wallpapers = data.login_wallpapers;
        let parsedWallpapers: string[] = [];
        
        if (Array.isArray(wallpapers)) {
          parsedWallpapers = wallpapers.filter((item): item is string => typeof item === 'string');
        }
        
        const visibleRoles = Array.isArray(data.pms_policy_visible_roles)
          ? (data.pms_policy_visible_roles as string[])
          : ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms'];

        return {
          ...data,
          login_wallpapers: parsedWallpapers,
          pms_policy_visible_roles: visibleRoles,
          view_mode_strip_color: (data as any).view_mode_strip_color || '#3b82f6',
        } as AppSettings;
      }

      return data as AppSettings | null;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (updates: Partial<Pick<AppSettings, 'organization_name' | 'app_name' | 'logo_url' | 'login_background_url' | 'login_wallpapers' | 'login_hero_headline' | 'login_hero_description' | 'pms_policy_url' | 'pms_policy_content' | 'pms_policy_visible_roles'>>) => {
      const { data, error } = await supabase
        .from('app_settings')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', APP_SETTINGS_ID)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast({ title: 'Branding settings updated successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update branding settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUploadBrandingAsset() {
  const { toast } = useToast();
  const { maxFileSizeMb, maxFileSizeBytes } = useUploadLimits();

  return useMutation({
    mutationFn: async ({ file, path }: { file: File; path: string }): Promise<string> => {
      // Validate file size
      if (file.size > maxFileSizeBytes) {
        throw new Error(`File too large. Maximum size is ${maxFileSizeMb}MB.`);
      }

      // Upload to branding-assets bucket
      const { error: uploadError } = await supabase.storage
        .from('branding-assets')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('branding-assets')
        .getPublicUrl(path);

      return urlData.publicUrl;
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to upload file',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
