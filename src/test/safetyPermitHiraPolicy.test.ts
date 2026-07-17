import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(__dirname, '../../supabase/migrations');

function latestHiraWritePolicy(): string {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(resolve(migrationsDir, file), 'utf8'))
    .reverse()
    .find((sql) => sql.includes('CREATE POLICY permit_hira_write')) ?? '';
}

describe('Safety permit HIRA requester write lock', () => {
  const sql = latestHiraWritePolicy();

  it('allows requester writes only while the parent permit is draft', () => {
    expect(sql).toContain("p.requested_by = auth.uid() AND p.status = 'draft'");
  });

  it('preserves admin and safety-head oversight', () => {
    expect(sql).toContain("'admin'::safety_app_role");
    expect(sql).toContain("'safety_head'::safety_app_role");
  });

  it('applies the same parent-permit rule before and after writes', () => {
    expect(sql.match(/p\.status = 'draft'/g)).toHaveLength(2);
    expect(sql).toMatch(/USING \([\s\S]+WITH CHECK \(/);
  });
});