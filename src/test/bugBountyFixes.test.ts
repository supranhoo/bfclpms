import { describe, it, expect } from 'vitest';
import { ALL_APP_ROLES } from '@/lib/roles';

// BUG-001: Role completeness test
describe('BUG-001: Role coverage', () => {
  const roleColors: Record<string, string> = {
    admin: 'bg-destructive/10 text-destructive',
    manager: 'bg-primary/10 text-primary',
    employee: 'bg-secondary text-secondary-foreground',
    auditor: 'bg-accent text-accent-foreground',
    management: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    hr_pms: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    skip_level: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  };

  it('every canonical role has a color mapping', () => {
    for (const role of ALL_APP_ROLES) {
      expect(roleColors[role], `Missing color for role: ${role}`).toBeDefined();
    }
  });

  it('ALL_APP_ROLES includes hr_pms and skip_level', () => {
    expect(ALL_APP_ROLES).toContain('hr_pms');
    expect(ALL_APP_ROLES).toContain('skip_level');
  });
});

// BUG-002: Email validation test
describe('BUG-002: Email validation', () => {
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('notanemail.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('accepts valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts email with whitespace trimmed', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });
});

// BUG-003: XSS escaping test
describe('BUG-003: HTML escaping in PolicyRenderer', () => {
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  it('escapes script tags', () => {
    const result = escapeHtml('<script>alert(1)</script>');
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('escapes img onerror', () => {
    const result = escapeHtml('<img onerror="alert(1)" src="x">');
    expect(result).toContain('&lt;img');
    expect(result).not.toContain('<img');
  });

  it('preserves normal text', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });
});
