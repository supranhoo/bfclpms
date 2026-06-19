import { useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSelfReviewLibrary, useUpsertLibraryEntry, useDeleteLibraryEntry, useDeactivateLibraryEntry,
} from '@/hooks/useSelfReviewLibrary';
import type { SelfReviewLibraryEntry } from '@/types/annualReview';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const BLANK = (): Partial<SelfReviewLibraryEntry> => ({
  kind: 'field', key: '', category: 'custom',
  label_en: '', label_hi: '', placeholder_en: '', placeholder_hi: '',
  required: false, is_active: true, sort_order: 1000,
});

export function SelfReviewLibraryManager({ open, onOpenChange }: Props) {
  const list = useSelfReviewLibrary({ includeInactive: true, limit: 500 });
  const upsert = useUpsertLibraryEntry();
  const del = useDeleteLibraryEntry();
  const deact = useDeactivateLibraryEntry();
  const [draft, setDraft] = useState<Partial<SelfReviewLibraryEntry> | null>(null);

  const startNew = () => setDraft(BLANK());
  const startEdit = (e: SelfReviewLibraryEntry) => setDraft({ ...e });

  const save = async () => {
    if (!draft) return;
    if (!draft.label_en?.trim() || !draft.key?.trim()) {
      toast.error('Label (EN) and Key are required');
      return;
    }
    try {
      await upsert.mutateAsync(draft as any);
      toast.success(draft.id ? 'Entry updated' : 'Entry created');
      setDraft(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Manage Self Review Field Library</SheetTitle>
          <SheetDescription>
            Built-in entries can be activated/deactivated but not deleted. Custom entries support full CRUD.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{list.data?.length ?? 0} entries</span>
          <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> New entry</Button>
        </div>

        {draft && (
          <div className="mt-4 rounded border p-3 space-y-3 bg-muted/30">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Kind</Label>
                <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as any })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="field">Field</SelectItem>
                    <SelectItem value="bundle">Bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input className="h-9" value={draft.category ?? ''} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Key (unique slug) *</Label>
                <Input className="h-9" value={draft.key ?? ''} disabled={!!draft.id}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })} />
              </div>
              <div className="space-y-1">
                <Label>Label (EN) *</Label>
                <Input className="h-9" value={draft.label_en ?? ''} onChange={(e) => setDraft({ ...draft, label_en: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Label (HI)</Label>
                <Input className="h-9" dir="auto" value={draft.label_hi ?? ''} onChange={(e) => setDraft({ ...draft, label_hi: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Placeholder (EN)</Label>
                <Input className="h-9" value={draft.placeholder_en ?? ''} onChange={(e) => setDraft({ ...draft, placeholder_en: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Placeholder (HI)</Label>
                <Input className="h-9" dir="auto" value={draft.placeholder_hi ?? ''} onChange={(e) => setDraft({ ...draft, placeholder_hi: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!draft.required} onCheckedChange={(v) => setDraft({ ...draft, required: v })} id="d-req" />
                <Label htmlFor="d-req">Required</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={draft.is_active !== false} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} id="d-act" />
                <Label htmlFor="d-act">Active</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={save} disabled={upsert.isPending}>
                {upsert.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
              </Button>
            </div>
          </div>
        )}

        <ul className="mt-4 divide-y border rounded">
          {(list.data ?? []).map((e) => (
            <li key={e.id} className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{e.label_en}</span>
                  <Badge variant="outline" className="text-[10px]">{e.kind}</Badge>
                  <Badge variant="outline" className="text-[10px] capitalize">{e.category.replace(/_/g, ' ')}</Badge>
                  {e.is_builtin && <Badge variant="default" className="text-[10px]">Built-in</Badge>}
                  {!e.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                </div>
                {e.label_hi && <div className="text-xs text-muted-foreground" dir="auto">{e.label_hi}</div>}
                <div className="text-[10px] text-muted-foreground">{e.key}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => startEdit(e)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                {e.is_builtin ? (
                  <Button size="sm" variant="ghost" disabled={deact.isPending}
                    onClick={() => deact.mutate(e.id)}>
                    {e.is_active ? 'Deactivate' : 'Reactivate via edit'}
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete library entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                          "{e.label_en}" will be removed permanently. Existing templates already using it are unaffected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(e.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}