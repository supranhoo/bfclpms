import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Save, ShieldAlert, Trash2, Unlock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useEligibilityExemptionPolicy,
  useExemptionPolicyMutations,
} from '@/hooks/annualReview/useEligibilityExemptions';
import {
  validateExemptionPolicy,
  type ExemptionPolicyRow,
} from '@/lib/annualReview/effectiveEligibility';
import { ConfirmDestructiveDialog } from '@/components/common/ConfirmDestructiveDialog';

type Row = ExemptionPolicyRow & { _dirty?: boolean; _unlocked?: boolean };

/**
 * ADR-223 — Admin-configurable eligibility exemption rules.
 * Business rules live in master data (`annual_review_eligibility_exemption_policy`);
 * this card is presentation only. Protected rows (disciplinary action, tenure /
 * month-completion window) must be explicitly unlocked before they can be made
 * exemptable, and every write is audited server-side.
 */
export function EligibilityExemptionPolicyCard() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('hr_pms');
  const { data, isLoading } = useEligibilityExemptionPolicy();
  const { save, remove } = useExemptionPolicyMutations();
  const [rows, setRows] = useState<Row[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  useEffect(() => {
    if (data) setRows(data.map((r) => ({ ...r })));
  }, [data]);

  const validation = useMemo(() => validateExemptionPolicy(rows), [rows]);

  const patch = (i: number, p: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p, _dirty: true } : r)));

  const onSaveRow = async (row: Row) => {
    const check = validateExemptionPolicy([row]);
    if (!check.valid) { toast.error(check.errors[0]); return; }
    try {
      await save.mutateAsync(row);
      toast.success(`Rule "${row.label}" saved`);
    } catch (e) {
      toast.error((e as Error).message || 'Could not save the rule');
    }
  };

  const onDelete = async () => {
    if (!deleteTarget?.id) { setDeleteTarget(null); return; }
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success('Rule removed');
    } catch (e) {
      toast.error((e as Error).message || 'Could not remove the rule');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <Card id="exemption-rules">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Eligibility Exemption Rules
        </CardTitle>
        <CardDescription>
          Decide which failed eligibility criteria may be waived by an approver. The match key is
          compared as a lower-case substring of the criterion name (e.g. <code>absent</code> matches
          “Absent Days”). Protected rules must be unlocked before they can be made exemptable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-56">Criterion label</TableHead>
                <TableHead className="w-48">Match key</TableHead>
                <TableHead className="w-28">Exemptable</TableHead>
                <TableHead className="w-28">Reason required</TableHead>
                <TableHead className="w-24">Order</TableHead>
                <TableHead className="w-32" />
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const locked = !!r.is_protected && !r._unlocked;
                  return (
                    <TableRow key={r.id ?? `new-${i}`}>
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={r.label}
                            disabled={!canEdit}
                            onChange={(e) => patch(i, { label: e.target.value })}
                          />
                          {r.is_protected && (
                            <Badge variant="outline" className="text-[10px]">Protected</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.question_key}
                          disabled={!canEdit}
                          onChange={(e) => patch(i, { question_key: e.target.value.toLowerCase() })}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={!!r.is_exemptable}
                          disabled={!canEdit || locked}
                          onCheckedChange={(v) => patch(i, { is_exemptable: v })}
                          aria-label={`Exemptable — ${r.label}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={r.requires_reason ?? true}
                          disabled={!canEdit}
                          onCheckedChange={(v) => patch(i, { requires_reason: v })}
                          aria-label={`Reason required — ${r.label}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={r.sort_order ?? 100}
                          disabled={!canEdit}
                          onChange={(e) => patch(i, { sort_order: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {locked && canEdit && (
                            <Button
                              variant="ghost" size="icon" aria-label="Unlock protected rule"
                              onClick={() => patch(i, { _unlocked: true })}
                            >
                              <Unlock className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon" aria-label="Save rule"
                            disabled={!canEdit || save.isPending || !r._dirty}
                            onClick={() => onSaveRow(r)}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" aria-label="Remove rule"
                            disabled={!canEdit || !r.id}
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!validation.valid && rows.length > 0 && (
          <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {validation.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!canEdit}
            onClick={() => setRows((prev) => [...prev, {
              question_key: '', label: '', is_exemptable: true,
              requires_reason: true, is_protected: false, sort_order: 100, _dirty: true,
            }])}
          >
            <Plus className="h-4 w-4 mr-2" /> Add rule
          </Button>
          <Label className="text-xs text-muted-foreground">
            Admin / HR PMS only — every change is recorded in the exemption policy audit trail.
          </Label>
        </div>
      </CardContent>

      <ConfirmDestructiveDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        isLoading={remove.isPending}
        title="Remove exemption rule?"
        description={`"${deleteTarget?.label ?? ''}" will no longer control whether that criterion can be waived. Existing approved exemptions are not affected.`}
      />
    </Card>
  );
}