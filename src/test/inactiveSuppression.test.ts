import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function latestMigrationContaining(needle: string): string {
  const dir = resolve(__dirname, '../../supabase/migrations');
  const file = readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .reverse()
    .find((n) => readFileSync(resolve(dir, n), 'utf8').includes(needle));
  if (!file) throw new Error(`migration containing "${needle}" not found`);
  return readFileSync(resolve(dir, file), 'utf8');
}

describe('ADR-241 — inactive employee suppression', () => {
  const sql = latestMigrationContaining('notification_recipient_is_active');

  it('adds a recipient-activity helper pinned to public search_path', () => {
    expect(sql).toMatch(/FUNCTION public\.notification_recipient_is_active\(p_user_id uuid\)/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public'/);
    expect(sql).toContain('p.is_active = false');
  });

  it('silently skips notifications for inactive recipients instead of raising', () => {
    expect(sql).toContain('BEFORE INSERT ON public.notifications');
    expect(sql).toContain('block_notifications_for_inactive_recipient');
    expect(sql).not.toMatch(/RAISE EXCEPTION[^;]*inactive/i);
  });

  it('fails client inserts fast via the RLS policy', () => {
    expect(sql).toMatch(/WITH CHECK \([\s\S]*notification_recipient_is_active\(user_id\)/);
    expect(sql).toMatch(/can_send_notification_to\(auth\.uid\(\), user_id\)/);
  });

  it('gates password resets on an active account with throttling', () => {
    expect(sql).toMatch(/FUNCTION public\.password_reset_allowed\(p_email text/);
    expect(sql).toContain('public.auth_lookup_attempts');
    expect(sql).toContain('p.is_active = true');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.password_reset_allowed(text, text) FROM PUBLIC');
  });
});

describe('ADR-241 — application-layer guards', () => {
  const authPage = readFileSync(resolve(__dirname, '../pages/Auth.tsx'), 'utf8');
  const resetFn = readFileSync(resolve(__dirname, '../../supabase/functions/reset-password/index.ts'), 'utf8');
  const emailFn = readFileSync(
    resolve(__dirname, '../../supabase/functions/send-email-notification/index.ts'),
    'utf8',
  );

  it('checks the gate before requesting a recovery mail and keeps the UI identical', () => {
    const gateIdx = authPage.indexOf("password_reset_allowed");
    const sendIdx = authPage.indexOf('resetPasswordForEmail');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(sendIdx);
    expect(authPage).toMatch(/allowed !== true[\s\S]*setForgotPasswordSuccess\(true\)/);
  });

  it('blocks the admin reset paths for inactive employees', () => {
    expect(resetFn).toContain("select('id, is_active')");
    expect((resetFn.match(/is_active === false/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(resetFn).toContain('Employee is inactive');
  });

  it('skips outbound email for inactive recipients', () => {
    expect(emailFn).toContain("reason: 'recipient_inactive'");
    expect(emailFn).toMatch(/recipientProfile[\s\S]*is_active === false/);
  });
});
