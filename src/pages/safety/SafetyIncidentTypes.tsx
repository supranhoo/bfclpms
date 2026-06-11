import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Loader2, Trash2, ChevronDown, ChevronRight, GripVertical,
  AlertTriangle, Pencil, ArrowUp, ArrowDown, Tag,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useSafetyIncidentTypes,
  useUpsertSafetyIncidentType,
  useDeleteSafetyIncidentType,
  useSafetyIncidentSeverities,
  useUpsertSafetyIncidentSeverity,
  useDeleteSafetyIncidentSeverity,
  useReorderSafetyIncidentSeverities,
  slugifyCode,
  type SafetyIncidentTypeRow,
  type SafetyIncidentSeverityRow,
} from '@/hooks/useSafetyIncidentTypes';

/**
 * Admin: configure Incident Types and the Severity values that belong to
 * each type. Per workspace zero-hardcoding rule — no global severity list.
 */
export default function SafetyIncidentTypes() {
  const { data: types = [], isLoading } = useSafetyIncidentTypes();
  const [editing, setEditing] = useState<SafetyIncidentTypeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<SafetyIncidentTypeRow | null>(null);
  const remove = useDeleteSafetyIncidentType();

  return (
    <div className="w-full space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <Tag className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl sm:text-2xl font-bold">Incident Types & Severities</h1>
          <p className="text-sm text-muted-foreground">
            Define the Incident Types that appear when users report a safety incident, and the
            Severity values available under each Type. Renaming or deleting a value will not affect
            incidents that were already filed using it.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/safety/settings" className="flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to Settings
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Incident Types</CardTitle>
            <CardDescription>
              Each type holds its own list of severities.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New Incident Type
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading types…
            </div>
          ) : types.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No incident types yet — add the first one above.
            </div>
          ) : (
            types.map((t) => {
              const isOpen = !!expanded[t.id];
              return (
                <div key={t.id} className="rounded-lg border">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setExpanded((s) => ({ ...s, [t.id]: !s[t.id] }))}
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                        {t.name}
                        <code className="text-xs font-mono text-muted-foreground">{t.code}</code>
                        {!t.is_active && <Badge variant="outline">Inactive</Badge>}
                      </div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(t)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="border-t bg-muted/20 p-3">
                      <SeverityManager typeId={t.id} typeName={t.name} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <TypeEditorDialog
        open={creating || !!editing}
        existing={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={(row) => {
          // Switch from "create" to "edit" so severities can be configured in the same dialog.
          if (creating) {
            setCreating(false);
            setEditing(row);
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Incident Type?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  This removes <b>{deleting.name}</b> and all its severity values from the
                  configuration. Historical incidents keep the original labels they were filed with.
                  If you only want to hide it from the new-incident form, edit it and toggle it inactive instead.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (!deleting) return;
                remove.mutate(deleting.id, { onSettled: () => setDeleting(null) });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TypeEditorDialog({
  open, existing, onClose, onSaved,
}: {
  open: boolean;
  existing: SafetyIncidentTypeRow | null;
  onClose: () => void;
  onSaved?: (row: SafetyIncidentTypeRow) => void;
}) {
  const upsert = useUpsertSafetyIncidentType();
  const [name, setName] = useState(existing?.name ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [active, setActive] = useState(existing?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(existing?.sort_order ?? 0));

  // Reset when opening for a different row. Side-effects must live in useEffect.
  useEffect(() => {
    setName(existing?.name ?? '');
    setCode(existing?.code ?? '');
    setDescription(existing?.description ?? '');
    setActive(existing?.is_active ?? true);
    setSortOrder(String(existing?.sort_order ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, open]);

  const submit = () => {
    if (!name.trim() || !code.trim()) return;
    upsert.mutate(
      {
        id: existing?.id,
        input: {
          name: name.trim(),
          code: code.trim(),
          description: description.trim() || null,
          is_active: active,
          sort_order: Number(sortOrder) || 0,
        },
      },
      {
        onSuccess: (row) => {
          if (!existing && row) {
            // Keep dialog open and switch into edit mode so the admin can
            // immediately configure severity values for the just-created type.
            onSaved?.(row);
          } else {
            onClose();
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Incident Type' : 'New Incident Type'}</DialogTitle>
          <DialogDescription>
            Incident Types appear in the report-incident form. Each type owns its severities.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!existing && !code) setCode(slugifyCode(e.target.value));
              }}
              placeholder="e.g. Fire"
            />
          </div>
          <div>
            <Label>Code *</Label>
            <Input
              value={code}
              onChange={(e) => setCode(slugifyCode(e.target.value))}
              placeholder="fire"
              className="font-mono"
              disabled={!!existing}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {existing ? 'Code is immutable to keep historical data stable.' : 'Lowercase, snake_case. Used internally.'}
            </p>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sort order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} id="type-active" />
                <Label htmlFor="type-active">Active</Label>
              </div>
            </div>
          </div>

          {/* Severity Values — managed inline per spec. Only available once
              the Incident Type exists (we need its id to attach children). */}
          <div className="pt-2 border-t mt-2">
            {existing ? (
              <SeverityManager typeId={existing.id} typeName={existing.name} />
            ) : (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Save this Incident Type first — severity values can be configured here once it is created.
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={upsert.isPending}>
            {existing ? 'Done' : 'Cancel'}
          </Button>
          <Button onClick={submit} disabled={upsert.isPending || !name.trim() || !code.trim()}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {existing ? 'Save changes' : 'Save & configure severities'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Severities manager (children of one Incident Type)
// ============================================================

function SeverityManager({ typeId, typeName }: { typeId: string; typeName: string }) {
  const { data: severities = [], isLoading } = useSafetyIncidentSeverities(typeId);
  const upsert = useUpsertSafetyIncidentSeverity();
  const remove = useDeleteSafetyIncidentSeverity();
  const reorder = useReorderSafetyIncidentSeverities();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SafetyIncidentSeverityRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SafetyIncidentSeverityRow | null>(null);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...severities];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    reorder.mutate(next.map((s, i) => ({ id: s.id, sort_order: (i + 1) * 10 })));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          Severities
          <Badge variant="secondary" className="tabular-nums">{severities.length}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Severity
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : severities.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          No severities yet — add values like “LTI”, “First Aid Case”, “Minor Fire”…
        </div>
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {severities.map((s, idx) => (
            <li key={s.id} className="flex items-center gap-2 px-2 py-2 min-h-[44px]">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {s.label}
                  <code className="text-xs font-mono text-muted-foreground">{s.code}</code>
                  {!s.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, -1)} aria-label="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, 1)} aria-label="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setPendingDelete(s)}
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <SeverityEditor
        open={adding || !!editing}
        existing={editing}
        typeId={typeId}
        typeName={typeName}
        onClose={() => { setAdding(false); setEditing(null); }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this severity?</AlertDialogTitle>
            <AlertDialogDescription className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
              {pendingDelete && (
                <span>
                  Removing <b>{pendingDelete.label}</b> hides it from new incident reports.
                  If any historical incident already uses it, the value will be deactivated
                  instead of deleted so that report still shows the original label.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (!pendingDelete) return;
                remove.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SeverityEditor({
  open, existing, typeId, typeName, onClose,
}: {
  open: boolean;
  existing: SafetyIncidentSeverityRow | null;
  typeId: string;
  typeName: string;
  onClose: () => void;
}) {
  const upsert = useUpsertSafetyIncidentSeverity();
  const [label, setLabel] = useState(existing?.label ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [active, setActive] = useState(existing?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(existing?.sort_order ?? 0));

  useEffect(() => {
    setLabel(existing?.label ?? '');
    setCode(existing?.code ?? '');
    setActive(existing?.is_active ?? true);
    setSortOrder(String(existing?.sort_order ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, open]);

  const submit = () => {
    if (!label.trim() || !code.trim()) return;
    upsert.mutate(
      {
        id: existing?.id,
        input: {
          incident_type_id: typeId,
          label: label.trim(),
          code: code.trim(),
          is_active: active,
          sort_order: Number(sortOrder) || 0,
        },
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Severity' : 'Add Severity'}</DialogTitle>
          <DialogDescription>Under Incident Type: <b>{typeName}</b></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Label *</Label>
            <Input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!existing && !code) setCode(slugifyCode(e.target.value));
              }}
              placeholder="e.g. LTI"
            />
          </div>
          <div>
            <Label>Code *</Label>
            <Input
              value={code}
              onChange={(e) => setCode(slugifyCode(e.target.value))}
              placeholder="lti"
              className="font-mono"
              disabled={!!existing}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {existing ? 'Code is immutable to keep historical data stable.' : 'Lowercase, snake_case. Unique within this Type.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sort order</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} id="sev-active" />
                <Label htmlFor="sev-active">Active</Label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={upsert.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={upsert.isPending || !label.trim() || !code.trim()}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}