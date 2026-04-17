import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSettings, useUpdateAppSettings, useUploadBrandingAsset } from '@/hooks/useAppSettings';
import { Building2, Image, Upload, X, Save, Loader2, Plus, Trash2, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GlobalBrandingSettings() {
  const { data: settings, isLoading } = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const uploadAsset = useUploadBrandingAsset();

  const [organizationName, setOrganizationName] = useState('');
  const [appName, setAppName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loginWallpapers, setLoginWallpapers] = useState<string[]>([]);
  const [loginHeroHeadline, setLoginHeroHeadline] = useState('');
  const [loginHeroDescription, setLoginHeroDescription] = useState('');
  const [pmsPolicyUrl, setPmsPolicyUrl] = useState('');
  const [viewModeStripColor, setViewModeStripColor] = useState('#3b82f6');
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingWallpaper, setUploadingWallpaper] = useState(false);

  // Preview state
  const [previewActive, setPreviewActive] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);

  // Initialize form with current settings
  useEffect(() => {
    if (settings) {
      setOrganizationName(settings.organization_name || '');
      setAppName(settings.app_name || '');
      setLogoUrl(settings.logo_url);
      setLoginWallpapers(settings.login_wallpapers || []);
      setLoginHeroHeadline(settings.login_hero_headline || '');
      setLoginHeroDescription(settings.login_hero_description || '');
      setPmsPolicyUrl(settings.pms_policy_url || '');
      setViewModeStripColor(settings.view_mode_strip_color || '#3b82f6');
    }
  }, [settings]);

  // Track changes
  useEffect(() => {
    if (settings) {
      const originalWallpapers = settings.login_wallpapers || [];
      const wallpapersChanged =
        loginWallpapers.length !== originalWallpapers.length ||
        loginWallpapers.some((url, i) => url !== originalWallpapers[i]);

      const changed =
        organizationName !== (settings.organization_name || '') ||
        appName !== (settings.app_name || '') ||
        logoUrl !== settings.logo_url ||
        wallpapersChanged ||
        loginHeroHeadline !== (settings.login_hero_headline || '') ||
        loginHeroDescription !== (settings.login_hero_description || '') ||
        pmsPolicyUrl !== (settings.pms_policy_url || '') ||
        viewModeStripColor !== (settings.view_mode_strip_color || '#3b82f6');
      setHasChanges(changed);
    }
  }, [organizationName, appName, logoUrl, loginWallpapers, loginHeroHeadline, loginHeroDescription, pmsPolicyUrl, viewModeStripColor, settings]);

  // Preview slideshow effect
  useEffect(() => {
    if (!previewActive || loginWallpapers.length <= 1) return;

    const timer = setInterval(() => {
      setPreviewIndex((prev) => (prev + 1) % loginWallpapers.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [previewActive, loginWallpapers.length]);

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

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    setUploadingWallpaper(true);
    try {
      const path = `wallpaper-${Date.now()}.${file.name.split('.').pop()}`;
      const url = await uploadAsset.mutateAsync({ file, path });
      setLoginWallpapers((prev) => [...prev, url]);
    } finally {
      setUploadingWallpaper(false);
      // Reset input so same file can be selected again
      if (wallpaperInputRef.current) {
        wallpaperInputRef.current.value = '';
      }
    }
  };

  const removeWallpaper = (index: number) => {
    setLoginWallpapers((prev) => prev.filter((_, i) => i !== index));
    if (previewIndex >= loginWallpapers.length - 1) {
      setPreviewIndex(Math.max(0, loginWallpapers.length - 2));
    }
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      organization_name: organizationName,
      app_name: appName,
      logo_url: logoUrl,
      login_wallpapers: loginWallpapers,
      login_hero_headline: loginHeroHeadline || null,
      login_hero_description: loginHeroDescription || null,
      pms_policy_url: pmsPolicyUrl || null,
      view_mode_strip_color: viewModeStripColor,
      // Keep login_background_url synced with first wallpaper for backward compatibility
      login_background_url: loginWallpapers.length > 0 ? loginWallpapers[0] : null,
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

        {/* Login Page Hero Headline */}
        <div className="space-y-2">
          <Label htmlFor="hero-headline">Login Page Headline</Label>
          <Input
            id="hero-headline"
            value={loginHeroHeadline}
            onChange={(e) => setLoginHeroHeadline(e.target.value)}
            placeholder="e.g., Manage performance with clarity."
          />
          <p className="text-xs text-muted-foreground">
            Main headline displayed above the login form.
          </p>
        </div>

        {/* Login Page Hero Description */}
        <div className="space-y-2">
          <Label htmlFor="hero-description">Login Page Description</Label>
          <Input
            id="hero-description"
            value={loginHeroDescription}
            onChange={(e) => setLoginHeroDescription(e.target.value)}
            placeholder="e.g., Track KPIs, conduct reviews, and drive organizational growth."
          />
          <p className="text-xs text-muted-foreground">
            Supporting text displayed below the headline.
          </p>
        </div>

        {/* PMS Policy URL */}
        <div className="space-y-2">
          <Label htmlFor="pms-policy-url">PMS Policy Document URL</Label>
          <Input
            id="pms-policy-url"
            value={pmsPolicyUrl}
            onChange={(e) => setPmsPolicyUrl(e.target.value)}
            placeholder="https://example.com/policy.pdf or Google Docs link"
          />
          <p className="text-xs text-muted-foreground">
            URL to the PMS Policy document (PDF, Google Docs, or any web page). Employees can view this from the sidebar.
          </p>
        </div>
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

        {/* Login Wallpapers - Multiple Upload */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Login Screen Wallpapers</Label>
            {loginWallpapers.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewActive(!previewActive)}
                className="gap-1 text-xs"
              >
                {previewActive ? (
                  <>
                    <Pause className="h-3 w-3" />
                    Pause Preview
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" />
                    Preview Slideshow
                  </>
                )}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Upload multiple wallpapers for an auto-rotating slideshow on the login screen (5 second intervals).
          </p>

          {/* Wallpaper Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {loginWallpapers.map((url, index) => (
              <div
                key={url}
                className={cn(
                  'relative aspect-video rounded-lg overflow-hidden border-2 transition-all group',
                  previewActive && index === previewIndex
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <img
                  src={url}
                  alt={`Wallpaper ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Index badge */}
                <div className="absolute top-1 left-1 bg-background/80 backdrop-blur-sm text-foreground text-xs font-medium px-1.5 py-0.5 rounded">
                  {index + 1}
                </div>
                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => removeWallpaper(index)}
                  className="absolute top-1 right-1 p-1 bg-destructive/90 text-destructive-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                {/* Active indicator for preview */}
                {previewActive && index === previewIndex && (
                  <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                    <div className="bg-primary text-primary-foreground text-xs font-medium px-2 py-1 rounded">
                      Playing
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add Wallpaper Button */}
            <button
              type="button"
              onClick={() => wallpaperInputRef.current?.click()}
              disabled={uploadingWallpaper}
              className={cn(
                'aspect-video rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors',
                uploadingWallpaper && 'opacity-50 cursor-not-allowed'
              )}
            >
              {uploadingWallpaper ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Plus className="h-6 w-6" />
                  <span className="text-xs font-medium">Add</span>
                </>
              )}
            </button>
          </div>

          <input
            ref={wallpaperInputRef}
            type="file"
            accept="image/*"
            onChange={handleWallpaperUpload}
            className="hidden"
          />

          {loginWallpapers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {loginWallpapers.length} wallpaper{loginWallpapers.length !== 1 ? 's' : ''} uploaded • {loginWallpapers.length * 5} second cycle
            </p>
          )}
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
