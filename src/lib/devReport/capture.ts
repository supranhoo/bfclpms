/**
 * ADR-246 / POLICY §131 — Development Report auto-capture (SSOT parser).
 *
 * Pure, filesystem-free parsing of genuine project artefacts into
 * `dev_report_entries` rows. Used by BOTH the build-time Vite capture plugin
 * (which feeds it repo files) and `scripts/devReportReseed.ts`, so the two can
 * never drift apart.
 *
 * Genuine-entry rule: every row MUST carry a `linked_commit` that traces back
 * to a concrete artefact (migration filename, ADR id, or CHANGELOG anchor).
 */

export const DEV_REPORT_FLOOR = '2026-02-01';

export type DevReportRowType = 'feature' | 'bug' | 'timeline';

export interface DevReportCaptureRow {
  entry_type: DevReportRowType;
  entry_date: string;
  title: string;
  description: string;
  /** ADR-249 — Why it was built (problem / context). NULL when no genuine source. */
  rationale: string | null;
  /** ADR-249 — How it is used (who / where / what it enables). NULL when no genuine source. */
  usage_notes: string | null;
  module_area: string | null;
  status: string | null;
  severity: string | null;
  timeline_type: string | null;
  adr_refs: string[];
  linked_commit: string;
}

export interface CaptureFile {
  /** File name only, e.g. `20260615120000_abc.sql` or `ADR-246.md`. */
  file: string;
  body: string;
}

export interface CaptureSources {
  migrations?: CaptureFile[];
  adrs?: CaptureFile[];
  changelog?: string;
}

const MODULE_TAGS = [
  'safety', 'incentive', 'increment', 'annual-review', 'annual review',
  'review', 'admin', 'audit', 'kpi', 'workflow', 'backup', 'menu',
  'auth', 'pip', 'tni', 'org kpi', 'report', 'pms', 'rls',
];

export function moduleFromText(s: string): string | null {
  const m = s.toLowerCase();
  for (const tag of MODULE_TAGS) {
    if (m.includes(tag)) return tag.replace(/[- ]/g, ' ');
  }
  return null;
}

/** Stable dedupe key — mirrors `uq_dev_report_entries_ingest_key`. */
export function captureKey(r: DevReportCaptureRow): string {
  return `${r.entry_type}|${r.entry_date}|${r.linked_commit}|${r.title}`;
}

function dateFromMigrationFile(file: string): string | null {
  const ts = file.slice(0, 8);
  if (!/^\d{8}$/.test(ts)) return null;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/** Extract a markdown `## Section` body (text until the next heading). */
export function markdownSection(body: string, name: string): string | null {
  const re = new RegExp(`##\\s*${name}\\s*\\n+([^#]+)`, 'i');
  const raw = body.match(re)?.[1]?.trim();
  if (!raw) return null;
  const text = raw
    .split('\n')
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 600) : null;
}

/** Pull a labelled changelog bullet, e.g. `- **Why:** ...`. */
export function labelledBullet(section: string, labels: string[]): string | null {
  for (const line of section.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('- ')) continue;
    const m = l.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)$/);
    if (!m) continue;
    const key = m[1].replace(/:$/, '').trim().toLowerCase();
    if (labels.some((x) => key === x.toLowerCase())) {
      const val = m[2].trim();
      if (val) return val.slice(0, 600);
    }
  }
  return null;
}

function migrationRows(f: CaptureFile): DevReportCaptureRow[] {
  const date = dateFromMigrationFile(f.file);
  if (!date) return [];
  const body = f.body;
  let slug = f.file
    .replace(/^\d+_/, '')
    .replace(/_?[a-f0-9-]{36}\.sql$/, '')
    .replace(/\.sql$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (/^[0-9a-f ]{8,}$/i.test(slug)) slug = '';
  const firstComment = (body.match(/^\s*--\s*(.+)$/m)?.[1] ?? '').slice(0, 180);
  const tables = [
    ...body.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi),
  ].map((m) => m[1]);
  const funcs = [
    ...body.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi),
  ].map((m) => m[1]);
  const policies = (body.match(/CREATE\s+POLICY/gi) ?? []).length;
  const tablesUniq = [...new Set(tables)];
  const funcsUniq = [...new Set(funcs)];
  const title =
    slug ||
    (firstComment ? firstComment.slice(0, 120) : '') ||
    (tablesUniq.length ? `Schema: ${tablesUniq.slice(0, 3).join(', ')}` : '') ||
    (funcsUniq.length ? `Function: ${funcsUniq.slice(0, 3).join(', ')}` : '') ||
    `Migration ${date}`;
  const descParts: string[] = [];
  if (tablesUniq.length) descParts.push(`Tables: ${tablesUniq.join(', ')}`);
  if (funcsUniq.length) descParts.push(`Functions: ${funcsUniq.slice(0, 8).join(', ')}`);
  if (policies) descParts.push(`Policies: ${policies}`);
  if (firstComment) descParts.push(firstComment);
  const adrRefs = [...new Set([...body.matchAll(/ADR-\d+/g)].map((m) => m[0]))].slice(0, 6);
  const migrationUsage = tablesUniq.length
    ? `Backs app features reading/writing ${tablesUniq
        .slice(0, 3)
        .map((t) => `public.${t}`)
        .join(', ')}${policies ? ` under ${policies} access ${policies === 1 ? 'policy' : 'policies'}` : ''}.`
    : funcsUniq.length
      ? `Called by the app / edge functions via ${funcsUniq.slice(0, 3).join(', ')}.`
      : null;

  const rows: DevReportCaptureRow[] = [
    {
      entry_type: 'timeline',
      entry_date: date,
      title: title.slice(0, 200),
      description: descParts.join(' · ') || `Migration ${f.file}`,
      rationale: firstComment || null,
      usage_notes: migrationUsage,
      module_area: moduleFromText(`${slug} ${firstComment}`),
      status: null,
      severity: null,
      timeline_type: 'migration',
      adr_refs: adrRefs,
      linked_commit: f.file,
    },
  ];
  for (const t of tablesUniq) {
    rows.push({
      entry_type: 'feature',
      entry_date: date,
      title: `New table: ${t}`,
      description: `Created public.${t}${firstComment ? ' — ' + firstComment : ''}`,
      rationale: firstComment || null,
      usage_notes: `Stores the ${t.replace(/_/g, ' ')} records the app reads and writes${
        policies ? `, protected by ${policies} access ${policies === 1 ? 'policy' : 'policies'}` : ''
      }.`,
      module_area: moduleFromText(t),
      status: 'Shipped',
      severity: null,
      timeline_type: null,
      adr_refs: adrRefs,
      linked_commit: `${f.file}#${t}`,
    });
  }
  return rows;
}

function adrRow(f: CaptureFile): DevReportCaptureRow | null {
  if (!/^ADR-\d+\.md$/i.test(f.file)) return null;
  const id = f.file.replace(/\.md$/i, '');
  const h1 = f.body.match(/^#\s+(.+)$/m)?.[1] ?? id;
  const date = f.body.match(/##\s*Date\s*\n\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1];
  if (!date) return null;
  const decision =
    f.body
      .match(/##\s*Decision\s*\n+([^#]+)/i)?.[1]
      ?.trim()
      .split('\n')
      .filter(Boolean)
      .slice(0, 4)
      .join(' ')
      .slice(0, 400) ?? '';
  const context = markdownSection(f.body, 'Context') ?? markdownSection(f.body, 'Problem');
  const consequences =
    markdownSection(f.body, 'Consequences') ?? markdownSection(f.body, 'Usage');
  return {
    entry_type: 'timeline',
    entry_date: date,
    title: h1.slice(0, 200),
    description: decision || `Architecture Decision Record ${id}`,
    rationale: context,
    usage_notes: consequences,
    module_area: moduleFromText(h1),
    status: null,
    severity: null,
    timeline_type: 'adr',
    adr_refs: [id],
    linked_commit: id,
  };
}

function changelogRows(changelog: string): DevReportCaptureRow[] {
  const rows: DevReportCaptureRow[] = [];
  const sections = changelog.split(/\n(?=##\s+\d{4}-\d{2}-\d{2})/);
  for (const sec of sections) {
    const head = sec.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*[—-]\s*(.+)$/m);
    if (!head) continue;
    const date = head[1];
    const titleRaw = head[2].trim();
    const lower = titleRaw.toLowerCase();
    let entry_type: DevReportRowType = 'timeline';
    let severity: string | null = null;
    let status: string | null = null;
    let timeline_type: string | null = 'release';
    if (/\bbug\b|\bhotfix\b|\bfix\b|\bregression\b|\brca\b/i.test(titleRaw)) {
      entry_type = 'bug';
      if (/critical/i.test(titleRaw)) severity = 'Critical';
      else if (/high|major/i.test(titleRaw)) severity = 'High';
      timeline_type = null;
    } else if (/shipped|added|new|feature|implement|enable|launch/i.test(lower)) {
      entry_type = 'feature';
      status = 'Shipped';
      timeline_type = null;
    }
    const firstBullet =
      sec
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('- '))
        ?.replace(/^-\s+\*\*[^*]+\*\*:?\s*/, '')
        .slice(0, 600) ?? '';
    const why = labelledBullet(sec, ['Why', 'Problem', 'Root cause', 'RCA', 'Context']);
    const how = labelledBullet(sec, ['How', 'Usage', 'Impact', 'Who', 'Where']);
    rows.push({
      entry_type,
      entry_date: date,
      title: titleRaw.slice(0, 200),
      description: firstBullet || titleRaw,
      rationale: why,
      usage_notes: how,
      module_area: moduleFromText(titleRaw),
      status,
      severity,
      timeline_type,
      adr_refs: [...titleRaw.matchAll(/ADR-\d+/g)].map((m) => m[0]),
      linked_commit: `CHANGELOG_2026.md#${date}`,
    });
  }
  return rows;
}

/**
 * Builds the full, deduplicated, floor-filtered row set from repo artefacts.
 * Sorted by date DESC so callers can slice the newest work first.
 */
export function buildDevReportRows(
  sources: CaptureSources,
  opts: { floor?: string } = {},
): DevReportCaptureRow[] {
  const floor = opts.floor ?? DEV_REPORT_FLOOR;
  const seen = new Set<string>();
  const out: DevReportCaptureRow[] = [];
  const push = (r: DevReportCaptureRow | null) => {
    if (!r) return;
    if (r.entry_date < floor) return;
    const k = captureKey(r);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(r);
  };

  for (const f of sources.migrations ?? []) migrationRows(f).forEach(push);
  for (const f of sources.adrs ?? []) push(adrRow(f));
  if (sources.changelog) changelogRows(sources.changelog).forEach(push);

  out.sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0));
  return out;
}

/** Newest artefact date in a captured set, or null when empty. */
export function newestCaptureDate(rows: DevReportCaptureRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) if (!max || r.entry_date > max) max = r.entry_date;
  return max;
}