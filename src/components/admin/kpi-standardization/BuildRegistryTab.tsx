import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, ScanSearch, CheckCircle2, Search, Eye, Pencil, Ban, RotateCcw, Split } from 'lucide-react';
import { useScanDuplicates, useBuildRegistry, useScannerSkips, DuplicateGroup } from '@/hooks/useKpiRegistry';
import { useToast } from '@/hooks/use-toast';
import { AffectedKpisTable } from './AffectedKpisTable';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BucketId,
  SKIP_BUCKET,
  summarizeBuckets,
  defaultCanonicalForBucket,
  nextAvailableBucket,
  suggestBucketAssignments,
  validateBuckets,
  CanonicalDraft,
} from '@/lib/scanGroupBuckets';

const SENSITIVITY_OPTIONS: Array<{ label: string; value: string; threshold: number; hint: string }> = [
  { label: 'Strict',   value: 'strict',   threshold: 0.75, hint: 'Only very close matches' },
  { label: 'Balanced', value: 'balanced', threshold: 0.55, hint: 'Recommended default' },
  { label: 'Loose',    value: 'loose',    threshold: 0.40, hint: 'Catches more near-duplicates (more noise)' },
];

interface Props {
  onRegistryUpdated: () => void;
}

export function BuildRegistryTab({ onRegistryUpdated }: Props) {
  const { groups, loading: scanning, scan } = useScanDuplicates();
  const { createDefinitionWithAliases, createMultipleDefinitionsWithAliases, saving } = useBuildRegistry();
  const { skipGroup, unskipGroup, saving: skipSaving } = useScannerSkips();
  const [search, setSearch] = useState('');
  const [includeSkipped, setIncludeSkipped] = useState(false);
  const [sensitivity, setSensitivity] = useState<string>('balanced');
  // Per-group bucket assignments: groupKey -> variantIndex -> bucketId.
  const [bucketAssignments, setBucketAssignments] = useState<Record<string, Record<number, BucketId>>>({});
  // Per-group, per-bucket canonical text overrides: groupKey -> bucketId -> {kra,kpi}.
  const [canonicalByBucket, setCanonicalByBucket] = useState<Record<string, Record<BucketId, CanonicalDraft>>>({});
  // Per-group, per-bucket "edit canonical" toggle.
  const [editingByBucket, setEditingByBucket] = useState<Record<string, Record<BucketId, boolean>>>({});
  const [drillIn, setDrillIn] = useState<Record<string, number | null>>({});
  const [processedGroups, setProcessedGroups] = useState<Set<string>>(new Set());
  const [skipTarget, setSkipTarget] = useState<DuplicateGroup | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const { toast } = useToast();

  const currentThreshold = useMemo(
    () => SENSITIVITY_OPTIONS.find(o => o.value === sensitivity)?.threshold ?? 0.55,
    [sensitivity],
  );

  // Re-scan whenever the include-skipped toggle or sensitivity changes so admins see results immediately.
  useEffect(() => {
    if (groups.length > 0) {
      scan(includeSkipped, currentThreshold);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSkipped, currentThreshold]);

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

  const setBucketFor = (key: string, idx: number, bucket: BucketId) => {
    setBucketAssignments(prev => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [idx]: bucket },
    }));
  };

  const handleApprove = async (group: DuplicateGroup) => {
    const key = groupKey(group);
    const assignments = bucketAssignments[key] ?? {};
    const buckets = summarizeBuckets(group.variants, assignments);
    const drafts = canonicalByBucket[key] ?? {};

    // Resolve canonical text per bucket (override -> default longest variant).
    const resolved: Record<BucketId, CanonicalDraft> = {};
    buckets.forEach(b => {
      const override = drafts[b.bucketId];
      const fallback = defaultCanonicalForBucket(b);
      resolved[b.bucketId] = {
        kra: (override?.kra ?? fallback?.kra_name ?? '').trim(),
        kpi: (override?.kpi ?? fallback?.kpi_name ?? '').trim(),
      };
    });

    const errors = validateBuckets(buckets, resolved);
    if (errors.length > 0) {
      toast({ title: 'Cannot approve', description: errors[0], variant: 'destructive' });
      return;
    }

    if (buckets.length === 1) {
      const only = buckets[0];
      const c = resolved[only.bucketId];
      const defId = await createDefinitionWithAliases(
        c.kra,
        c.kpi,
        group.category_id,
        only.variants.map(v => ({ kra_name: v.kra_name, kpi_name: v.kpi_name })),
      );
      if (defId) setProcessedGroups(prev => new Set([...prev, key]));
      return;
    }

    const ok = await createMultipleDefinitionsWithAliases(
      group.category_id,
      buckets.map(b => ({
        canonicalKra: resolved[b.bucketId].kra,
        canonicalKpi: resolved[b.bucketId].kpi,
        variants: b.variants.map(v => ({ kra_name: v.kra_name, kpi_name: v.kpi_name })),
      })),
    );
    if (ok) setProcessedGroups(prev => new Set([...prev, key]));
  };

  const confirmSkip = async () => {
    if (!skipTarget) return;
    const ok = await skipGroup(skipTarget.category_id, skipTarget.normalized_kpi, skipReason || null);
    if (ok) {
      setProcessedGroups(prev => new Set([...prev, groupKey(skipTarget)]));
      setSkipTarget(null);
      setSkipReason('');
      // Refresh so the badge counts stay correct
      scan(includeSkipped, currentThreshold);
    }
  };

  const handleUnskip = async (group: DuplicateGroup) => {
    const ok = await unskipGroup(group.category_id, group.normalized_kpi);
    if (ok) scan(includeSkipped, currentThreshold);
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
            <Button onClick={() => scan(includeSkipped, currentThreshold)} disabled={scanning}>
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
            <div className="flex items-center gap-2">
              <Label htmlFor="sensitivity" className="text-xs whitespace-nowrap">
                Match sensitivity
              </Label>
              <Select value={sensitivity} onValueChange={setSensitivity}>
                <SelectTrigger id="sensitivity" className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENSITIVITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      <div className="flex flex-col">
                        <span>{o.label}</span>
                        <span className="text-[10px] text-muted-foreground">{o.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <p className="text-[11px] text-muted-foreground mt-2">
            Tip: use <strong>Don't merge</strong> on a group to permanently hide it from future scans.
            You can always restore it from <em>History &amp; Undo</em> or by toggling
            <em> Include skipped groups</em> above.
          </p>
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
        const drillIdx = drillIn[key];
        const isSkipped = !!group.is_skipped;
        const assignments = bucketAssignments[key] ?? {};
        const buckets = summarizeBuckets(group.variants, assignments);
        const isMultiBucket = buckets.length > 1;
        const drafts = canonicalByBucket[key] ?? {};
        const editing = editingByBucket[key] ?? {};

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
                    {group.has_fuzzy && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">
                        Fuzzy match
                      </Badge>
                    )}
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
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-muted-foreground">
                    Assign each variant to a bucket. Variants in the same bucket merge into one canonical entry.
                    Use <strong>Skip</strong> to leave a variant out of this approval.
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      const suggested = suggestBucketAssignments(group.variants);
                      setBucketAssignments(prev => ({ ...prev, [key]: suggested }));
                      // Reset canonical overrides + edit toggles for this group when re-bucketing.
                      setCanonicalByBucket(prev => { const n = { ...prev }; delete n[key]; return n; });
                      setEditingByBucket(prev => { const n = { ...prev }; delete n[key]; return n; });
                    }}
                  >
                    <Split className="h-3 w-3 mr-1" />
                    Suggest split
                  </Button>
                </div>
                {group.variants.map((variant, idx) => {
                  const currentBucket = assignments[idx] ?? 'A';
                  const usedBuckets = new Set<BucketId>(Object.values(assignments));
                  // Always allow current + 'A' + the next free letter, plus SKIP.
                  const offered = new Set<BucketId>([currentBucket, 'A', nextAvailableBucket(assignments)]);
                  const bucketOptions = [...offered].sort();
                  return (
                    <div key={idx} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 border">
                      <div className="flex flex-col gap-1 pt-1">
                        <div className="flex gap-1">
                          {bucketOptions.map(b => (
                            <Button
                              key={b}
                              size="sm"
                              variant={currentBucket === b ? 'default' : 'outline'}
                              className="h-6 w-6 p-0 text-[11px] font-semibold"
                              onClick={() => setBucketFor(key, idx, b)}
                              title={`Assign to bucket ${b}`}
                            >
                              {b}
                            </Button>
                          ))}
                          <Button
                            size="sm"
                            variant={currentBucket === SKIP_BUCKET ? 'destructive' : 'outline'}
                            className="h-6 px-2 text-[10px] font-semibold"
                            onClick={() => setBucketFor(key, idx, SKIP_BUCKET)}
                            title="Exclude this variant from approval"
                          >
                            Skip
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{variant.kra_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {variant.kpi_name.slice(0, 150)}
                        </div>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{variant.employee_count} employees</Badge>
                          <Badge variant="outline" className="text-xs">{variant.row_count} rows</Badge>
                          {variant.match_type === 'fuzzy' ? (
                            <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                              Fuzzy {Math.round((variant.similarity ?? 0) * 100)}%
                            </Badge>
                          ) : variant.match_type === 'exact' ? (
                            <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-600">
                              Exact
                            </Badge>
                          ) : null}
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
                          {/* Suppress unused-var warning for usedBuckets */}
                          <span className="hidden">{usedBuckets.size}</span>
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
                      </div>
                    </div>
                  );
                })}
              </>
              )}

              {!isSkipped && buckets.map(b => {
                const fallback = defaultCanonicalForBucket(b);
                const draft = drafts[b.bucketId];
                const kra = draft?.kra ?? fallback?.kra_name ?? '';
                const kpi = draft?.kpi ?? fallback?.kpi_name ?? '';
                const isEditing = !!editing[b.bucketId];
                return (
                  <div key={b.bucketId} className="border rounded-md p-3 bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium flex items-center gap-2">
                        {isMultiBucket && (
                          <Badge variant="default" className="h-5 px-1.5 text-[10px]">Bucket {b.bucketId}</Badge>
                        )}
                        Canonical name ({b.variants.length} variant{b.variants.length === 1 ? '' : 's'})
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => setEditingByBucket(prev => ({
                          ...prev,
                          [key]: { ...(prev[key] ?? {}), [b.bucketId]: !isEditing },
                        }))}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        {isEditing ? 'Use longest variant' : 'Edit canonical'}
                      </Button>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          value={kra}
                          onChange={e => setCanonicalByBucket(prev => ({
                            ...prev,
                            [key]: { ...(prev[key] ?? {}), [b.bucketId]: { kra: e.target.value, kpi } },
                          }))}
                          placeholder="Canonical KRA name"
                          className="text-sm"
                        />
                        <Textarea
                          value={kpi}
                          onChange={e => setCanonicalByBucket(prev => ({
                            ...prev,
                            [key]: { ...(prev[key] ?? {}), [b.bucketId]: { kra, kpi: e.target.value } },
                          }))}
                          placeholder="Canonical KPI name"
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                    ) : (
                      <div className="text-xs">
                        <div className="font-medium">{kra}</div>
                        <div className="text-muted-foreground line-clamp-2">{kpi}</div>
                      </div>
                    )}
                  </div>
                );
              })}

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
        onCancel={() => { setSkipTarget(null); setSkipReason(''); }}
        onConfirm={confirmSkip}
        isLoading={skipSaving}
        title="Skip this group from the scanner?"
        description={
          skipTarget
            ? `"${skipTarget.normalized_kpi.slice(0, 120)}" will be hidden from future scans. This is reversible from History & Undo or by toggling "Include skipped".`
            : ''
        }
        confirmLabel="Skip group"
      />
    </div>
  );
}

function groupKey(g: DuplicateGroup): string {
  return `${g.category_id}::${g.normalized_kpi}`;
}