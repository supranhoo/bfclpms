// Edge function: backfill-employee-master
// Admin-gated, insert-only reconciliation tool that recovers employees
// historically dropped by the import pipeline.
//
// Modes:
//   - dry_run: reconcile candidates vs profiles by normalized employee_code.
//              Returns { existing, to_insert, conflicts } — NO writes.
//   - commit:  insert the rows in to_insert (batched, per-row try/catch).
//              Existing rows are NEVER touched.
//
// Auth: shared requireAdminUser pattern (validates JWT + admin role).

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CandidateRow {
  row_number: number;
  employee_code: string;
  full_name: string;
  email?: string | null;
  designation?: string | null;
  department?: string | null;
  business_unit?: string | null;
  level?: string | null;
  pms_grade?: string | null;
  location?: string | null;
  company?: string | null;
  reporting_manager_code?: string | null;
  mobile_number?: string | null;
}

interface ReconciledRow extends CandidateRow {
  normalized_code: string;
  status: 'existing' | 'to_insert' | 'conflict';
  conflict_reason?: string;
  resolved: {
    department_id: string | null;
    company_id: string | null;
    location_id: string | null;
    reporting_manager_id: string | null;
    unresolved: string[]; // master fields that did not match
  };
}

const norm = (v?: string | null) => (v ?? '').toString().trim().toUpperCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── Auth: validate user + admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: roleCheck } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse body
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) {
      return new Response(JSON.stringify({ error: 'Body must be { mode, rows: CandidateRow[] }' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const mode: 'dry_run' | 'commit' = body.mode === 'commit' ? 'commit' : 'dry_run';
    const rows: CandidateRow[] = body.rows;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No rows provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (rows.length > 5000) {
      return new Response(JSON.stringify({ error: 'Too many rows; split into batches of ≤5000' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Load masters once
    const [profilesRes, departmentsRes, companiesRes] = await Promise.all([
      admin.from('profiles').select('id, employee_code, full_name'),
      admin.from('departments').select('id, name, code'),
      admin.from('companies').select('id, name, code'),
    ]);

    if (profilesRes.error) throw profilesRes.error;

    const profileByCode = new Map<string, { id: string; full_name: string | null }>();
    for (const p of profilesRes.data ?? []) {
      if (p.employee_code) profileByCode.set(norm(p.employee_code), { id: p.id, full_name: p.full_name });
    }
    const deptByKey = new Map<string, string>();
    for (const d of departmentsRes.data ?? []) {
      if (d.name) deptByKey.set(norm(d.name), d.id);
      if (d.code) deptByKey.set(norm(d.code), d.id);
    }
    const compByKey = new Map<string, string>();
    for (const c of companiesRes.data ?? []) {
      if (c.name) compByKey.set(norm(c.name), c.id);
      if (c.code) compByKey.set(norm(c.code), c.id);
    }

    // location_id is optional in schema and master may not exist on every project — try, ignore if absent
    const locByKey = new Map<string, string>();
    try {
      const locRes = await admin.from('locations' as any).select('id, name, code');
      if (!locRes.error && Array.isArray(locRes.data)) {
        for (const l of locRes.data) {
          if (l.name) locByKey.set(norm(l.name), l.id);
          if (l.code) locByKey.set(norm(l.code), l.id);
        }
      }
    } catch (_) { /* no locations table — ignore */ }

    // ── Reconcile
    const reconciled: ReconciledRow[] = [];
    const seenInBatch = new Set<string>();
    for (const r of rows) {
      const code = norm(r.employee_code);
      if (!code) {
        reconciled.push({
          ...r,
          normalized_code: '',
          status: 'conflict',
          conflict_reason: 'Missing employee_code',
          resolved: { department_id: null, company_id: null, location_id: null, reporting_manager_id: null, unresolved: ['employee_code'] },
        });
        continue;
      }
      if (!r.full_name?.trim()) {
        reconciled.push({
          ...r,
          normalized_code: code,
          status: 'conflict',
          conflict_reason: 'Missing full_name',
          resolved: { department_id: null, company_id: null, location_id: null, reporting_manager_id: null, unresolved: ['full_name'] },
        });
        continue;
      }
      if (profileByCode.has(code)) {
        reconciled.push({
          ...r,
          normalized_code: code,
          status: 'existing',
          resolved: { department_id: null, company_id: null, location_id: null, reporting_manager_id: null, unresolved: [] },
        });
        continue;
      }
      if (seenInBatch.has(code)) {
        reconciled.push({
          ...r,
          normalized_code: code,
          status: 'conflict',
          conflict_reason: 'Duplicate employee_code in upload',
          resolved: { department_id: null, company_id: null, location_id: null, reporting_manager_id: null, unresolved: [] },
        });
        continue;
      }
      seenInBatch.add(code);

      const unresolved: string[] = [];
      const dept_id = r.department ? deptByKey.get(norm(r.department)) ?? null : null;
      if (r.department && !dept_id) unresolved.push(`department:${r.department}`);

      const comp_id = r.company ? compByKey.get(norm(r.company)) ?? null : null;
      if (r.company && !comp_id) unresolved.push(`company:${r.company}`);

      const loc_id = r.location ? locByKey.get(norm(r.location)) ?? null : null;
      if (r.location && !loc_id) unresolved.push(`location:${r.location}`);

      const mgr_id = r.reporting_manager_code
        ? profileByCode.get(norm(r.reporting_manager_code))?.id ?? null
        : null;
      if (r.reporting_manager_code && !mgr_id) unresolved.push(`manager:${r.reporting_manager_code}`);

      reconciled.push({
        ...r,
        normalized_code: code,
        status: 'to_insert',
        resolved: { department_id: dept_id, company_id: comp_id, location_id: loc_id, reporting_manager_id: mgr_id, unresolved },
      });
    }

    const summary = {
      total: reconciled.length,
      existing: reconciled.filter(r => r.status === 'existing').length,
      to_insert: reconciled.filter(r => r.status === 'to_insert').length,
      conflicts: reconciled.filter(r => r.status === 'conflict').length,
    };

    // ── Dry run: return reconciliation only
    if (mode === 'dry_run') {
      return new Response(JSON.stringify({ mode, summary, rows: reconciled }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Commit: insert "to_insert" rows in batches with per-row try/catch
    const toInsert = reconciled.filter(r => r.status === 'to_insert');
    let inserted = 0;
    let failed = 0;
    const failures: { row_number: number; employee_code: string; error: string }[] = [];
    const insertedRows: ReconciledRow[] = [];

    const BATCH = 100;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH);
      // Insert one-by-one inside the batch so a single failure doesn't poison the whole batch
      await Promise.all(slice.map(async (r) => {
        try {
          const id = crypto.randomUUID();
          const { error } = await admin.from('profiles').insert({
            id,
            employee_code: r.employee_code.trim(),
            full_name: r.full_name.trim(),
            email: r.email?.trim() || null,
            designation: r.designation?.trim() || null,
            department_id: r.resolved.department_id,
            company_id: r.resolved.company_id,
            location_id: r.resolved.location_id,
            reporting_manager_id: r.resolved.reporting_manager_id,
            level: r.level?.trim() || null,
            pms_grade: r.pms_grade?.trim() || null,
            mobile_number: r.mobile_number?.trim() || null,
            portal_access: false, // backfill = profile-only; admin can flip later via User Mgmt
            is_active: true,
          });
          if (error) {
            failed++;
            failures.push({ row_number: r.row_number, employee_code: r.employee_code, error: error.message });
          } else {
            // Default role = employee (so role checks elsewhere don't crash)
            await admin.from('user_roles').insert({ user_id: id, role: 'employee' }).then(() => {}, () => {});
            inserted++;
            insertedRows.push(r);
          }
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          failures.push({ row_number: r.row_number, employee_code: r.employee_code, error: msg });
        }
      }));
    }

    return new Response(JSON.stringify({
      mode,
      summary: { ...summary, inserted, failed },
      failures,
      inserted_rows: insertedRows.map(r => ({ employee_code: r.employee_code, full_name: r.full_name })),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[backfill-employee-master] fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
