import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, ScanSearch, CheckCircle2, Search } from 'lucide-react';
import { useScanDuplicates, useBuildRegistry, DuplicateGroup } from '@/hooks/useKpiRegistry';
import { useToast } from '@/hooks/use-toast';

interface Props {
  onRegistryUpdated: () => void;
}

export function BuildRegistryTab({ onRegistryUpdated }: Props) {
  const { groups, loading: scanning, scan } = useScanDuplicates();
  const { createDefinitionWithAliases, saving } = useBuildRegistry();
  const [search, setSearch] = useState('');
  const [selections, setSelections] = useState<Record<string, number>>({});
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
    const canonical = group.variants[selectedIdx];
    if (!canonical) return;

    const defId = await createDefinitionWithAliases(
      canonical.kra_name,
      canonical.kpi_name,
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
                onValueChange={v => setSelections(prev => ({ ...prev, [key]: Number(v) }))}
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
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>

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