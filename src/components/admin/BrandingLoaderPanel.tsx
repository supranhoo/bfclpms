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
import { useBrandingSettings, DEFAULT_ROCKET_COLOR } from '@/hooks/useBrandingSettings';
import { useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { PageLoadingOverlay } from '@/components/ui/PageLoadingOverlay';
import { toast } from 'sonner';

const COLOR_PRESETS: { label: string; value: string }[] = [
  { label: 'Dark Orange', value: '#C2410C' },
  { label: 'Navy', value: '#0E2A47' },
  { label: 'Emerald', value: '#047857' },
  { label: 'Crimson', value: '#B91C1C' },
  { label: 'Indigo', value: '#3730A3' },
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function BrandingLoaderPanel() {
  const branding = useBrandingSettings();
  const update = useUpdateSystemSetting();

  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [showLogo, setShowLogo] = useState(false);
  const [rocketColor, setRocketColor] = useState(DEFAULT_ROCKET_COLOR);

  // Sync local form state with the loaded settings (only on initial load).
  useEffect(() => {
    if (branding.isLoading) return;
    setCompanyName(branding.companyName);
    setTagline(branding.tagline);
    setShowLogo(branding.showLogo);
    setRocketColor(branding.rocketColor);
    // Intentionally only on first non-loading render — keep admin edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding.isLoading]);

  const dirty =
    companyName !== branding.companyName ||
    tagline !== branding.tagline ||
    showLogo !== branding.showLogo ||
    rocketColor.toLowerCase() !== branding.rocketColor.toLowerCase();

  const colorValid = HEX_RE.test(rocketColor);

  const handleSave = async () => {
    if (!colorValid) {
      toast.error('Rocket color must be a valid hex (e.g. #C2410C).');
      return;
    }
    try {
      await Promise.all([
        update.mutateAsync({ key: 'branding_company_name', value: companyName }),
        update.mutateAsync({ key: 'branding_loader_tagline', value: tagline }),
        update.mutateAsync({ key: 'branding_loader_show_logo', value: String(showLogo) }),
        update.mutateAsync({ key: 'branding_loader_rocket_color', value: rocketColor }),
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

            <div className="space-y-2">
              <Label htmlFor="branding-rocket-color">Rocket Color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="branding-rocket-color"
                  type="color"
                  aria-label="Pick rocket color"
                  value={colorValid ? rocketColor : DEFAULT_ROCKET_COLOR}
                  onChange={(e) => setRocketColor(e.target.value.toUpperCase())}
                  className="h-10 w-12 cursor-pointer rounded-md border bg-background p-1"
                />
                <Input
                  value={rocketColor}
                  onChange={(e) => setRocketColor(e.target.value)}
                  placeholder="#C2410C"
                  maxLength={7}
                  className="font-mono uppercase"
                  aria-invalid={!colorValid}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRocketColor(DEFAULT_ROCKET_COLOR)}
                  className="shrink-0"
                >
                  Reset
                </Button>
              </div>
              {!colorValid && (
                <p className="text-xs text-destructive">Enter a valid hex color (e.g. #C2410C).</p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Presets:</span>
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setRocketColor(p.value)}
                    title={`${p.label} (${p.value})`}
                    aria-label={`Use ${p.label}`}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      rocketColor.toLowerCase() === p.value.toLowerCase()
                        ? 'border-foreground ring-2 ring-ring ring-offset-1'
                        : 'border-border hover:scale-110'
                    }`}
                    style={{ backgroundColor: p.value }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Controls the rocket body color on the loading overlay. Default is Dark Orange.
              </p>
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
              <Button onClick={handleSave} disabled={!dirty || !colorValid || update.isPending}>
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
                  rocketColor: colorValid ? rocketColor : DEFAULT_ROCKET_COLOR,
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