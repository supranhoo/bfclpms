import { describe, it, expect } from 'vitest';
import { parseBoolSetting, unwrapSettingString } from '@/hooks/useBrandingSettings';

describe('useBrandingSettings helpers', () => {
  describe('unwrapSettingString', () => {
    it('strips JSON quotes', () => {
      expect(unwrapSettingString('"ACME"')).toBe('ACME');
    });
    it('returns empty string for null/undefined', () => {
      expect(unwrapSettingString(null)).toBe('');
      expect(unwrapSettingString(undefined)).toBe('');
    });
    it('returns plain strings as-is (trimmed)', () => {
      expect(unwrapSettingString('  Hello  ')).toBe('Hello');
    });
  });

  describe('parseBoolSetting', () => {
    it('parses bool-as-string variants', () => {
      expect(parseBoolSetting('true')).toBe(true);
      expect(parseBoolSetting('"true"')).toBe(true);
      expect(parseBoolSetting('false')).toBe(false);
      expect(parseBoolSetting('"false"')).toBe(false);
    });
    it('honours real booleans', () => {
      expect(parseBoolSetting(true)).toBe(true);
      expect(parseBoolSetting(false)).toBe(false);
    });
    it('falls back to default for missing/garbage values', () => {
      expect(parseBoolSetting(null, true)).toBe(true);
      expect(parseBoolSetting(undefined, false)).toBe(false);
      expect(parseBoolSetting('garbage', true)).toBe(true);
    });
  });
});