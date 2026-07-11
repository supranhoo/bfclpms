import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Camera, Search, Upload } from 'lucide-react';
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
        .select('assisted_self_submission_enabled, annual_review_directory_search_enabled, assisted_selfie_required, assisted_photo_upload_required')
        .eq('id', APP_SETTINGS_ID)
        .maybeSingle();
      if (error) throw error;
      return data as {
        assisted_self_submission_enabled: boolean;
        annual_review_directory_search_enabled: boolean;
        assisted_selfie_required: boolean;
        assisted_photo_upload_required: boolean;
      } | null;
    },
  });
  const [enabled, setEnabled] = useState(false);
  const [directoryEnabled, setDirectoryEnabled] = useState(false);
  const [selfieRequired, setSelfieRequired] = useState(true);
  const [photoUploadRequired, setPhotoUploadRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setEnabled(!!data.assisted_self_submission_enabled);
      setDirectoryEnabled(!!data.annual_review_directory_search_enabled);
      setSelfieRequired(data.assisted_selfie_required !== false);
      setPhotoUploadRequired(data.assisted_photo_upload_required !== false);
    }
  }, [data]);

  const update = async (
    patch: Partial<{
      assisted_self_submission_enabled: boolean;
      annual_review_directory_search_enabled: boolean;
      assisted_selfie_required: boolean;
      assisted_photo_upload_required: boolean;
    }>,
    rollback: () => void,
    label: string,
  ) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', APP_SETTINGS_ID);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['assisted-submission-flag'] });
      toast({ title: 'Setting updated', description: label });
    } catch (err) {
      rollback();
      toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const toggle = (v: boolean) => {
    const prev = enabled; setEnabled(v);
    return update(
      { assisted_self_submission_enabled: v },
      () => setEnabled(prev),
      `Assisted Annual Review submission → ${v ? 'ON' : 'OFF'}`,
    );
  };

  const toggleDirectory = (v: boolean) => {
    const prev = directoryEnabled; setDirectoryEnabled(v);
    return update(
      { annual_review_directory_search_enabled: v },
      () => setDirectoryEnabled(prev),
      `Annual Review directory search → ${v ? 'ON' : 'OFF'}`,
    );
  };

  const toggleSelfieRequired = (v: boolean) => {
    const prev = selfieRequired; setSelfieRequired(v);
    return update(
      { assisted_selfie_required: v },
      () => setSelfieRequired(prev),
      `Assisted-submission live selfie → ${v ? 'MANDATORY' : 'OPTIONAL'}`,
    );
  };

  const togglePhotoUploadRequired = (v: boolean) => {
    const prev = photoUploadRequired; setPhotoUploadRequired(v);
    return update(
      { assisted_photo_upload_required: v },
      () => setPhotoUploadRequired(prev),
      `Assisted-submission photo upload → ${v ? 'MANDATORY' : 'OPTIONAL'}`,
    );
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
      <CardContent className="space-y-4">
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

        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1 pr-4">
            <Label htmlFor="directory-flag" className="text-base font-medium flex items-center gap-2">
              <Search className="h-4 w-4" /> Enable directory search on Team Annual Review
            </Label>
            <p className="text-sm text-muted-foreground">
              When ON, Admin and HR PMS see a <span className="font-medium">Find employee</span> button on the Team
              Annual Review page. They can search any active employee, auto-create the review instance, and start the
              assisted flow. All auto-creations are written to the system audit log.
            </p>
          </div>
          <Switch
            id="directory-flag"
            checked={directoryEnabled}
            disabled={isLoading || saving}
            onCheckedChange={toggleDirectory}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1 pr-4">
            <Label htmlFor="selfie-required-flag" className="text-base font-medium flex items-center gap-2">
              <Camera className="h-4 w-4" /> Require live selfie for assisted submissions
            </Label>
            <p className="text-sm text-muted-foreground">
              When <span className="font-medium">ON</span> (default), submitters must capture a live photo of the
              employee before the assisted submission can be verified. When <span className="font-medium">OFF</span>,
              the photo becomes optional — the signed declaration alone is accepted and the audit row stores no image.
            </p>
          </div>
          <Switch
            id="selfie-required-flag"
            checked={selfieRequired}
            disabled={isLoading || saving}
            onCheckedChange={toggleSelfieRequired}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1 pr-4">
            <Label htmlFor="photo-upload-required-flag" className="text-base font-medium flex items-center gap-2">
              <Upload className="h-4 w-4" /> Require photo upload for assisted submissions
            </Label>
            <p className="text-sm text-muted-foreground">
              When <span className="font-medium">ON</span> (default), submitters must upload a photograph (e.g. an
              ID photo or a device-gallery image) in addition to any live selfie. When <span className="font-medium">OFF</span>,
              the upload is offered but can be skipped.
            </p>
          </div>
          <Switch
            id="photo-upload-required-flag"
            checked={photoUploadRequired}
            disabled={isLoading || saving}
            onCheckedChange={togglePhotoUploadRequired}
          />
        </div>
      </CardContent>
    </Card>
  );
}