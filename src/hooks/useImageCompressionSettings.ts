import { useMemo } from 'react';
import { useSystemSetting } from '@/hooks/useSystemSettings';
import {
  DEFAULT_COMPRESSION_POLICY,
  type CompressionPolicy,
} from '@/lib/imageCompression';

/**
 * Reads the two image-compression settings from `system_settings`:
 *   - `image_compression_enabled` → boolean (default true)
 *   - `image_compression_policy`  → partial CompressionPolicy (defaults filled)
 *
 * Both keys are optional; sensible defaults apply when absent so this hook
 * can be safely called from any upload site without admin setup first.
 */
export interface ImageCompressionSettings {
  enabled: boolean;
  policy: CompressionPolicy;
  isLoading: boolean;
}

function parseEnabled(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true; // default ON
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const s = raw.replace(/^"|"$/g, '').toLowerCase();
    return s !== 'false' && s !== '0' && s !== 'disabled';
  }
  return true;
}

function parsePolicy(raw: unknown): CompressionPolicy {
  if (!raw) return { ...DEFAULT_COMPRESSION_POLICY };
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === 'object') obj = raw as Record<string, unknown>;
  else if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      obj = null;
    }
  }
  const merged: CompressionPolicy = { ...DEFAULT_COMPRESSION_POLICY };
  if (obj) {
    for (const key of Object.keys(merged) as (keyof CompressionPolicy)[]) {
      const v = obj[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        (merged[key] as number) = v;
      }
    }
  }
  // Clamp to safe ranges.
  merged.quality = Math.min(0.95, Math.max(0.6, merged.quality));
  merged.severeQuality = Math.min(0.98, Math.max(merged.quality, merged.severeQuality));
  merged.maxSizeMB = Math.min(20, Math.max(0.2, merged.maxSizeMB));
  merged.maxWidthOrHeight = Math.min(8000, Math.max(800, merged.maxWidthOrHeight));
  return merged;
}

export function useImageCompressionSettings(): ImageCompressionSettings {
  const enabledQ = useSystemSetting('image_compression_enabled');
  const policyQ = useSystemSetting('image_compression_policy');

  return useMemo(
    () => ({
      enabled: parseEnabled(enabledQ.data?.setting_value),
      policy: parsePolicy(policyQ.data?.setting_value),
      isLoading: enabledQ.isLoading || policyQ.isLoading,
    }),
    [enabledQ.data?.setting_value, policyQ.data?.setting_value, enabledQ.isLoading, policyQ.isLoading],
  );
}
