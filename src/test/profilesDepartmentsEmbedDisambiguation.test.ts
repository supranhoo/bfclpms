import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard for the "Could not embed because more than one relationship
 * was found for 'profiles' and 'departments'" PostgREST error.
 *
 * Background: `public.departments` has FKs back into `public.profiles`
 * (head_user_id, head_updated_by) in addition to `profiles.department_id ->
 * departments.id`. Any implicit `departments(...)` embed reached through the
 * `profiles` table is ambiguous and throws at runtime (regression first hit by
 * Sandeep on the Incentive Report, 2026-06-23).
 *
 * Rule (POLICY §EMBED-FK-HINT): every `departments(` embed inside a select()
 * string in src/hooks, src/pages, src/components and src/services MUST be
 * hinted with the explicit `!profiles_department_fk` constraint name UNLESS
 * it is embedded from a single-FK parent (sub_branches, template_bundles,
 * incentive_programs).
 */

const ROOTS = ['src/hooks', 'src/pages', 'src/components', 'src/services'];
const ALLOWED_PARENTS = [
  'sub_branches',
  'template_bundles',
  'incentive_programs',
  'incentive_slabs',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

describe('PostgREST profiles→departments embed disambiguation', () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8');
      // Find every `departments(` or `departments (` not already hinted with
      // !profiles_department_fk.
      const re = /(?<!profiles_department_fk)\bdepartments\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        // Look backwards within the surrounding ~200 chars for a parent table
        // hint that whitelists this embed.
        const ctx = src.slice(Math.max(0, m.index - 400), m.index);
        if (ALLOWED_PARENTS.some((t) => ctx.includes(`from('${t}')`) || ctx.includes(`from("${t}")`))) {
          continue;
        }
        offenders.push(`${file}: …${src.slice(m.index, m.index + 60)}…`);
      }
    }
  }

  it('rejects any unhinted departments() embed reachable through profiles', () => {
    expect(offenders, `Ambiguous embeds found:\n${offenders.join('\n')}`).toEqual([]);
  });
});