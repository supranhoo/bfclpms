import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const APP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export function AssistedSubmissionSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['assisted-submission-flag'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('assisted_self_submission_enabled')
        .eq('id', APP_SETTINGS_ID)
        .maybeSingle();
      if (error) throw error;
      return data as { assisted_self_submission_enabled: boolean } | null;
    },
  });
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setEnabled(!!data.assisted_self_submission_enabled); }, [data]);

  const toggle = async (v: boolean) => {
    const prev = enabled;
    setEnabled(v); setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ assisted_self_submission_enabled: v, updated_at: new Date().toISOString() })
        .eq('id', APP_SETTINGS_ID);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['assisted-submission-flag'] });
      toast({ title: 'Setting updated', description: `Assisted Annual Review submission → ${v ? 'ON' : 'OFF'}` });
    } catch (err) {
      setEnabled(prev);
      toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Assisted Annual Review Submission</CardTitle>
        <CardDescription>
          Allow reporting managers, skip-level managers, HR, or admins to submit the self-stage of the Annual Review on
          behalf of blue-collar / non-login employees, gated by a live selfie of the employee.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1 pr-4">
            <Label htmlFor="assisted-flag" className="text-base font-medium">Enable assisted submission</Label>
            <p className="text-sm text-muted-foreground">
              When ON, eligible employees (no email or never signed in) show an "Assisted self-review" entry on the
              Team Annual Review page. A live selfie + signed declaration are captured as immutable audit evidence.
            </p>
          </div>
          <Switch id="assisted-flag" checked={enabled} disabled={isLoading || saving} onCheckedChange={toggle} />
        </div>
      </CardContent>
    </Card>
  );
}