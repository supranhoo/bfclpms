// Generates SQL inserts for dev_report_entries from genuine project artefacts.
// Sources: CHANGELOG_2026.md, docs/adr/ADR-*.md, supabase/migrations/*.sql
// Floor: 2026-02-01. Idempotent: relies on unique index uq_dev_report_entries_ingest_key.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FLOOR = "2026-02-01";
type Row = {
  entry_type: "feature" | "bug" | "timeline";
  entry_date: string;
  title: string;
  description: string;
  module_area: string | null;
  status: string | null;
  severity: string | null;
  timeline_type: string | null;
  adr_refs: string[];
  linked_commit: string | null;
};
const rows: Row[] = [];
const seen = new Set<string>();
const key = (r: Row) =>
  `${r.entry_type}|${r.entry_date}|${r.linked_commit ?? ""}|${r.title}`;
const add = (r: Row) => {
  if (r.entry_date < FLOOR) return;
  const k = key(r);
  if (seen.has(k)) return;
  seen.add(k);
  rows.push(r);
};

const moduleFromText = (s: string): string | null => {
  const m = s.toLowerCase();
  for (const tag of [
    "safety", "incentive", "increment", "annual-review", "annual review",
    "review", "admin", "audit", "kpi", "workflow", "backup", "menu",
    "auth", "pip", "tni", "org kpi", "report", "pms", "rls",
  ]) if (m.includes(tag)) return tag.replace(/[- ]/g, " ");
  return null;
};

// ---- 1) Migrations -----------------------------------------------------
const migDir = "supabase/migrations";
for (const f of readdirSync(migDir).sort()) {
  if (!f.endsWith(".sql")) continue;
  const ts = f.slice(0, 8);
  if (!/^\d{8}$/.test(ts)) continue;
  const date = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  if (date < FLOOR) continue;
  const body = readFileSync(join(migDir, f), "utf8");
  const slug = f.replace(/^\d+_/, "").replace(/_[a-f0-9-]{36}\.sql$/, "").replace(/\.sql$/, "").replace(/[-_]+/g, " ").trim();
  const firstComment = (body.match(/^\s*--\s*(.+)$/m)?.[1] ?? "").slice(0, 180);
  const tables = [...body.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)].map((m) => m[1]);
  const funcs = [...body.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi)].map((m) => m[1]);
  const policies = (body.match(/CREATE\s+POLICY/gi) ?? []).length;
  const title = slug || `Migration ${f}`;
  const descParts: string[] = [];
  if (tables.length) descParts.push(`Tables: ${[...new Set(tables)].join(", ")}`);
  if (funcs.length) descParts.push(`Functions: ${[...new Set(funcs)].slice(0, 8).join(", ")}`);
  if (policies) descParts.push(`Policies: ${policies}`);
  if (firstComment) descParts.push(firstComment);
  add({
    entry_type: "timeline",
    entry_date: date,
    title: title.slice(0, 200),
    description: descParts.join(" · ") || `Migration ${f}`,
    module_area: moduleFromText(slug + " " + firstComment),
    status: null, severity: null,
    timeline_type: "migration",
    adr_refs: [], linked_commit: f,
  });
  // Surface new tables as features
  for (const t of [...new Set(tables)]) {
    add({
      entry_type: "feature",
      entry_date: date,
      title: `New table: ${t}`,
      description: `Created public.${t}${firstComment ? " — " + firstComment : ""}`,
      module_area: moduleFromText(t),
      status: "Shipped",
      severity: null, timeline_type: null,
      adr_refs: [], linked_commit: `${f}#${t}`,
    });
  }
}

// ---- 2) ADRs -----------------------------------------------------------
const adrDir = "docs/adr";
for (const f of readdirSync(adrDir).sort()) {
  if (!/^ADR-\d+\.md$/i.test(f)) continue;
  const body = readFileSync(join(adrDir, f), "utf8");
  const id = f.replace(/\.md$/i, "");
  const h1 = body.match(/^#\s+(.+)$/m)?.[1] ?? id;
  const date = body.match(/##\s*Date\s*\n\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1];
  if (!date) continue;
  if (date < FLOOR) continue;
  const decision = body.match(/##\s*Decision\s*\n+([^#]+)/i)?.[1]?.trim().split("\n").filter(Boolean).slice(0, 4).join(" ").slice(0, 400) ?? "";
  add({
    entry_type: "timeline",
    entry_date: date,
    title: h1.slice(0, 200),
    description: decision || `Architecture Decision Record ${id}`,
    module_area: moduleFromText(h1),
    status: null, severity: null,
    timeline_type: "adr",
    adr_refs: [id], linked_commit: id,
  });
}

// ---- 3) CHANGELOG_2026.md ---------------------------------------------
const cl = readFileSync("CHANGELOG_2026.md", "utf8");
const sections = cl.split(/\n(?=##\s+\d{4}-\d{2}-\d{2})/);
for (const sec of sections) {
  const head = sec.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*[—-]\s*(.+)$/m);
  if (!head) continue;
  const date = head[1]; const titleRaw = head[2].trim();
  if (date < FLOOR) continue;
  const lower = titleRaw.toLowerCase();
  let entry_type: Row["entry_type"] = "timeline";
  let severity: string | null = null;
  let status: string | null = null;
  let timeline_type: string | null = "release";
  if (/\bbug\b|\bhotfix\b|\bfix\b|\bregression\b|\brca\b/i.test(titleRaw)) {
    entry_type = "bug";
    if (/critical/i.test(titleRaw)) severity = "Critical";
    else if (/high|major/i.test(titleRaw)) severity = "High";
    timeline_type = null;
  } else if (/shipped|added|new|feature|implement|enable|launch/i.test(lower)) {
    entry_type = "feature"; status = "Shipped"; timeline_type = null;
  }
  // first non-empty bullet as description
  const firstBullet = sec.split("\n").map((l) => l.trim()).find((l) => l.startsWith("- "))?.replace(/^-\s+\*\*[^*]+\*\*:?\s*/, "").slice(0, 600) ?? "";
  add({
    entry_type, entry_date: date,
    title: titleRaw.slice(0, 200),
    description: firstBullet || titleRaw,
    module_area: moduleFromText(titleRaw),
    status, severity, timeline_type,
    adr_refs: [...titleRaw.matchAll(/ADR-\d+/g)].map((m) => m[0]),
    linked_commit: `CHANGELOG_2026.md#${date}`,
  });
}

// ---- Output SQL --------------------------------------------------------
const esc = (s: string) => s.replace(/'/g, "''");
const arr = (a: string[]) => `ARRAY[${a.map((x) => `'${esc(x)}'`).join(",")}]::text[]`;
const lines = rows.map((r) =>
  `(${["'" + r.entry_type + "'",
    "'" + r.entry_date + "'::date",
    "'" + esc(r.title) + "'",
    "'" + esc(r.description) + "'",
    r.module_area ? "'" + esc(r.module_area) + "'" : "NULL",
    r.status ? "'" + esc(r.status) + "'" : "NULL",
    r.severity ? "'" + esc(r.severity) + "'" : "NULL",
    r.timeline_type ? "'" + esc(r.timeline_type) + "'" : "NULL",
    r.adr_refs.length ? arr(r.adr_refs) : "ARRAY[]::text[]",
    r.linked_commit ? "'" + esc(r.linked_commit) + "'" : "NULL",
    "NULL"].join(",")})`
);
const sql =
`-- generated by scripts/devReportReseed.ts — DO NOT EDIT BY HAND
INSERT INTO public.dev_report_entries
  (entry_type, entry_date, title, description, module_area, status, severity, timeline_type, adr_refs, linked_commit, created_by)
VALUES
${lines.join(",\n")}
ON CONFLICT DO NOTHING;
`;
writeFileSync("/tmp/dev_report_reseed.sql", sql);
console.log(`Rows: ${rows.length}`);
const byType: Record<string, number> = {};
const byMonth: Record<string, number> = {};
for (const r of rows) {
  byType[r.entry_type] = (byType[r.entry_type] ?? 0) + 1;
  byMonth[r.entry_date.slice(0, 7)] = (byMonth[r.entry_date.slice(0, 7)] ?? 0) + 1;
}
console.log("By type:", byType);
console.log("By month:", byMonth);
console.log(`SQL bytes: ${sql.length}`);
