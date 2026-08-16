/**
 * Console → Dashboard parity smoke test (POLICY §CONSOLE-DASHBOARD-PARITY).
 *
 * Proves that the frontend can reach the backend and that a change made through
 * a Performance Console write RPC is exactly the change the employee/reviewer
 * scorecard reads back — for numeric, binary and tiered KPIs.
 *
 * Run:   bun scripts/consoleDashboardParity.ts [period] [year]
 * Undo:  bun scripts/consoleDashboardParity.ts --restore <kpiId> <value|null>
 * Auth:  reads the minted session written by `lovable auth-session --json`.
 *
 * Every write is reverted to the byte-identical original value in the same run
 * (null stays null). Rows carrying a final_score are never touched (POLICY §88).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveKpiScoringModel } from '../src/lib/kpiScoringModel';

const URL = process.env.VITE_SUPABASE_URL!;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const TYPES = ['numeric', 'binary', 'tiered'] as const;
type Row = Record<string, any>;

function mintedSession() {
  return JSON.parse(readFileSync(join(homedir(), '.cache/lovable-auth/session.json'), 'utf8'));
}

async function signedInClient(): Promise<SupabaseClient> {
  const minted = mintedSession();
  const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await supabase.auth.setSession({
    access_token: minted.session.access_token,
    refresh_token: minted.session.refresh_token,
  });
  if (error) throw new Error(`auth failed: ${error.message}`);
  return supabase;
}

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** null-safe equality for numeric-ish columns coming back as strings. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Number(a) === Number(b);
}

async function restore(kpiId: string, raw: string) {
  const supabase = await signedInClient();
  const value = raw === 'null' ? null : Number(raw);
  const { data, error } = await supabase.rpc('bu_console_row_override', {
    p_kpi_id: kpiId, p_changes: { target_value: value },
  });
  console.log(error ? `FAIL ${error.message}` : `restored ${kpiId} -> ${JSON.stringify(data)}`);
  process.exit(error ? 1 : 0);
}

async function main() {
  const period = process.argv[2] ?? 'August';
  const year = Number(process.argv[3] ?? 2026);
  const supabase = await signedInClient();

  const { data: userData } = await supabase.auth.getUser();
  check('frontend → backend auth', !!userData.user, userData.user?.id ?? 'no user');
  const uid = userData.user!.id;

  // --- 1. capability RPCs ---------------------------------------------------
  const [{ data: canRead }, { data: canWrite }] = await Promise.all([
    supabase.rpc('bu_console_can_read', { _uid: uid }),
    supabase.rpc('bu_console_can_write', { _uid: uid }),
  ]);
  check('bu_console_can_read', canRead === true, String(canRead));
  check('bu_console_can_write', canWrite === true, String(canWrite));

  // --- 2. console tree loads over the Data API ------------------------------
  const { data: tree, error: treeErr } = await supabase.rpc('bu_console_tree', {
    p_period: period, p_year: year,
  });
  const categories = (tree as Row | null)?.categories as Row[] | undefined;
  check('bu_console_tree', !treeErr && (tree as Row)?.authorized !== false && !!categories?.length,
    treeErr?.message ?? `${categories?.length ?? 0} categories`);

  // --- 3. per KPI type ------------------------------------------------------
  for (const type of TYPES) {
    // Only rows on active employees, still at kra_set (tuning is scope-only and
    // refused once the review has moved on — POLICY §CONSOLE-WRITE-TIERS).
    const { data: candidates, error: candErr } = await supabase
      .from('kpis')
      .select('id, kpi_name, kpi_title, kra_name, category_id, employee_id, uom_type, qualitative_options, target_value, weightage, r0, r1, r2, r3, r4, r5, status, profiles!inner(is_active)')
      .eq('review_period', period).eq('review_year', year)
      .eq('uom_type', type).eq('status', 'kra_set')
      .eq('profiles.is_active', true)
      .limit(25);
    if (candErr || !candidates?.length) {
      check(`${type}: candidate row`, false, candErr?.message ?? 'none found');
      continue;
    }

    const ids = candidates.map(c => c.id);
    const { data: subs } = await supabase
      .from('review_submissions').select('kpi_id, final_score').in('kpi_id', ids);
    const locked = new Set((subs ?? []).filter(s => s.final_score != null).map(s => s.kpi_id));
    const kpi = candidates.find(c => !locked.has(c.id)) as Row | undefined;
    if (!kpi) { check(`${type}: unlocked candidate`, false, 'all finalised'); continue; }

    // console read of the same KPI the dashboard row belongs to
    const { data: detail, error: detErr } = await supabase.rpc('bu_console_kpi_detail', {
      p_category_id: kpi.category_id, p_kra_name: kpi.kra_name, p_kpi_name: kpi.kpi_name,
      p_period: period, p_year: year, p_page: 1, p_page_size: 200,
    });
    const rows = ((detail as Row | null)?.rows ?? []) as Row[];
    const group = (detail as Row | null)?.group as Row | undefined;
    const consoleRow = rows.find(r => r.kpi_id === kpi.id) ?? rows[0] ?? null;
    check(`${type}: console detail read`, !detErr && !!consoleRow,
      detErr?.message ?? `${rows.length} rows in group`);

    // scoring model parity: console payload vs dashboard row
    const dashModel = resolveKpiScoringModel(kpi as any);
    const consoleModel = resolveKpiScoringModel({
      uom_type: group?.uom_type ?? consoleRow?.uom_type ?? kpi.uom_type,
      qualitative_options: group?.qualitative_options ?? consoleRow?.qualitative_options ?? kpi.qualitative_options,
      r0: consoleRow?.r0 ?? kpi.r0, r1: consoleRow?.r1 ?? kpi.r1, r2: consoleRow?.r2 ?? kpi.r2,
      r3: consoleRow?.r3 ?? kpi.r3, r4: consoleRow?.r4 ?? kpi.r4, r5: consoleRow?.r5 ?? kpi.r5,
    } as any);
    check(`${type}: scoring model parity`,
      consoleModel.uomType === dashModel.uomType && consoleModel.type === dashModel.type,
      `console=${consoleModel.uomType}/${consoleModel.type} dashboard=${dashModel.uomType}/${dashModel.type}`);

    // --- write through the console, read back on the dashboard path ---------
    const before = kpi.target_value;                     // may legitimately be null
    const probe = Number(before ?? 0) + 7;
    const { data: wrote, error: wErr } = await supabase.rpc('bu_console_row_override', {
      p_kpi_id: kpi.id, p_changes: { target_value: probe },
    });
    if (wErr) { check(`${type}: console write`, false, wErr.message); continue; }
    check(`${type}: console write`, (wrote as Row)?.updated === 1, JSON.stringify(wrote));

    const { data: afterRow } = await supabase
      .from('kpis').select('target_value').eq('id', kpi.id).maybeSingle();
    check(`${type}: dashboard sees console change`, sameValue(afterRow?.target_value, probe),
      `expected ${probe}, dashboard read ${afterRow?.target_value}`);

    // revert to the byte-identical original (null stays null)
    const { error: rErr } = await supabase.rpc('bu_console_row_override', {
      p_kpi_id: kpi.id, p_changes: { target_value: before ?? null },
    });
    const { data: restored } = await supabase
      .from('kpis').select('target_value').eq('id', kpi.id).maybeSingle();
    check(`${type}: restored original target`, !rErr && sameValue(restored?.target_value, before),
      `${restored?.target_value} (was ${before})`);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] === '--restore') restore(process.argv[3], process.argv[4]);
else main().catch(e => { console.error(e); process.exit(1); });
