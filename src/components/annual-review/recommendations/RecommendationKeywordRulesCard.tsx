/**
 * ADR-226 Phase 2 — Admin CRUD for recommendation classification rules.
 *
 * Zero-hardcoding: the patterns that decide whether prose means "promotion",
 * "special hike" etc. are master data, editable here by HR / Admin.
 */
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useRecommendationTypes } from '@/hooks/useAnnualReviewRecommendations';
import {
  useDeleteRecommendationKeyword,
  useRecommendationKeywords,
  useSaveRecommendationKeyword,
} from '@/hooks/useRecommendationImport';

export function RecommendationKeywordRulesCard() {
  const { data: types = [] } = useRecommendationTypes();
  const { data: rules = [], isLoading } = useRecommendationKeywords();
  const save = useSaveRecommendationKeyword();
  const remove = useDeleteRecommendationKeyword();

  const [pattern, setPattern] = useState('');
  const [typeKey, setTypeKey] = useState('');
  const [weight, setWeight] = useState('2');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canAdd = pattern.trim().length > 1 && !!typeKey;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recommendation classification rules</CardTitle>
        <CardDescription>
          Words or phrases that map a free-text recommendation to a type. Higher weight means
          higher confidence; a combined weight of 3 or more is imported as ready for decision,
          anything lower is flagged as "Needs classification".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 flex-1 min-w-[220px]">
            <Label className="text-xs text-muted-foreground" htmlFor="kw-pattern">Pattern</Label>
            <Input
              id="kw-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. special incre(ment|ament)"
            />
          </div>
          <div className="space-y-1.5 min-w-[180px]">
            <Label className="text-xs text-muted-foreground">Maps to type</Label>
            <Select value={typeKey} onValueChange={setTypeKey}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 w-24">
            <Label className="text-xs text-muted-foreground" htmlFor="kw-weight">Weight</Label>
            <Input
              id="kw-weight"
              inputMode="numeric"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <Button
            disabled={!canAdd || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  pattern: pattern.trim(),
                  type_key: typeKey,
                  weight: Math.min(10, Math.max(1, Number(weight) || 1)),
                },
                { onSuccess: () => { setPattern(''); setWeight('2'); } },
              )
            }
          >
            <Plus className="h-4 w-4 mr-2" />Add rule
          </Button>
        </div>

        <div className="overflow-x-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pattern</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Loading rules…
                </TableCell></TableRow>
              )}
              {!isLoading && rules.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  No rules configured yet.
                </TableCell></TableRow>
              )}
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.pattern}</TableCell>
                  <TableCell className="text-xs">
                    {types.find((t) => t.key === r.type_key)?.label ?? r.type_key}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.weight}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) =>
                        save.mutate({
                          id: r.id,
                          pattern: r.pattern,
                          type_key: r.type_key,
                          weight: r.weight,
                          notes: r.notes,
                          is_active: v,
                        })
                      }
                      aria-label={`Toggle ${r.pattern}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <ConfirmDestructiveDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        title="Remove this classification rule?"
        description="Existing imported recommendations keep their current type. Only future imports are affected."
        confirmLabel="Remove"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (deleteId) remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </Card>
  );
}