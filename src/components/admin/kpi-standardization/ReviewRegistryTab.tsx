import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Search, ChevronDown, ChevronRight, BookCheck, Trash2, Plus, Loader2 } from 'lucide-react';
import { useKpiDefinitions, useKpiAliases, KpiDefinition } from '@/hooks/useKpiRegistry';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

export function ReviewRegistryTab() {
  const { data: definitions, loading, refetch } = useKpiDefinitions();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  const filtered = useMemo(() => {
    if (!search.trim()) return definitions;
    const s = search.toLowerCase();
    return definitions.filter(d =>
      d.canonical_kra_name.toLowerCase().includes(s) ||
      d.canonical_kpi_name.toLowerCase().includes(s)
    );
  }, [definitions, search]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('kpi_definitions' as any).delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Definition deleted' });
      refetch();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2">Loading registry...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookCheck className="h-5 w-5" />
            Canonical KPI Registry
          </CardTitle>
          <CardDescription>
            {definitions.length} canonical KPI definitions. Click a row to see linked aliases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by KRA or KPI name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {definitions.length === 0
                ? 'No registry entries yet. Use the Build Registry tab to scan and create entries.'
                : 'No results match your search.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map(def => (
                <RegistryRow
                  key={def.id}
                  definition={def}
                  isExpanded={expandedId === def.id}
                  onToggle={() => setExpandedId(expandedId === def.id ? null : def.id)}
                  onDelete={() => handleDelete(def.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RegistryRow({
  definition,
  isExpanded,
  onToggle,
  onDelete,
}: {
  definition: KpiDefinition;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { data: aliases, loading } = useKpiAliases(isExpanded ? definition.id : undefined);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <div className="border rounded-lg">
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50">
              {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{definition.canonical_kra_name}</div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {definition.canonical_kpi_name.slice(0, 120)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                onClick={e => { e.stopPropagation(); setShowDeleteDialog(true); }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t px-3 pb-3 pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Linked Aliases:</p>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : aliases.length === 0 ? (
                <p className="text-xs text-muted-foreground">No aliases linked.</p>
              ) : (
                <div className="space-y-1">
                  {aliases.map(alias => (
                    <div key={alias.id} className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                      <Badge variant="outline" className="text-xs shrink-0">KRA</Badge>
                      <span className="truncate">{alias.variant_kra_name}</span>
                      {alias.variant_kra_name === definition.canonical_kra_name &&
                       alias.variant_kpi_name === definition.canonical_kpi_name && (
                        <Badge className="text-xs ml-auto shrink-0">Canonical</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <ConfirmDestructiveDialog
        open={showDeleteDialog}
        onCancel={() => setShowDeleteDialog(false)}
        title="Delete Registry Entry"
        description={`This will delete "${definition.canonical_kra_name}" and all its aliases. KPIs linked to this definition will be unlinked (data preserved).`}
        onConfirm={() => { onDelete(); setShowDeleteDialog(false); }}
      />
    </>
  );
}