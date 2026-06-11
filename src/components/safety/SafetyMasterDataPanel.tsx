import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Database, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSafetyMasterData,
  useUpsertSafetyMasterData,
  useDeleteSafetyMasterData,
  type SafetyMasterDataRow,
} from '@/hooks/useSafetyMasterData';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * SafetyMasterDataPanel
 * ---------------------
 * Admin CRUD for `safety_master_data`. RLS gates writes to Safety Admin /
 * Safety Head; readers see the dropdown registry. Empty state nudges the
 * first category creation.
 */
export default function SafetyMasterDataPanel() {
  const { data: rows = [], isLoading } = useSafetyMasterData();
  const upsert = useUpsertSafetyMasterData();
  const remove = useDeleteSafetyMasterData();
  const [draft, setDraft] = useState({ category: '', code: '', label: '' });
  const [pendingDelete, setPendingDelete] = useState<SafetyMasterDataRow | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<string, SafetyMasterDataRow[]>();
    for (const r of rows) {
      const list = m.get(r.category) ?? [];
      list.push(r);
      m.set(r.category, list);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  function handleAdd() {
    const c = draft.category.trim();
    const code = draft.code.trim();
    const label = draft.label.trim();
    if (!c || !code || !label) {
      toast.error('Category, code, and label are required.');
      return;
    }
    upsert.mutate(
      { category: c, code, label, is_active: true, sort_order: 0 },
      {
        onSuccess: () => {
          toast.success(`Added “${label}” to ${c}`);
          setDraft({ category: c, code: '', label: '' });
        },
        onError: (e: unknown) =>
          toast.error((e as Error).message ?? 'Failed to add reference value'),
      },
    );
  }

  function toggleActive(r: SafetyMasterDataRow) {
    upsert.mutate(
      { ...r, is_active: !r.is_active },
      {
        onError: (e: unknown) =>
          toast.error((e as Error).message ?? 'Failed to update reference value'),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4" /> Reference data (master)
        </CardTitle>
        <CardDescription>
          Categorized lookup values used across Safety forms (e.g. <code className="text-xs">root_cause</code>,
          <code className="text-xs"> ppe_type</code>, <code className="text-xs">hazard_class</code>). Only Safety Admin / Safety Head can write.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-lg border border-dashed p-3">
          <div>
            <Label className="text-xs">Category</Label>
            <Input
              placeholder="root_cause"
              value={draft.category}
              onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value }))}
              className="font-mono text-xs h-10"
            />
          </div>
          <div>
            <Label className="text-xs">Code</Label>
            <Input
              placeholder="human_error"
              value={draft.code}
              onChange={(e) => setDraft((s) => ({ ...s, code: e.target.value }))}
              className="font-mono text-xs h-10"
            />
          </div>
          <div>
            <Label className="text-xs">Label</Label>
            <Input
              placeholder="Human Error"
              value={draft.label}
              onChange={(e) => setDraft((s) => ({ ...s, label: e.target.value }))}
              className="h-10"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={upsert.isPending} size="sm" className="h-10 w-full">
              {upsert.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add value
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading reference data…
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No reference values yet. Add the first one above (e.g. category
            <code className="mx-1">root_cause</code>).
          </div>
        ) : (
          grouped.map(([category, list]) => (
            <div key={category} className="rounded-lg border">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <div className="font-medium text-sm">{category}</div>
                <Badge variant="secondary" className="tabular-nums">{list.length}</Badge>
              </div>
              <ul className="divide-y">
                {list.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 px-3 py-2 min-h-[44px]">
                    <code className="text-xs font-mono text-muted-foreground w-40 truncate">{r.code}</code>
                    <div className="flex-1 truncate text-sm">{r.label}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleActive(r)}
                      className="h-8"
                    >
                      {r.is_active ? <Badge variant="outline">active</Badge> : <Badge variant="outline" className="opacity-60">inactive</Badge>}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPendingDelete(r)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Delete ${r.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </CardContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reference value?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>This will remove <code>{pendingDelete.category}/{pendingDelete.code}</code> from the registry. Existing rows that referenced it as free text remain unchanged.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                remove.mutate(pendingDelete.id, {
                  onSuccess: () => toast.success('Deleted'),
                  onError: (e: unknown) => toast.error((e as Error).message ?? 'Failed to delete'),
                  onSettled: () => setPendingDelete(null),
                });
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              <Save className="h-4 w-4 mr-1" /> Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}