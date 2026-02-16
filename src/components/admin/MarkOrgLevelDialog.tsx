import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Users, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMarkAsOrgLevel } from '@/hooks/useMarkAsOrgLevel';
import { useToast } from '@/hooks/use-toast';
import { OrgKpiSuggestion } from '@/hooks/useOrgKpiSuggestions';

interface MarkOrgLevelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestion: OrgKpiSuggestion | null;
  reviewPeriod: string;
  reviewYear: number;
}

interface SimilarGroup {
  category_id: string;
  category_name: string;
  employee_count: number;
}

export function MarkOrgLevelDialog({ open, onOpenChange, suggestion, reviewPeriod, reviewYear }: MarkOrgLevelDialogProps) {
  const { toast } = useToast();
  const { markSingle } = useMarkAsOrgLevel();
  const isEdit = suggestion?.already_org_level ?? false;
  const [scope, setScope] = useState(suggestion?.org_level_scope || 'organization');
  const [similarGroups, setSimilarGroups] = useState<SimilarGroup[]>([]);
  const [includeSimilar, setIncludeSimilar] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !suggestion) return;
    setScope(suggestion.org_level_scope || 'organization');
    // Find similar KPIs (same kra_name + kpi_name in OTHER categories)
    const fetchSimilar = async () => {
      const { data } = await supabase
        .from('kpis')
        .select('category_id, employee_id, kra_categories(name)')
        .eq('kra_name', suggestion.kra_name)
        .eq('kpi_name', suggestion.kpi_name)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', false);

      if (!data) return;

      const grouped = new Map<string, { category_name: string; employees: Set<string> }>();
      data.forEach((k: any) => {
        const catName = k.kra_categories?.name || 'Unknown';
        const g = grouped.get(k.category_id) || { category_name: catName, employees: new Set<string>() };
        g.employees.add(k.employee_id);
        grouped.set(k.category_id, g);
      });

      const groups: SimilarGroup[] = [];
      grouped.forEach((g, catId) => {
        groups.push({ category_id: catId, category_name: g.category_name, employee_count: g.employees.size });
      });
      setSimilarGroups(groups);
    };
    fetchSimilar();
  }, [open, suggestion, reviewPeriod, reviewYear]);

  if (!suggestion) return null;

  const totalRecords = includeSimilar
    ? similarGroups.reduce((sum, g) => sum + g.employee_count, 0)
    : similarGroups.find(g => g.category_id === suggestion.category_id)?.employee_count || suggestion.employee_count;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await markSingle.mutateAsync({
        kraName: suggestion.kra_name,
        kpiName: suggestion.kpi_name,
        reviewPeriod,
        reviewYear,
        scope,
        categoryIds: includeSimilar ? undefined : [suggestion.category_id],
      });
      toast({ title: `Marked ${totalRecords} KPI records as org-level` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed to mark as org-level', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const hasMultipleCategories = similarGroups.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Update Organization-Level KPI' : 'Mark as Organization-Level KPI'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the scope for this org-level KPI.' : 'This will mark all matching KPI records as org-level.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">KPI: {suggestion.kpi_name}</p>
            <p className="text-xs text-muted-foreground">KRA: {suggestion.kra_name}</p>
          </div>

          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-semibold">{totalRecords}</span> employee records will be affected
            </span>
          </div>

          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasMultipleCategories && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-similar"
                  checked={includeSimilar}
                  onCheckedChange={(v) => setIncludeSimilar(v === true)}
                />
                <Label htmlFor="include-similar" className="text-sm">
                  Include similar KPIs in other categories
                </Label>
              </div>
              <div className="pl-6 space-y-1">
                {similarGroups.map(g => (
                  <div key={g.category_id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span>{g.category_name}</span>
                    <Badge variant="outline" className="text-xs">{g.employee_count} employees</Badge>
                    {g.category_id === suggestion.category_id && (
                      <Badge variant="secondary" className="text-xs">current</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEdit ? 'Update' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
