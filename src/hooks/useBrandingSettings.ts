/**
 * useBrandingSettings
 * -------------------
 * Reads loader-screen branding from `system_settings` so the rocket overlay
 * can show a configurable company name / tagline / logo. Zero hardcoding.
 *
 * Keys (created by migration `branding_loader_settings`):
 *  - branding_company_name        → string (display name)
 *  - branding_loader_tagline      → string (optional subtitle)
 *  - branding_loader_show_logo    → bool   (toggle email_company_logo_url)
 *
 * Reuses `email_company_logo_url` for the image source so admins do not
 * configure the logo twice.
 */
import { useSystemSetting } from './useSystemSettings';

export interface BrandingSettings {
  companyName: string;
  tagline: string;
  showLogo: boolean;
  logoUrl: string;
  isLoading: boolean;
}

/** Strip surrounding JSON quotes added by `system_settings` storage. */
export function unwrapSettingString(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw.replace(/^"|"$/g, '').trim();
  return String(raw).trim();
}

/** Parse the stored bool-as-string. Defaults to `dflt` when unset/invalid. */
export function parseBoolSetting(raw: unknown, dflt = false): boolean {
  if (raw === null || raw === undefined) return dflt;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).replace(/^"|"$/g, '').toLowerCase().trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return dflt;
}

export function useBrandingSettings(): BrandingSettings {
  const nameQ = useSystemSetting('branding_company_name');
  const taglineQ = useSystemSetting('branding_loader_tagline');
  const showLogoQ = useSystemSetting('branding_loader_show_logo');
  const logoUrlQ = useSystemSetting('email_company_logo_url');

  return {
    companyName: unwrapSettingString(nameQ.data?.setting_value),
    tagline: unwrapSettingString(taglineQ.data?.setting_value),
    showLogo: parseBoolSetting(showLogoQ.data?.setting_value, false),
    logoUrl: unwrapSettingString(logoUrlQ.data?.setting_value),
    isLoading:
      nameQ.isLoading || taglineQ.isLoading || showLogoQ.isLoading || logoUrlQ.isLoading,
  };
}