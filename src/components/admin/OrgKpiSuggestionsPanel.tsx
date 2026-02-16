import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Lightbulb, Loader2, CheckCircle2 } from 'lucide-react';
import { useOrgKpiSuggestions, OrgKpiSuggestion } from '@/hooks/useOrgKpiSuggestions';
import { useMarkAsOrgLevel } from '@/hooks/useMarkAsOrgLevel';
import { MarkOrgLevelDialog } from '@/components/admin/MarkOrgLevelDialog';
import { useToast } from '@/hooks/use-toast';

interface OrgKpiSuggestionsPanelProps {
  reviewPeriod: string;
  reviewYear: number;
}

export function OrgKpiSuggestionsPanel({ reviewPeriod, reviewYear }: OrgKpiSuggestionsPanelProps) {
  const { data: suggestions, isLoading } = useOrgKpiSuggestions(reviewPeriod, reviewYear);
  const { markBulk } = useMarkAsOrgLevel();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<OrgKpiSuggestion | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (!suggestions) return;
    if (selected.size === suggestions.filter(s => !s.already_org_level).length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.filter(s => !s.already_org_level).map(s => `${s.category_id}||${s.kra_name}||${s.kpi_name}`)));
    }
  };

  const handleBulkMark = async () => {
    if (!suggestions) return;
    setBulkLoading(true);
    try {
      const items = suggestions
        .filter(s => selected.has(`${s.category_id}||${s.kra_name}||${s.kpi_name}`))
        .map(s => ({
          kraName: s.kra_name,
          kpiName: s.kpi_name,
          reviewPeriod,
          reviewYear,
        }));
      const result = await markBulk.mutateAsync(items);
      toast({ title: `Marked ${result.totalAffected} KPI records as org-level` });
      setSelected(new Set());
    } catch (err: any) {
      toast({ title: 'Bulk mark failed', description: err.message, variant: 'destructive' });
    } finally {
      setBulkLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Analyzing KPIs for suggestions...
        </CardContent>
      </Card>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No suggestions found. KPIs shared by 3+ employees will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  const selectableCount = suggestions.filter(s => !s.already_org_level).length;

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold">Org-Level KPI Suggestions</h3>
              <Badge variant="secondary">{suggestions.length} suggestions</Badge>
            </div>
            {selected.size > 0 && (
              <Button size="sm" onClick={handleBulkMark} disabled={bulkLoading} className="gap-1.5">
                {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Bulk Mark Selected ({selected.size})
              </Button>
            )}
          </div>

          <div className="overflow-x-auto min-w-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === selectableCount && selectableCount > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>KRA</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map(s => {
                  const key = `${s.category_id}||${s.kra_name}||${s.kpi_name}`;
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        {s.already_org_level ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <Checkbox
                            checked={selected.has(key)}
                            onCheckedChange={() => toggleSelect(key)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{s.kra_name}</TableCell>
                      <TableCell className="text-sm font-medium">{s.kpi_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{s.category_name}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="text-xs">{s.employee_count}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.already_org_level ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Already Org-Level</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => { setDialogTarget(s); setDialogOpen(true); }}
                          >
                            Mark Org-Level
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <MarkOrgLevelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        suggestion={dialogTarget}
        reviewPeriod={reviewPeriod}
        reviewYear={reviewYear}
      />
    </>
  );
}
