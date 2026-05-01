import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, History, Undo2, Search, CheckCircle2 } from 'lucide-react';
import { useStandardizationHistory, StandardizationAction } from '@/hooks/useKpiRegistry';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

const ACTION_LABEL: Record<StandardizationAction['action_type'], string> = {
  create_definition: 'Created canonical entry',
  link_alias: 'Linked aliases',
  rename_kpis: 'Renamed KPIs',
  delete_definition: 'Deleted canonical entry',
  edit_definition: 'Edited canonical name',
  unlink_alias: 'Unlinked alias',
};

export function HistoryUndoTab() {
  const { data, loading, reverseAction, reversing, refetch } = useStandardizationHistory(200);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<StandardizationAction | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const s = search.toLowerCase();
    return data.filter(a =>
      ACTION_LABEL[a.action_type].toLowerCase().includes(s) ||
      JSON.stringify(a.payload || {}).toLowerCase().includes(s)
    );
  }, [data, search]);

  const summary = (a: StandardizationAction): string => {
    const p = a.payload || {};
    switch (a.action_type) {
      case 'create_definition':
        return `${p.canonical_kra_name || ''} → ${(p.canonical_kpi_name || '').slice(0, 80)}`;
      case 'link_alias':
        return `${(p.aliases || []).length} alias(es) linked`;
      case 'rename_kpis':
        return `${p.old_kpi?.slice(0, 60) || ''} → ${p.new_kpi?.slice(0, 60) || ''} (${p.review_period} ${p.review_year})`;
      case 'delete_definition':
        return p.definition?.canonical_kpi_name?.slice(0, 80) || 'Deleted entry';
      case 'edit_definition':
        return `${p.before?.canonical_kpi_name?.slice(0, 50) || ''} → ${p.after?.canonical_kpi_name?.slice(0, 50) || ''}`;
      case 'unlink_alias':
        return p.aliases?.[0]?.variant_kpi_name?.slice(0, 80) || 'Unlinked alias';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            History &amp; Undo
          </CardTitle>
          <CardDescription>
            Every standardization action is logged here. Click <strong>Undo</strong> to reverse a change.
            Reversed actions stay in the log for audit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search history…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No actions logged yet.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(a => (
                <div key={a.id} className={`border rounded-lg p-3 ${a.reversed_at ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{ACTION_LABEL[a.action_type]}</Badge>
                        <Badge variant="secondary" className="text-xs">{a.affected_row_count} rows</Badge>
                        {a.reversed_at && <Badge className="text-xs bg-muted text-muted-foreground"><CheckCircle2 className="h-3 w-3 mr-1" />Reversed</Badge>}
                      </div>
                      <div className="text-xs mt-1.5 truncate">{summary(a)}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(a.performed_at).toLocaleString()}
                      </div>
                    </div>
                    {!a.reversed_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reversing === a.id}
                        onClick={() => setConfirm(a)}
                      >
                        {reversing === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Undo2 className="h-3.5 w-3.5 mr-1" />Undo</>}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDestructiveDialog
        open={!!confirm}
        onCancel={() => setConfirm(null)}
        title="Undo this action?"
        description={confirm ? `${ACTION_LABEL[confirm.action_type]} — ${confirm.affected_row_count} row(s) will be reverted to their prior state.` : ''}
        onConfirm={async () => {
          if (!confirm) return;
          await reverseAction(confirm.id);
          setConfirm(null);
        }}
      />
    </div>
  );
}