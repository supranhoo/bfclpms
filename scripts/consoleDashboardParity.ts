/**
 * Console → Dashboard parity smoke test (POLICY §CONSOLE-DASHBOARD-PARITY).
 *
 * Proves that the frontend can reach the backend and that a change made through
 * a Performance Console write RPC is the same change the employee/reviewer
 * scorecard reads back — for numeric, binary and tiered KPIs.
 *
 * Run:  bun scripts/consoleDashboardParity.ts [period] [year]
 * Auth: reads the minted session written by `lovable auth-session --json`.
 *
 * Every write is reverted in the same run. Rows carrying a final_score are
 * never touched (POLICY §88).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { resolveKpiScoringModel } from '../src/lib/kpiScoringModel';

const URL = process.env.VITE_SUPABASE_URL!;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const PERIOD = process.argv[2] ?? 'August';
const YEAR = Number(process.argv[3] ?? 2026);

const TYPES = ['numeric', 'binary', 'tiered'] as const;
type Row = Record<string, any>;

function session() {
  const p = join(homedir(), '.cache/lovable-auth/session.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

const results: Array<Record<string, string>> = [];
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  results.push({ check: label, result: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const minted = session();
  const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error: authErr } = await supabase.auth.setSession({
    access_token: minted.session.access_token,
    refresh_token: minted.session.refresh_token,
  });
  if (authErr) throw new Error(`auth failed: ${authErr.message}`);
  const { data: userData } = await supabase.auth.getUser();
  check('frontend → backend auth', !!userData.user, userData.user?.id ?? 'no user');

  // --- 1. connectivity: read + write capability RPCs ------------------------
  const uid = userData.user!.id;
  const [{ data: canRead }, { data: canWrite }] = await Promise.all([
    supabase.rpc('bu_console_can_read', { _uid: uid }),
    supabase.rpc('bu_console_can_write', { _uid: uid }),
  ]);
  check('bu_console_can_read', canRead === true, String(canRead));
  check('bu_console_can_write', canWrite === true, String(canWrite));

  // --- 2. console tree loads over the Data API ------------------------------
  const { data: tree, error: treeErr } = await supabase.rpc('bu_console_tree', {
    p_period: PERIOD, p_year: YEAR,
  });
  check('bu_console_tree', !treeErr && Array.isArray(tree) && tree.length > 0,
    treeErr?.message ?? `${(tree as Row[] | null)?.length ?? 0} rows`);

  // --- 3. per KPI type: console read == dashboard read, write propagates ----
  for (const type of TYPES) {
    const { data: candidates, error: candErr } = await supabase
      .from('kpis')
      .select('id, kpi_name, kra_name, category_id, employee_id, uom_type, qualitative_options, target_value, weightage, r0, r1, r2, r3, r4, r5, status')
      .eq('review_period', PERIOD).eq('review_year', YEAR)
      .eq('uom_type', type).limit(25);
    if (candErr || !candidates?.length) {
      check(`${type}: candidate row`, false, candErr?.message ?? 'none found');
      continue;
    }

    // exclude rows whose review is finalised (POLICY §88)
    const ids = candidates.map(c => c.id);
    const { data: subs } = await supabase
      .from('review_submissions')
      .select('kpi_id, final_score').in('kpi_id', ids);
    const locked = new Set((subs ?? []).filter(s => s.final_score != null).map(s => s.kpi_id));
    const kpi = candidates.find(c => !locked.has(c.id));
    if (!kpi) { check(`${type}: unlocked candidate`, false, 'all finalised'); continue; }

    // console read
    const { data: detail, error: detErr } = await supabase.rpc('bu_console_kpi_detail', {
      p_category_id: kpi.category_id, p_kra_name: kpi.kra_name, p_kpi_name: kpi.kpi_name,
      p_period: PERIOD, p_year: YEAR,
    });
    const consoleRow = (detail as Row[] | null)?.[0] ?? null;
    check(`${type}: console detail read`, !detErr && !!consoleRow, detErr?.message ?? kpi.kpi_name);

    // scoring model parity (console payload vs dashboard row)
    const dashModel = resolveKpiScoringModel(kpi as any);
    const consoleModel = resolveKpiScoringModel({
      uom_type: consoleRow?.uom_type ?? kpi.uom_type,
      qualitative_options: consoleRow?.qualitative_options ?? kpi.qualitative_options,
      r0: consoleRow?.r0, r1: consoleRow?.r1, r2: consoleRow?.r2,
      r3: consoleRow?.r3, r4: consoleRow?.r4, r5: consoleRow?.r5,
    } as any);
    check(`${type}: scoring model parity`,
      consoleModel.uomType === dashModel.uomType,
      `console=${consoleModel.uomType}/${consoleModel.type} dashboard=${dashModel.uomType}/${dashModel.type}`);

    // --- write through the console, read back on the dashboard path --------
    const before = Number(kpi.target_value ?? 0);
    const probe = before + 7;
    const { data: wrote, error: wErr } = await supabase.rpc('bu_console_row_override', {
      p_kpi_id: kpi.id, p_changes: { target_value: probe },
    });
    if (wErr) { check(`${type}: console write`, false, wErr.message); continue; }
    check(`${type}: console write`, true, JSON.stringify(wrote));

    const { data: afterRow } = await supabase
      .from('kpis').select('target_value').eq('id', kpi.id).maybeSingle();
    check(`${type}: dashboard sees console change`,
      Number(afterRow?.target_value) === probe,
      `expected ${probe}, dashboard read ${afterRow?.target_value}`);

    // revert
    const { error: rErr } = await supabase.rpc('bu_console_row_override', {
      p_kpi_id: kpi.id, p_changes: { target_value: before },
    });
    const { data: restored } = await supabase
      .from('kpis').select('target_value').eq('id', kpi.id).maybeSingle();
    check(`${type}: restored original target`,
      !rErr && Number(restored?.target_value) === before,
      `${restored?.target_value} (was ${before})`);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
