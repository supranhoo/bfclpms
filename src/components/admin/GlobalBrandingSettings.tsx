import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSettings, useUpdateAppSettings, useUploadBrandingAsset } from '@/hooks/useAppSettings';
import { Building2, Image, Upload, X, Save, Loader2 } from 'lucide-react';

export function GlobalBrandingSettings() {
  const { data: settings, isLoading } = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const uploadAsset = useUploadBrandingAsset();

  const [organizationName, setOrganizationName] = useState('');
  const [appName, setAppName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loginBackgroundUrl, setLoginBackgroundUrl] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  // Initialize form with current settings
  useEffect(() => {
    if (settings) {
      setOrganizationName(settings.organization_name || '');
      setAppName(settings.app_name || '');
      setLogoUrl(settings.logo_url);
      setLoginBackgroundUrl(settings.login_background_url);
    }
  }, [settings]);

  // Track changes
  useEffect(() => {
    if (settings) {
      const changed =
        organizationName !== (settings.organization_name || '') ||
        appName !== (settings.app_name || '') ||
        logoUrl !== settings.logo_url ||
        loginBackgroundUrl !== settings.login_background_url;
      setHasChanges(changed);
    }
  }, [organizationName, appName, logoUrl, loginBackgroundUrl, settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    setIsUploading(true);
    try {
      const path = `logo-${Date.now()}.${file.name.split('.').pop()}`;
      const url = await uploadAsset.mutateAsync({ file, path });
      setLogoUrl(url);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    setIsUploading(true);
    try {
      const path = `background-${Date.now()}.${file.name.split('.').pop()}`;
      const url = await uploadAsset.mutateAsync({ file, path });
      setLoginBackgroundUrl(url);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      organization_name: organizationName,
      app_name: appName,
      logo_url: logoUrl,
      login_background_url: loginBackgroundUrl,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Global Branding
        </CardTitle>
        <CardDescription>
          Customize the application's appearance including logo, name, and login screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Organization Name */}
        <div className="space-y-2">
          <Label htmlFor="org-name">Organization Name</Label>
          <Input
            id="org-name"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="e.g., Acme Corporation"
          />
          <p className="text-xs text-muted-foreground">
            Displayed in emails and reports.
          </p>
        </div>

        {/* App Name */}
        <div className="space-y-2">
          <Label htmlFor="app-name">Application Name</Label>
          <Input
            id="app-name"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="e.g., PMS Dashboard"
          />
          <p className="text-xs text-muted-foreground">
            Displayed in the sidebar and browser tab.
          </p>
        </div>

        {/* Logo Upload */}
        <div className="space-y-2">
          <Label>App Logo</Label>
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Image className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload Logo
                </Button>
                {logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogoUrl(null)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended: Square image, PNG or SVG, max 512x512px.
              </p>
            </div>
          </div>
        </div>

        {/* Login Background Upload */}
        <div className="space-y-2">
          <Label>Login Screen Wallpaper</Label>
          <div className="flex items-start gap-4">
            <div className="w-40 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
              {loginBackgroundUrl ? (
                <img src={loginBackgroundUrl} alt="Background" className="w-full h-full object-cover" />
              ) : (
                <Image className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/*"
                onChange={handleBackgroundUpload}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => backgroundInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload Background
                </Button>
                {loginBackgroundUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLoginBackgroundUrl(null)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended: 1920x1080px or higher, JPEG or PNG.
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t pt-4">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateSettings.isPending}
            className="gap-2"
          >
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {updateSettings.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
