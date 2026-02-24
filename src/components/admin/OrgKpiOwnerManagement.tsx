import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useOrgKpiDataOwners, useAssignOrgKpiOwner } from '@/hooks/useOrgKpiDataOwner';
import { useProfiles } from '@/hooks/useOrganization';
import { useUnmarkAsOrgLevel } from '@/hooks/useMarkAsOrgLevel';
import { OrgKpiOwnerDialog } from '@/components/admin/OrgKpiOwnerDialog';
import { Users, UserPlus, Loader2, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface KpiDef {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  kraName: string;
  kpiName: string;
}

interface OrgKpiOwnerManagementProps {
  kpiDefinitions: KpiDef[];
  reviewPeriod: string;
  reviewYear: number;
}

export function OrgKpiOwnerManagement({ kpiDefinitions, reviewPeriod, reviewYear }: OrgKpiOwnerManagementProps) {
  const { data: owners, isLoading } = useOrgKpiDataOwners();
  const { data: profiles } = useProfiles();
  const assignOwner = useAssignOrgKpiOwner();
  const unmark = useUnmarkAsOrgLevel();
  const { toast } = useToast();

  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<{ categoryId: string; kraName: string; kpiName: string } | null>(null);
  const [bulkUserId, setBulkUserId] = useState<string>('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [removeTarget, setRemoveTarget] = useState<KpiDef | null>(null);

  // Group KPIs by category
  const categorized = useMemo(() => {
    const map = new Map<string, { catName: string; color: string; kpis: KpiDef[] }>();
    kpiDefinitions.forEach(k => {
      const existing = map.get(k.categoryId) || { catName: k.categoryName, color: k.categoryColor, kpis: [] };
      existing.kpis.push(k);
      map.set(k.categoryId, existing);
    });
    return Array.from(map.entries());
  }, [kpiDefinitions]);

  // Build owner lookup: catId||kra||kpi -> owners[]
  const ownerLookup = useMemo(() => {
    const map = new Map<string, typeof owners>();
    owners?.forEach(o => {
      const key = `${o.category_id}||${o.kra_name}||${o.kpi_name}`;
      const arr = map.get(key) || [];
      arr.push(o);
      map.set(key, arr);
    });
    return map;
  }, [owners]);

  const toggleCat = (catId: string) => {
    const next = new Set(expandedCats);
    if (next.has(catId)) next.delete(catId); else next.add(catId);
    setExpandedCats(next);
  };

  const handleBulkAssign = async (categoryId: string) => {
    if (!bulkUserId) return;
    const kpis = kpiDefinitions.filter(k => k.categoryId === categoryId);
    let assigned = 0;
    for (const kpi of kpis) {
      const key = `${kpi.categoryId}||${kpi.kraName}||${kpi.kpiName}`;
      const existing = ownerLookup.get(key) || [];
      if (existing.some(o => o.owner_id === bulkUserId)) continue;
      try {
        await assignOwner.mutateAsync({
          categoryId: kpi.categoryId,
          kraName: kpi.kraName,
          kpiName: kpi.kpiName,
          ownerId: bulkUserId,
        });
        assigned++;
      } catch { /* skip duplicates */ }
    }
    toast({ title: `Assigned to ${assigned} KPIs in this category` });
    setBulkUserId('');
  };

  const handleRemoveFromOrgKpi = async () => {
    if (!removeTarget) return;
    try {
      await unmark.mutateAsync({
        categoryId: removeTarget.categoryId,
        kraName: removeTarget.kraName,
        kpiName: removeTarget.kpiName,
        reviewPeriod,
        reviewYear,
      });
      toast({ title: 'KPI removed from Organization level', description: `"${removeTarget.kpiName}" is now a normal KPI.` });
    } catch (err: any) {
      toast({ title: 'Failed to remove', description: err?.message || 'An error occurred', variant: 'destructive' });
    } finally {
      setRemoveTarget(null);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {categorized.map(([catId, cat]) => {
        const totalKpis = cat.kpis.length;
        const assignedKpis = cat.kpis.filter(k => {
          const key = `${k.categoryId}||${k.kraName}||${k.kpiName}`;
          return (ownerLookup.get(key)?.length || 0) > 0;
        }).length;

        return (
          <Collapsible
            key={catId}
            open={expandedCats.has(catId)}
            onOpenChange={() => toggleCat(catId)}
          >
            <Card className="min-w-0 overflow-hidden">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedCats.has(catId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || '#6B7280' }} />
                      <CardTitle className="text-base">{cat.catName}</CardTitle>
                    </div>
                    <Badge variant={assignedKpis === totalKpis ? 'default' : 'outline'}>
                      {assignedKpis}/{totalKpis} assigned
                    </Badge>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3 pt-0">
                  {/* Bulk assign */}
                  <div className="flex items-end gap-3 p-3 bg-muted/30 rounded-lg">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Assign owner to ALL {totalKpis} KPIs</Label>
                      <Select value={bulkUserId} onValueChange={setBulkUserId}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select user..." />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles?.slice(0, 50).map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.full_name || p.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleBulkAssign(catId)}
                      disabled={!bulkUserId || assignOwner.isPending}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Assign All
                    </Button>
                  </div>

                  {/* Per-KPI owners */}
                  <div className="space-y-2">
                      {cat.kpis.map(kpi => {
                        const key = `${kpi.categoryId}||${kpi.kraName}||${kpi.kpiName}`;
                        const kpiOwners = ownerLookup.get(key) || [];
                        return (
                          <div key={key} className="flex items-center justify-between p-2 border rounded-lg min-w-0 overflow-hidden">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium whitespace-pre-wrap break-words">{kpi.kpiName}</p>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{kpi.kraName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {kpiOwners.length > 0 ? (
                                <div className="flex -space-x-2">
                                  {kpiOwners.slice(0, 3).map(o => (
                                    <Avatar key={o.id} className="h-6 w-6 border-2 border-background">
                                      <AvatarFallback className="text-[10px]">
                                        {getInitials(o.owner?.full_name || null)}
                                      </AvatarFallback>
                                    </Avatar>
                                  ))}
                                  {kpiOwners.length > 3 && (
                                    <Badge variant="secondary" className="text-[10px] ml-1">
                                      +{kpiOwners.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No owner</span>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setSelectedKpi({ categoryId: kpi.categoryId, kraName: kpi.kraName, kpiName: kpi.kpiName });
                                  setOwnerDialogOpen(true);
                                }}
                              >
                                <Users className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setRemoveTarget(kpi)}
                                title="Remove from Org KPI"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {selectedKpi && (
        <OrgKpiOwnerDialog
          open={ownerDialogOpen}
          onOpenChange={setOwnerDialogOpen}
          categoryId={selectedKpi.categoryId}
          kraName={selectedKpi.kraName}
          kpiName={selectedKpi.kpiName}
        />
      )}

      {/* Remove from Org KPI confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Organization KPI?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert <strong>"{removeTarget?.kpiName}"</strong> to a normal KPI. All organization-level values and data owner assignments for this KPI will be deleted. This action can be reversed by re-marking it from the Suggestions tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveFromOrgKpi}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unmark.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
