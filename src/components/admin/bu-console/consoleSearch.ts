/**
 * ADR-336 — Performance Console unified search (tree side).
 *
 * The console tree is already fully loaded client-side by `bu_console_tree`
 * (one read per applied scope), so KPI / KRA / category search is a pure
 * projection over that payload — no extra round trip, no new RPC parameter.
 * People search is a different problem (server-paged) and lives in
 * `KpiPeopleStrip` / `bu_console_run_snapshot`.
 *
 * Rules:
 *  - a category name hit keeps the whole category;
 *  - a KRA name hit keeps that KRA with all of its KPIs;
 *  - otherwise only the KPIs whose title / legacy name / description / variant
 *    names match survive, and empty KRAs and categories are dropped.
 *
 * Counts on the surviving nodes are recomputed so the strip and header never
 * advertise rows that the filter has hidden.
 */
import type {
  BuConsoleCategoryNode,
  BuConsoleKpiNode,
  BuConsoleKraNode,
} from '@/hooks/useBuConsole';

export interface ConsoleTreeSearchResult {
  categories: BuConsoleCategoryNode[];
  /** True when a non-empty query was applied. */
  active: boolean;
  /** Distinct KPI rows kept by the filter. */
  matchedKpis: number;
  /** Distinct KRAs kept by the filter. */
  matchedKras: number;
  /** First surviving category / KRA — used to auto-open the best hit. */
  firstCategoryId: string | null;
  firstKraKey: string | null;
}

export function normalizeSearch(query: string | null | undefined): string {
  return (query ?? '').trim().toLowerCase();
}

/** Case-insensitive "contains", NULL-safe. */
export function textMatches(text: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return (text ?? '').toLowerCase().includes(needle);
}

function kpiMatches(kpi: BuConsoleKpiNode, needle: string): boolean {
  if (
    textMatches(kpi.kpi_title, needle) ||
    textMatches(kpi.kpi_name, needle) ||
    textMatches(kpi.kpi_description, needle)
  ) {
    return true;
  }
  return (kpi.variants ?? []).some(
    v => textMatches(v.kpi_name, needle) || (v.kpi_names ?? []).some(n => textMatches(n, needle)),
  );
}

function filterKra(kra: BuConsoleKraNode, needle: string): BuConsoleKraNode | null {
  if (textMatches(kra.kra_name, needle)) return kra;
  const kpis = kra.kpis.filter(k => kpiMatches(k, needle));
  if (kpis.length === 0) return null;
  return { ...kra, kpis, kpi_count: kpis.length };
}

export function filterConsoleTree(
  categories: BuConsoleCategoryNode[] | null | undefined,
  query: string | null | undefined,
): ConsoleTreeSearchResult {
  const list = categories ?? [];
  const needle = normalizeSearch(query);

  if (!needle) {
    return {
      categories: list,
      active: false,
      matchedKpis: list.reduce((n, c) => n + (c.kpi_count ?? 0), 0),
      matchedKras: list.reduce((n, c) => n + (c.kra_count ?? 0), 0),
      firstCategoryId: list[0]?.category_id ?? null,
      firstKraKey: list[0]?.kras?.[0]?.kra_key ?? null,
    };
  }

  const kept: BuConsoleCategoryNode[] = [];
  for (const category of list) {
    const categoryHit = textMatches(category.category_name, needle);
    const kras = categoryHit
      ? category.kras
      : (category.kras.map(k => filterKra(k, needle)).filter(Boolean) as BuConsoleKraNode[]);
    if (kras.length === 0) continue;
    const kpiCount = kras.reduce((n, k) => n + k.kpis.length, 0);
    kept.push({ ...category, kras, kra_count: kras.length, kpi_count: kpiCount });
  }

  return {
    categories: kept,
    active: true,
    matchedKpis: kept.reduce((n, c) => n + c.kpi_count, 0),
    matchedKras: kept.reduce((n, c) => n + c.kra_count, 0),
    firstCategoryId: kept[0]?.category_id ?? null,
    firstKraKey: kept[0]?.kras?.[0]?.kra_key ?? null,
  };
}
