import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression: observation emails were rendering "N/A" for Observation title,
 * Type, Description and Reply because `public.send_email_on_notification`
 * only forwarded these fields nested inside `metadata`, while the
 * `send-email-notification` edge function destructures them at the top level
 * of the request body.
 *
 * This test pins the DB-side fix: the latest migration touching that function
 * MUST lift the four observation keys out of `NEW.metadata` into the
 * top-level `net.http_post` body.
 */
describe('send_email_on_notification observation payload', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../supabase/migrations/20260706080545_f0204bb8-fc33-4721-bd40-392b2ae7fb40.sql',
    ),
    'utf8',
  );

  it.each([
    'observation_title',
    'observation_type',
    'observation_description',
    'reply_content',
  ])('forwards %s as a top-level body key', (key) => {
    expect(sql).toMatch(
      new RegExp(`'${key}',\\s*NEW\\.metadata->>'${key}'`),
    );
  });
});