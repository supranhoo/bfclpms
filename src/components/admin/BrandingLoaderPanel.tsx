/**
 * BrandingLoaderPanel
 * -------------------
 * Admin card on Module Hub Settings that lets admins configure the rocket
 * loading overlay shown across the app: company name, tagline and the
 * "show logo" toggle. Includes a live preview that re-renders as the admin
 * types — they see the exact card end-users will see.
 *
 * No values are hardcoded; everything is persisted to `system_settings`
 * via `useUpdateSystemSetting`.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { useBrandingSettings } from '@/hooks/useBrandingSettings';
import { useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { PageLoadingOverlay } from '@/components/ui/PageLoadingOverlay';
import { toast } from 'sonner';

export function BrandingLoaderPanel() {
  const branding = useBrandingSettings();
  const update = useUpdateSystemSetting();

  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [showLogo, setShowLogo] = useState(false);

  // Sync local form state with the loaded settings (only on initial load).
  useEffect(() => {
    if (branding.isLoading) return;
    setCompanyName(branding.companyName);
    setTagline(branding.tagline);
    setShowLogo(branding.showLogo);
    // Intentionally only on first non-loading render — keep admin edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding.isLoading]);

  const dirty =
    companyName !== branding.companyName ||
    tagline !== branding.tagline ||
    showLogo !== branding.showLogo;

  const handleSave = async () => {
    try {
      await Promise.all([
        update.mutateAsync({ key: 'branding_company_name', value: companyName }),
        update.mutateAsync({ key: 'branding_loader_tagline', value: tagline }),
        update.mutateAsync({ key: 'branding_loader_show_logo', value: String(showLogo) }),
      ]);
      toast.success('Loader branding updated');
    } catch (err) {
      toast.error(`Failed to save: ${(err as Error).message}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Branding · Loading Screen
        </CardTitle>
        <CardDescription>
          Personalise the rocket "Please wait" overlay shown during page navigation across
          the app. Leave the fields empty to keep the current default look.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branding-company-name">Company Name</Label>
              <Input
                id="branding-company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. ACME Corporation"
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">
                Displayed beneath the rocket. Empty = hide.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branding-tagline">Tagline (optional)</Label>
              <Input
                id="branding-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Performance Management Suite"
                maxLength={120}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Show logo on loader</Label>
                <p className="text-xs text-muted-foreground">
                  Uses the logo configured under Email Branding
                  {!branding.logoUrl && ' (none uploaded yet)'}.
                </p>
              </div>
              <Switch
                checked={showLogo}
                onCheckedChange={setShowLogo}
                disabled={!branding.logoUrl && !showLogo}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!dirty || update.isPending}>
                {update.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Live Preview</Label>
            <div className="rounded-lg border bg-muted/30 p-6">
              <PageLoadingOverlay
                open
                variant="inline"
                branding={{
                  companyName,
                  tagline,
                  showLogo,
                  logoUrl: branding.logoUrl,
                  isLoading: false,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Updates as you type — this is exactly what users will see.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}