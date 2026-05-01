import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GitBranch, AlertTriangle } from 'lucide-react';
import {
  useDefinitionAliases,
  useSplitPreview,
  useSplitDefinition,
  validateAliasPartition,
  type AliasRow,
} from '@/hooks/useDefinitionSplit';

/**
 * Phase 5b: Alias-partition split dialog.
 *
 * Admin chooses, for every alias of the source definition, whether it
 * stays on the source or moves to a brand-new definition. KPI links are
 * re-pointed by signature — so the live preview reflects exactly what
 * will happen when the admin commits.
 *
 * Confirmation is gated by:
 *   - non-empty Move side (so this is actually a split, not a rename)
 *   - new canonical KRA + KPI text supplied
 *   - non-empty reason (immutable in the audit log)
 *
 * Server-side `split_definition` revalidates everything; this dialog
 * is the "fast feedback" layer.
 */
export interface SplitDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  source: {
    definition_id: string;
    canonical_kra_name: string;
    canonical_kpi_name: string;
    category_name: string;
  } | null;
}

export function SplitDefinitionDialog({ open, onClose, onSuccess, source }: SplitDialogProps) {
  const definitionId = source?.definition_id ?? null;
  const { aliases, loading: aliasesLoading } = useDefinitionAliases(open ? definitionId : null);
  const { split, loading: splitting } = useSplitDefinition();

  // Default partition: nothing moved yet — admin must opt every alias in.
  const [moveIds, setMoveIds] = useState<Set<string>>(new Set());
  const [newKra, setNewKra] = useState('');
  const [newKpi, setNewKpi] = useState('');
  const [renameKra, setRenameKra] = useState('');
  const [renameKpi, setRenameKpi] = useState('');
  const [reason, setReason] = useState('');

  // Reset whenever a new source is opened.
  useEffect(() => {
    if (open) {
      setMoveIds(new Set());
      setNewKra('');
      setNewKpi('');
      setRenameKra('');
      setRenameKpi('');
      setReason('');
    }
  }, [open, definitionId]);

  const allIds = useMemo(() => aliases.map((a) => a.id), [aliases]);
  const moveArr = useMemo(() => Array.from(moveIds), [moveIds]);
  const keepArr = useMemo(() => allIds.filter((id) => !moveIds.has(id)), [allIds, moveIds]);

  const partition = useMemo(
    () => validateAliasPartition(allIds, keepArr, moveArr),
    [allIds, keepArr, moveArr],
  );

  const { preview, loading: previewLoading } = useSplitPreview(definitionId, moveArr);

  const formValid =
    partition.ok &&
    newKra.trim().length > 0 &&
    newKpi.trim().length > 0 &&
    reason.trim().length > 0 &&
    !splitting;

  const toggle = (id: string) => {
    setMoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!source || !formValid) return;
    const result = await split({
      sourceId: source.definition_id,
      keepIds: keepArr,
      moveIds: moveArr,
      newKraName: newKra.trim(),
      newKpiName: newKpi.trim(),
      renameSourceKra: renameKra.trim() || null,
      renameSourceKpi: renameKpi.trim() || null,
      reason: reason.trim(),
    });
    if (result?.success) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !splitting && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-amber-600" />
            Split definition
          </DialogTitle>
          <DialogDescription>
            {source ? (
              <>
                Splitting <strong>{source.canonical_kra_name}</strong> /{' '}
                <strong>{source.canonical_kpi_name}</strong>{' '}
                <span className="text-muted-foreground">({source.category_name})</span>{' '}
                into two canonical definitions.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {/* Alias partition */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Choose which aliases move to the new definition
            </Label>
            <Badge variant="outline" className="text-[10px] font-normal">
              {moveIds.size} moving / {allIds.length - moveIds.size} staying
            </Badge>
          </div>
          {aliasesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : aliases.length === 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <AlertTriangle className="inline h-3 w-3 mr-1 text-amber-600" />
              This definition has no aliases. There is nothing to split — use
              "Edit definition" or rename instead.
            </div>
          ) : (
            <div className="rounded-md border max-h-64 overflow-auto divide-y">
              {aliases.map((a) => (
                <AliasPartitionRow
                  key={a.id}
                  alias={a}
                  moving={moveIds.has(a.id)}
                  onToggle={() => toggle(a.id)}
                />
              ))}
            </div>
          )}
          {!partition.ok && allIds.length > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {partition.reason}
            </p>
          )}
        </section>

        {/* New canonical text */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="split-new-kra" className="text-xs">
              New definition · canonical KRA *
            </Label>
            <Input
              id="split-new-kra"
              value={newKra}
              onChange={(e) => setNewKra(e.target.value)}
              placeholder="e.g. Customer Satisfaction"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="split-new-kpi" className="text-xs">
              New definition · canonical KPI *
            </Label>
            <Input
              id="split-new-kpi"
              value={newKpi}
              onChange={(e) => setNewKpi(e.target.value)}
              placeholder="e.g. NPS Score"
              autoComplete="off"
            />
          </div>
        </section>

        {/* Optional rename of source */}
        <section className="grid gap-3 sm:grid-cols-2 rounded-md border bg-muted/20 p-3">
          <div className="sm:col-span-2 text-[11px] text-muted-foreground -mb-1">
            Optionally rename the original definition (leave blank to keep current text).
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="split-rename-kra" className="text-xs">
              Original · KRA
            </Label>
            <Input
              id="split-rename-kra"
              value={renameKra}
              onChange={(e) => setRenameKra(e.target.value)}
              placeholder={source?.canonical_kra_name ?? ''}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="split-rename-kpi" className="text-xs">
              Original · KPI
            </Label>
            <Input
              id="split-rename-kpi"
              value={renameKpi}
              onChange={(e) => setRenameKpi(e.target.value)}
              placeholder={source?.canonical_kpi_name ?? ''}
              autoComplete="off"
            />
          </div>
        </section>

        {/* Reason */}
        <section className="space-y-1.5">
          <Label htmlFor="split-reason" className="text-xs">
            Reason *
          </Label>
          <Textarea
            id="split-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are these two KPIs being split apart? Recorded in the registry audit log."
            rows={2}
          />
        </section>

        {/* Live preview */}
        <section className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          {moveIds.size === 0 ? (
            <span className="text-muted-foreground">
              Pick at least one alias to see how many KPI links will move.
            </span>
          ) : previewLoading ? (
            <Skeleton className="h-4 w-2/3" />
          ) : preview ? (
            <span>
              <strong className="tabular-nums">{preview.move_count}</strong> KPI link(s) will move to the new
              definition; <strong className="tabular-nums">{preview.stay_count}</strong> will stay on the original.
            </span>
          ) : (
            <span className="text-muted-foreground">Preview unavailable.</span>
          )}
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={splitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!formValid}>
            {splitting ? 'Splitting…' : 'Split definition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AliasPartitionRow({
  alias, moving, onToggle,
}: {
  alias: AliasRow;
  moving: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-accent/40"
      htmlFor={`alias-${alias.id}`}
    >
      <Checkbox
        id={`alias-${alias.id}`}
        checked={moving}
        onCheckedChange={onToggle}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{alias.variant_kra_name}</div>
        <div className="text-muted-foreground truncate">{alias.variant_kpi_name}</div>
      </div>
      <Badge variant="outline" className={`text-[10px] font-normal ${moving ? 'border-primary/50 text-primary' : ''}`}>
        {moving ? 'Move' : 'Keep'}
      </Badge>
    </label>
  );
}
