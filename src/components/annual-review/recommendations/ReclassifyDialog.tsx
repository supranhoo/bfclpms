/**
 * ADR-226 Phase 2 — HR correction of an auto-classified legacy recommendation.
 * Only undecided rows can be reclassified (enforced by `ar_reclassify_recommendation`).
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useRecommendationTypes } from '@/hooks/useAnnualReviewRecommendations';
import { useReclassifyRecommendation } from '@/hooks/useRecommendationImport';
import type { RecommendationQueueRow } from '@/services/annualReview/recommendations';

export function ReclassifyDialog({
  row, onClose,
}: { row: RecommendationQueueRow | null; onClose: () => void }) {
  const { data: types = [] } = useRecommendationTypes();
  const reclassify = useReclassifyRecommendation();
  const [keys, setKeys] = useState<string[]>([]);
  const [amountKind, setAmountKind] = useState<'absolute' | 'percent'>('percent');
  const [amountValue, setAmountValue] = useState('');

  useEffect(() => {
    if (!row) return;
    setKeys(row.type_keys ?? []);
    setAmountKind(row.amount_kind ?? 'percent');
    setAmountValue(row.amount_value == null ? '' : String(row.amount_value));
  }, [row]);

  const amountNum = amountValue.trim() === '' ? null : Number(amountValue);
  const invalid =
    keys.length === 0 || (amountNum != null && (Number.isNaN(amountNum) || amountNum < 0));

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reclassify recommendation</DialogTitle>
          <DialogDescription>
            Correct the type detected from the original wording. The recommendation then moves
            into the decision queue.
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-xs whitespace-pre-wrap bg-muted/30">
              {row.narrative || 'No original text recorded.'}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Recommendation types</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {types.map((t) => (
                  <label key={t.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={keys.includes(t.key)}
                      onCheckedChange={(v) =>
                        setKeys((prev) =>
                          v ? [...new Set([...prev, t.key])] : prev.filter((k) => k !== t.key))
                      }
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Amount type</Label>
                <Select value={amountKind} onValueChange={(v) => setAmountKind(v as 'absolute' | 'percent')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="absolute">Absolute (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="rc-amt">
                  Amount asked (optional)
                </Label>
                <Input id="rc-amt" inputMode="decimal" value={amountValue}
                  onChange={(e) => setAmountValue(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={invalid || reclassify.isPending}
            onClick={() =>
              row && reclassify.mutate(
                {
                  id: row.id,
                  typeKeys: keys,
                  amountKind: amountNum == null ? null : amountKind,
                  amountValue: amountNum,
                },
                { onSuccess: onClose },
              )
            }
          >
            {reclassify.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save classification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}