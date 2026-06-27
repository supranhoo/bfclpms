import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Phase 9.2.d — production backup health smoke test.
//
// Silent-regression alarm: if scheduled backups start failing again with the
// HTTP 546 signature, CI goes red the next time tests run rather than the
// problem being discovered manually from Backup History.
//
// Skipped automatically in environments without service-role access (local
// dev, contributor PRs), so it never blocks unit-test runs. CI lanes that
// inject the env vars (TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_ROLE_KEY)
// get the live check.

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);
const d = enabled ? describe : describe.skip;

d('backup_logs health (production smoke)', () => {
  const supabase = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it('no HTTP 546 finalize failures in the last 24h', async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('backup_logs')
      .select('id, created_at, status, error_message')
      .gte('created_at', since)
      .ilike('error_message', '%HTTP 546%');
    expect(error).toBeNull();
    expect(
      data ?? [],
      'HTTP 546 finalize-OOM regression detected — see DOCUMENTATION.md WP-9.2.d',
    ).toEqual([]);
  });

  it('majority of the last 7 scheduled runs succeeded', async () => {
    const { data, error } = await supabase
      .from('backup_logs')
      .select('status, created_at')
      .eq('backup_type', 'scheduled')
      .order('created_at', { ascending: false })
      .limit(7);
    expect(error).toBeNull();
    const rows = data ?? [];
    if (rows.length === 0) return; // fresh project — nothing to assert
    const ok = rows.filter((r) =>
      r.status === 'completed' || r.status === 'completed_with_errors',
    ).length;
    expect(
      ok,
      `expected >=5/7 recent scheduled backups healthy, got ${ok}/${rows.length}`,
    ).toBeGreaterThanOrEqual(Math.min(5, rows.length));
  });
});