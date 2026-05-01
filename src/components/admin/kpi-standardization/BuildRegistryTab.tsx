import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, ScanSearch, CheckCircle2, Search, Eye, Pencil } from 'lucide-react';
import { useScanDuplicates, useBuildRegistry, DuplicateGroup } from '@/hooks/useKpiRegistry';
import { useToast } from '@/hooks/use-toast';
import { AffectedKpisTable } from './AffectedKpisTable';

interface Props {
  onRegistryUpdated: () => void;
}

export function BuildRegistryTab({ onRegistryUpdated }: Props) {
  const { groups, loading: scanning, scan } = useScanDuplicates();
  const { createDefinitionWithAliases, saving } = useBuildRegistry();
  const [search, setSearch] = useState('');
  const [selections, setSelections] = useState<Record<string, number>>({});
  // Per-group canonical text overrides. Keyed by groupKey.
  const [canonicalOverrides, setCanonicalOverrides] = useState<Record<string, { kra: string; kpi: string }>>({});
  const [editingCanonical, setEditingCanonical] = useState<Record<string, boolean>>({});
  const [drillIn, setDrillIn] = useState<Record<string, number | null>>({});
  const [processedGroups, setProcessedGroups] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const s = search.toLowerCase();
    return groups.filter(g =>
      g.normalized_kpi.includes(s) ||
      g.category_name?.toLowerCase().includes(s) ||
      g.variants.some(v => v.kra_name.toLowerCase().includes(s))
    );
  }, [groups, search]);

  const pendingGroups = filteredGroups.filter(g => !processedGroups.has(groupKey(g)));

  const handleApprove = async (group: DuplicateGroup) => {
    const key = groupKey(group);
    const selectedIdx = selections[key] ?? 0;
    const baseCanonical = group.variants[selectedIdx];
    if (!baseCanonical) return;
    const override = canonicalOverrides[key];
    const canonicalKra = (override?.kra ?? baseCanonical.kra_name).trim();
    const canonicalKpi = (override?.kpi ?? baseCanonical.kpi_name).trim();
    if (!canonicalKra || !canonicalKpi) {
      toast({ title: 'Canonical KRA and KPI are required', variant: 'destructive' });
      return;
    }

    const defId = await createDefinitionWithAliases(
      canonicalKra,
      canonicalKpi,
      group.category_id,
      group.variants.map(v => ({ kra_name: v.kra_name, kpi_name: v.kpi_name }))
    );

    if (defId) {
      setProcessedGroups(prev => new Set([...prev, key]));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5" />
            Duplicate Scanner
          </CardTitle>
          <CardDescription>
            Scan all KPIs to find groups where the same KPI appears under different KRA names.
            Pick the canonical version for each group to create a registry entry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button onClick={scan} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanSearch className="h-4 w-4 mr-2" />}
              {groups.length > 0 ? 'Re-scan' : 'Scan for Duplicates'}
            </Button>
            {groups.length > 0 && (
              <Badge variant="secondary">
                {pendingGroups.length} pending / {groups.length} total groups
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {groups.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by KPI name, KRA name, or category..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {pendingGroups.map((group) => {
        const key = groupKey(group);
        const selectedIdx = selections[key] ?? 0;
        const override = canonicalOverrides[key];
        const isEditing = !!editingCanonical[key];
        const canonical = group.variants[selectedIdx];
        const canonicalKra = override?.kra ?? canonical?.kra_name ?? '';
        const canonicalKpi = override?.kpi ?? canonical?.kpi_name ?? '';
        const drillIdx = drillIn[key];

        return (
          <Card key={key} className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">
                    {group.normalized_kpi.slice(0, 100)}...
                  </CardTitle>
                  <Badge variant="outline" className="mt-1">{group.category_name}</Badge>
                </div>
                <Badge variant="destructive">{group.variants.length} variants</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <RadioGroup
                value={String(selectedIdx)}
                onValueChange={v => {
                  setSelections(prev => ({ ...prev, [key]: Number(v) }));
                  // reset override when user switches base variant
                  setCanonicalOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });
                  setEditingCanonical(prev => ({ ...prev, [key]: false }));
                }}
              >
                {group.variants.map((variant, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                    <RadioGroupItem value={String(idx)} id={`${key}-${idx}`} className="mt-1" />
                    <Label htmlFor={`${key}-${idx}`} className="flex-1 cursor-pointer">
                      <div className="font-medium text-sm">{variant.kra_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {variant.kpi_name.slice(0, 150)}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{variant.employee_count} employees</Badge>
                        <Badge variant="outline" className="text-xs">{variant.row_count} rows</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            setDrillIn(prev => ({ ...prev, [key]: prev[key] === idx ? null : idx }));
                          }}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          {drillIdx === idx ? 'Hide' : 'View'} KPIs
                        </Button>
                      </div>
                      {drillIdx === idx && (
                        <div className="mt-2">
                          <AffectedKpisTable
                            categoryId={group.category_id}
                            kraName={variant.kra_name}
                            kpiName={variant.kpi_name}
                          />
                        </div>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium">Canonical name (will be saved to registry)</div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => setEditingCanonical(prev => ({ ...prev, [key]: !isEditing }))}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    {isEditing ? 'Use selected variant' : 'Edit canonical'}
                  </Button>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={canonicalKra}
                      onChange={e => setCanonicalOverrides(prev => ({ ...prev, [key]: { kra: e.target.value, kpi: prev[key]?.kpi ?? canonicalKpi } }))}
                      placeholder="Canonical KRA name"
                      className="text-sm"
                    />
                    <Textarea
                      value={canonicalKpi}
                      onChange={e => setCanonicalOverrides(prev => ({ ...prev, [key]: { kpi: e.target.value, kra: prev[key]?.kra ?? canonicalKra } }))}
                      placeholder="Canonical KPI name"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                ) : (
                  <div className="text-xs">
                    <div className="font-medium">{canonicalKra}</div>
                    <div className="text-muted-foreground line-clamp-2">{canonicalKpi}</div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={() => handleApprove(group)}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Approve as Canonical
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {groups.length > 0 && pendingGroups.length === 0 && (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="font-medium">All duplicate groups processed!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Switch to the Review Registry tab to see all canonical entries.
            </p>
            <Button variant="outline" className="mt-3" onClick={onRegistryUpdated}>
              Go to Review Registry
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function groupKey(g: DuplicateGroup): string {
  return `${g.category_id}::${g.normalized_kpi}`;
}