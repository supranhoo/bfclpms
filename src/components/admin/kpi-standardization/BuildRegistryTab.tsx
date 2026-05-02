import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Loader2, ScanSearch, CheckCircle2, Search, Eye, Pencil, Ban, RotateCcw } from 'lucide-react';
import { useScanDuplicates, useBuildRegistry, useScannerSkips, DuplicateGroup } from '@/hooks/useKpiRegistry';
import { useToast } from '@/hooks/use-toast';
import { AffectedKpisTable } from './AffectedKpisTable';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

interface Props {
  onRegistryUpdated: () => void;
}

export function BuildRegistryTab({ onRegistryUpdated }: Props) {
  const { groups, loading: scanning, scan } = useScanDuplicates();
  const { createDefinitionWithAliases, saving } = useBuildRegistry();
  const { skipGroup, unskipGroup, saving: skipSaving } = useScannerSkips();
  const [search, setSearch] = useState('');
  const [includeSkipped, setIncludeSkipped] = useState(false);
  const [selections, setSelections] = useState<Record<string, number>>({});
  // Per-group canonical text overrides. Keyed by groupKey.
  const [canonicalOverrides, setCanonicalOverrides] = useState<Record<string, { kra: string; kpi: string }>>({});
  const [editingCanonical, setEditingCanonical] = useState<Record<string, boolean>>({});
  const [drillIn, setDrillIn] = useState<Record<string, number | null>>({});
  const [processedGroups, setProcessedGroups] = useState<Set<string>>(new Set());
  const [skipTarget, setSkipTarget] = useState<DuplicateGroup | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const { toast } = useToast();

  // Re-scan whenever the include-skipped toggle flips so admins see results immediately.
  useEffect(() => {
    if (groups.length > 0) {
      scan(includeSkipped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSkipped]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const s = search.toLowerCase();
    return groups.filter(g =>
      g.normalized_kpi.includes(s) ||
      g.category_name?.toLowerCase().includes(s) ||
      g.variants.some(v => v.kra_name.toLowerCase().includes(s))
    );
  }, [groups, search]);

  const visibleGroups = filteredGroups.filter(g => !processedGroups.has(groupKey(g)));
  const skippedCount = filteredGroups.filter(g => g.is_skipped).length;
  const pendingCount = visibleGroups.filter(g => !g.is_skipped).length;

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

  const confirmSkip = async () => {
    if (!skipTarget) return;
    const ok = await skipGroup(skipTarget.category_id, skipTarget.normalized_kpi, skipReason || null);
    if (ok) {
      setProcessedGroups(prev => new Set([...prev, groupKey(skipTarget)]));
      setSkipTarget(null);
      setSkipReason('');
      // Refresh so the badge counts stay correct
      scan(includeSkipped);
    }
  };

  const handleUnskip = async (group: DuplicateGroup) => {
    const ok = await unskipGroup(group.category_id, group.normalized_kpi);
    if (ok) scan(includeSkipped);
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
            Approve the canonical version, or click "Don't merge" to permanently skip a group.
            Already-approved variants are hidden automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => scan(includeSkipped)} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanSearch className="h-4 w-4 mr-2" />}
              {groups.length > 0 ? 'Re-scan' : 'Scan for Duplicates'}
            </Button>
            {groups.length > 0 && (
              <Badge variant="secondary">
                {pendingCount} pending
                {skippedCount > 0 && ` / ${skippedCount} skipped`}
                {' / '}{groups.length} total
              </Badge>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Switch
                id="include-skipped"
                checked={includeSkipped}
                onCheckedChange={setIncludeSkipped}
              />
              <Label htmlFor="include-skipped" className="text-xs cursor-pointer">
                Include skipped groups
              </Label>
            </div>
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

      {visibleGroups.map((group) => {
        const key = groupKey(group);
        const selectedIdx = selections[key] ?? 0;
        const override = canonicalOverrides[key];
        const isEditing = !!editingCanonical[key];
        const canonical = group.variants[selectedIdx];
        const canonicalKra = override?.kra ?? canonical?.kra_name ?? '';
        const canonicalKpi = override?.kpi ?? canonical?.kpi_name ?? '';
        const drillIdx = drillIn[key];
        const isSkipped = !!group.is_skipped;

        return (
          <Card
            key={key}
            className={`border-l-4 ${isSkipped ? 'border-l-muted-foreground opacity-60' : 'border-l-amber-500'}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">
                    {group.normalized_kpi.slice(0, 100)}...
                  </CardTitle>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline">{group.category_name}</Badge>
                    {isSkipped && <Badge variant="secondary">Skipped — won't show on next scan</Badge>}
                  </div>
                </div>
                <Badge variant="destructive">{group.variants.length} variants</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isSkipped ? (
                <div className="text-xs text-muted-foreground p-3 border rounded-md bg-muted/30">
                  This group has been marked "Don't Merge". It is hidden from regular scans.
                  Use <strong>Restore</strong> below to bring it back, or undo from <em>History &amp; Undo</em>.
                </div>
              ) : (
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
              )}

              {!isSkipped && (
              <>
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
              </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                {isSkipped ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUnskip(group)}
                    disabled={skipSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Restore (un-skip)
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSkipTarget(group); setSkipReason(''); }}
                      disabled={skipSaving || saving}
                    >
                      <Ban className="h-4 w-4 mr-1" />
                      Don't merge
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(group)}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Approve as Canonical
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {groups.length > 0 && visibleGroups.length === 0 && (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="font-medium">All duplicate groups processed!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Approved entries appear in Review Registry. Skipped entries can be restored from History &amp; Undo
              or by toggling "Include skipped" above.
            </p>
            <Button variant="outline" className="mt-3" onClick={onRegistryUpdated}>
              Go to Review Registry
            </Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDestructiveDialog
        open={!!skipTarget}
        onOpenChange={(o) => { if (!o) { setSkipTarget(null); setSkipReason(''); } }}
        title="Skip this group from the scanner?"
        description={
          skipTarget
            ? `"${skipTarget.normalized_kpi.slice(0, 120)}" will be hidden from future scans. This is reversible from History & Undo or by toggling "Include skipped".`
            : ''
        }
        confirmLabel="Skip group"
        onConfirm={confirmSkip}
      >
        <div className="space-y-2">
          <Label htmlFor="skip-reason" className="text-xs">Reason (optional)</Label>
          <Textarea
            id="skip-reason"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="e.g. These are genuinely different KPIs that share similar wording."
            rows={2}
          />
        </div>
      </ConfirmDestructiveDialog>
    </div>
  );
}

function groupKey(g: DuplicateGroup): string {
  return `${g.category_id}::${g.normalized_kpi}`;
}