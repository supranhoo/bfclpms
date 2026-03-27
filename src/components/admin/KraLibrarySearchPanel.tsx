import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import { Search, FolderOpen, ChevronRight, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiEntry {
  id: string;
  kpi_name: string;
  kra_name: string;
  category_id: string;
  uom?: string | null;
  weightage?: number | null;
  frequency?: string | null;
  isTemplate: boolean;
}

interface CategoryGroup {
  id: string;
  name: string;
  color: string | null;
  kras: Map<string, KpiEntry[]>;
}

interface KraLibrarySearchPanelProps {
  templates: any[] | undefined;
  allKpis: any[] | undefined;
  categories: { id: string; name: string; color: string | null; weightage: number }[] | undefined;
  onSelectKpi: (categoryId: string, kraName: string, kpiName: string) => void;
}

export function KraLibrarySearchPanel({
  templates,
  allKpis,
  categories,
  onSelectKpi,
}: KraLibrarySearchPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedKras, setExpandedKras] = useState<Set<string>>(new Set());

  // Build merged searchable data
  const allEntries = useMemo(() => {
    const entries: KpiEntry[] = [];
    const seen = new Set<string>();

    // Templates first (priority)
    (templates || []).forEach(t => {
      if (!t.is_active || !t.category_id) return;
      const key = `${t.category_id}||${t.kra_name}||${t.kpi_name}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({
          id: t.id,
          kpi_name: t.kpi_name,
          kra_name: t.kra_name,
          category_id: t.category_id,
          uom: t.uom,
          weightage: t.weightage,
          frequency: t.frequency,
          isTemplate: true,
        });
      }
    });

    // Existing KPIs (fill gaps)
    (allKpis || []).forEach(k => {
      if (!k.category_id) return;
      const key = `${k.category_id}||${k.kra_name}||${k.kpi_name}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({
          id: k.id,
          kpi_name: k.kpi_name,
          kra_name: k.kra_name,
          category_id: k.category_id,
          uom: k.uom,
          weightage: k.weightage,
          frequency: k.frequency,
          isTemplate: false,
        });
      }
    });

    return entries;
  }, [templates, allKpis]);

  // Filter and group by search term
  const groupedResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (term.length < 2) return null;

    const catMap = new Map<string, CategoryGroup>();

    const filtered = allEntries.filter(e => {
      const catName = categories?.find(c => c.id === e.category_id)?.name || '';
      return (
        e.kpi_name.toLowerCase().includes(term) ||
        e.kra_name.toLowerCase().includes(term) ||
        catName.toLowerCase().includes(term)
      );
    });

    filtered.forEach(entry => {
      const cat = categories?.find(c => c.id === entry.category_id);
      if (!cat) return;

      if (!catMap.has(cat.id)) {
        catMap.set(cat.id, { id: cat.id, name: cat.name, color: cat.color, kras: new Map() });
      }
      const group = catMap.get(cat.id)!;
      if (!group.kras.has(entry.kra_name)) {
        group.kras.set(entry.kra_name, []);
      }
      group.kras.get(entry.kra_name)!.push(entry);
    });

    return catMap;
  }, [searchTerm, allEntries, categories]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const toggleKra = (key: string) => {
    setExpandedKras(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSelectKpi = (catId: string, kraName: string, kpiName: string) => {
    onSelectKpi(catId, kraName, kpiName);
    setSearchTerm('');
  };

  const hasResults = groupedResults && groupedResults.size > 0;
  const showPanel = searchTerm.trim().length >= 2;

  // Auto-expand all when searching
  useMemo(() => {
    if (groupedResults) {
      setExpandedCategories(new Set(groupedResults.keys()));
      const kraKeys = new Set<string>();
      groupedResults.forEach((group, catId) => {
        group.kras.forEach((_, kraName) => kraKeys.add(`${catId}-${kraName}`));
      });
      setExpandedKras(kraKeys);
    }
  }, [groupedResults]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Search KRA Library
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Type keyword to search categories, KRAs, KPIs..."
          className="pl-9"
        />
      </div>

      {showPanel && (
        <div className="rounded-md border bg-muted/30">
          <div className="max-h-[400px] overflow-y-auto pr-2">
            {!hasResults ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No matches found — create manually below
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {Array.from(groupedResults!.entries()).map(([catId, group]) => {
                  const catExpanded = expandedCategories.has(catId);

                  return (
                    <div key={catId} className="space-y-0.5">
                      {/* Category Row */}
                      <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent/50 cursor-pointer group">
                        <button
                          type="button"
                          onClick={() => toggleCategory(catId)}
                          className="shrink-0"
                        >
                          {catExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: group.color || 'hsl(var(--primary))' }}
                          />
                          <span className="text-sm font-medium truncate">{group.name}</span>
                        </div>
                        <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">
                          {group.kras.size} KRA{group.kras.size !== 1 ? 's' : ''}
                        </Badge>
                      </div>

                      {/* KRA Rows */}
                      {catExpanded && Array.from(group.kras.entries()).map(([kraName, kpis]) => {
                        const kraKey = `${catId}-${kraName}`;
                        const kraExpanded = expandedKras.has(kraKey);

                        return (
                          <div key={kraKey} className="pl-6 space-y-0.5">
                            <div className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50 cursor-pointer">
                              <button
                                type="button"
                                onClick={() => toggleKra(kraKey)}
                                className="shrink-0"
                              >
                                {kraExpanded ? (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                              <span className="text-sm text-foreground truncate">
                                <span className="text-muted-foreground text-xs mr-1">KRA:</span>
                                {kraName}
                              </span>
                              <Badge variant="outline" className="ml-auto text-[10px] shrink-0">
                                {kpis.length} KPI{kpis.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>

                            {/* KPI Rows */}
                            {kraExpanded && kpis.map(kpi => (
                              <div
                                key={kpi.id}
                                className="flex items-center gap-2 rounded-sm px-2 py-1 pl-8 hover:bg-accent/50 cursor-pointer"
                              >
                                <Checkbox
                                  checked={selectedId === `kpi-${catId}-${kraName}-${kpi.kpi_name}`}
                                  onCheckedChange={() => handleSelectKpi(catId, kraName, kpi.kpi_name)}
                                  className="shrink-0"
                                />
                                <span className="text-sm truncate flex-1">
                                  <span className="text-muted-foreground text-xs mr-1">KPI:</span>
                                  {kpi.kpi_name}
                                </span>
                                {kpi.isTemplate && (
                                  <Badge variant="secondary" className="text-[10px] shrink-0">Template</Badge>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-primary hover:text-primary shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectKpi(catId, kraName, kpi.kpi_name);
                                  }}
                                >
                                  Apply
                                </Button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
