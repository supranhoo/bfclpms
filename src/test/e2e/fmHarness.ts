/**
 * ADR-194 §WF-STAGE-SSOT — shared harness for the Functional Manager (F1)
 * end-to-end suite.
 *
 * Provides an in-memory store that behaves like the real backend for the
 * narrow slice the F1 flow touches (profiles + review_submissions), including
 * *column projection*: a `select()` that omits a column genuinely does not
 * return it. That is what makes the read-back regression (ADR-194) reproducible
 * in a test instead of only in production.
 *
 * No production data is ever touched by this harness.
 */

import type {
  ResolverProfile,
  ResolverContext,
} from '@/lib/workflowResolver';

export const F1_TEMPLATE_STAGES = [
  'kra_set',
  'self_review',
  'manager_check',
  'functional_manager_check',
  'audit',
  'approved',
];

export const NON_F1_TEMPLATE_STAGES = [
  'kra_set',
  'self_review',
  'manager_check',
  'audit',
  'approved',
];

export const IDS = {
  employee: 'emp-102028',
  manager: 'mgr-100001',
  functionalManager: 'fm-200271',
  auditor: 'aud-300001',
} as const;

export interface ProfileRow extends ResolverProfile {
  group_doj: string | null;
  doj: string | null;
  confirmation_date: string | null;
  location_id: string | null;
  employee_category: string | null;
  employment_status: string | null;
  mobile_number: string | null;
}

export interface SubmissionRow {
  id: string;
  kpi_id: string;
  self_score: number | null;
  manager_score: number | null;
  functional_manager_score: number | null;
  skip_level_score: number | null;
  hr_pms_score: number | null;
  auditor_score: number | null;
  management_score: number | null;
  final_score: number | null;
  is_na: boolean;
}

export interface KpiRow {
  id: string;
  employee_id: string;
  kra_name: string;
  kpi_name: string;
  status: string;
  weightage: number;
}

function makeProfile(
  id: string,
  name: string,
  code: string,
  overrides: Partial<ProfileRow> = {},
): ProfileRow {
  return {
    id,
    full_name: name,
    email: `${code}@example.test`,
    employee_code: code,
    pms_grade: 'M3',
    department_id: 'dept-1',
    reporting_manager_id: null,
    functional_manager_id: null,
    is_active: true,
    group_doj: null,
    doj: '2020-01-01',
    confirmation_date: null,
    location_id: 'loc-1',
    employee_category: 'staff',
    employment_status: 'confirmed',
    mobile_number: null,
    ...overrides,
  };
}

export interface FmStore {
  profiles: ProfileRow[];
  kpis: KpiRow[];
  review_submissions: SubmissionRow[];
}

/** Fresh store per test — no cross-test bleed. */
export function createStore(): FmStore {
  return {
    profiles: [
      makeProfile(IDS.employee, 'Brundaban Chandra Das', '102028', {
        reporting_manager_id: IDS.manager,
        functional_manager_id: null, // deliberately unmapped at t0
      }),
      makeProfile(IDS.manager, 'Ravi Kumar', '100001'),
      makeProfile(IDS.functionalManager, 'V.A.V.S.S. Ganapathi Varma', '200271'),
      makeProfile(IDS.auditor, 'Shekhar Sharad', '300001'),
    ],
    kpis: [
      {
        id: 'kpi-1',
        employee_id: IDS.employee,
        kra_name: 'Operations',
        kpi_name: 'Plant uptime',
        status: 'self_review',
        weightage: 60,
      },
      {
        id: 'kpi-2',
        employee_id: IDS.employee,
        kra_name: 'Safety',
        kpi_name: 'Control dust emission',
        status: 'self_review',
        weightage: 40,
      },
    ],
    review_submissions: [
      {
        id: 'sub-1',
        kpi_id: 'kpi-1',
        self_score: null,
        manager_score: null,
        functional_manager_score: null,
        skip_level_score: null,
        hr_pms_score: null,
        auditor_score: null,
        management_score: null,
        final_score: null,
        is_na: false,
      },
      {
        id: 'sub-2',
        kpi_id: 'kpi-2',
        self_score: null,
        manager_score: null,
        functional_manager_score: null,
        skip_level_score: null,
        hr_pms_score: null,
        auditor_score: null,
        management_score: null,
        final_score: null,
        is_na: false,
      },
    ],
  };
}

/** Parse a PostgREST projection string into a column list. */
export function parseSelect(sel: string): string[] {
  return sel
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

type Row = Record<string, unknown>;

/**
 * Minimal Supabase-shaped client over the store.
 * Supports: .from(t).select(cols).eq(c, v).maybeSingle() and
 *           .from(t).update(patch).eq(c, v)
 * Projection is enforced, so an omitted column is genuinely absent.
 */
export function createFakeSupabase(store: FmStore) {
  const table = (name: string): Row[] =>
    (store as unknown as Record<string, Row[]>)[name];

  return {
    from(name: string) {
      const rows = table(name);
      return {
        select(sel = '*') {
          const cols = sel === '*' ? null : parseSelect(sel);
          const filters: Array<[string, unknown]> = [];
          const api = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return api;
            },
            project() {
              const matched = rows.filter((r) =>
                filters.every(([c, v]) => r[c] === v),
              );
              return matched.map((r) => {
                if (!cols) return { ...r };
                const out: Row = {};
                for (const c of cols) out[c] = r[c];
                return out;
              });
            },
            async maybeSingle() {
              const res = api.project();
              return { data: res[0] ?? null, error: null };
            },
            then(resolve: (v: { data: Row[]; error: null }) => unknown) {
              return Promise.resolve({ data: api.project(), error: null }).then(
                resolve,
              );
            },
          };
          return api;
        },
        update(patch: Row) {
          const filters: Array<[string, unknown]> = [];
          const api = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return api;
            },
            async then(resolve: (v: { data: null; error: null }) => unknown) {
              const matched = rows.filter((r) =>
                filters.every(([c, v]) => r[c] === v),
              );
              for (const r of matched) Object.assign(r, patch);
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
          return api;
        },
      };
    },
  };
}

/** Resolver context built from the (possibly mutated) store. */
export function buildResolverContext(store: FmStore): ResolverContext {
  const profilesById = new Map<string, ResolverProfile>();
  for (const p of store.profiles) {
    if (p.is_active) profilesById.set(p.id, p);
  }
  const usersByRole = new Map<string, ResolverProfile[]>();
  usersByRole.set('auditor', [profilesById.get(IDS.auditor)!]);
  return { profilesById, usersByRole };
}

export function getProfile(store: FmStore, id: string): ProfileRow {
  const p = store.profiles.find((r) => r.id === id);
  if (!p) throw new Error(`profile ${id} missing from store`);
  return p;
}

export function getSubmission(store: FmStore, kpiId: string): SubmissionRow {
  const s = store.review_submissions.find((r) => r.kpi_id === kpiId);
  if (!s) throw new Error(`submission for ${kpiId} missing from store`);
  return s;
}
