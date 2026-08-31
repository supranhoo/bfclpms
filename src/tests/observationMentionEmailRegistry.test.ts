import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * POLICY §OBS-MENTION-EMAIL / registry parity.
 *
 * `observation_mention` notifications already reach the email bridge, but the
 * email function only sends event types that an admin has enabled — and an event
 * can only be enabled if it appears in the Notification Events list. Missing
 * admin-list entries silently skipped every mention email. This test locks the
 * parity: the event must exist in the type union, the events list, the template
 * registry and the edge-function defaults.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('observation_mention email registry parity', () => {
  it('is a valid EmailEventType', () => {
    expect(read('src/hooks/useEmailNotificationSettings.ts')).toMatch(/'observation_mention'/);
  });

  it('is listed in Notification Events', () => {
    const body = read('src/components/admin/EmailNotificationSettings.tsx');
    expect(body).toMatch(/key:\s*'observation_mention'/);
  });

  it('has an editable email template', () => {
    const body = read('src/components/admin/EmailTemplateEditor.tsx');
    expect(body).toMatch(/key:\s*'observation_mention'/);
    expect(body).toMatch(/\{\{observation_title\}\}/);
  });

  it('has a readable label in Email Logs', () => {
    expect(read('src/pages/admin/EmailLogs.tsx')).toMatch(/observation_mention:/);
  });

  it('has a default subject/body in the email edge function', () => {
    const body = read('supabase/functions/send-email-notification/index.ts');
    expect(body).toMatch(/observation_mention:\s*\{/);
  });

  it('is mapped by the notification-to-email bridge', () => {
    const body = read(
      'supabase/migrations/20260728113325_65ded797-f4eb-4b1c-b47c-0a4bb9ee25af.sql',
    );
    expect(body).toMatch(/WHEN 'observation_mention' THEN mapped_event_type := 'observation_mention'/);
  });
});
