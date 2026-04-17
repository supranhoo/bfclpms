import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Plus, Zap, Trash2, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

interface Props {
  periodId: string;
}

const RULE_TYPES = [
  { value: 'deadline_passed', label: 'Self Review Deadline Passed', description: 'Lock self-review when deadline passes' },
  { value: 'review_submitted', label: 'Manager Review Submitted', description: 'Lock employee after manager submits review' },
  { value: 'approval_complete', label: 'Final Approval Complete', description: 'Lock record after final approval' },
  { value: 'calibration_complete', label: 'Calibration Complete', description: 'Lock department after calibration' },
  { value: 'auto_advance_zero', label: 'Auto-Advance with Zero Score', description: 'Auto-advance stuck KPIs with 0 score after deadline' },
  { value: 'scheduled_lock', label: 'Scheduled Lock (Date-Based)', description: 'Lock period on a specific future date' },
];

export default function ReviewPeriodAutoRules({ periodId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newRuleType, setNewRuleType] = useState('');
  const [newDeadlineDays, setNewDeadlineDays] = useState<number>(14);
  const [newLockDate, setNewLockDate] = useState<Date | undefined>(undefined);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['review-period-auto-rules', periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_period_auto_rules')
        .select('*')
        .eq('review_period_id', periodId)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!periodId,
  });

  const addRule = useMutation({
    mutationFn: async ({ ruleType, deadlineDays, lockDate }: { ruleType: string; deadlineDays?: number; lockDate?: string }) => {
      const template = RULE_TYPES.find(r => r.value === ruleType);
      const triggerCondition: Record<string, unknown> = { description: template?.description || '' };
      if ((ruleType === 'deadline_passed' || ruleType === 'auto_advance_zero') && deadlineDays) {
        triggerCondition.deadline_days = deadlineDays;
      }
      if (ruleType === 'auto_advance_zero') {
        triggerCondition.default_score = 0;
        triggerCondition.target_stages = ['kra_set', 'self_review'];
      }
      if (ruleType === 'scheduled_lock' && lockDate) {
        triggerCondition.lock_date = lockDate;
      }
      const actionPayload = ruleType === 'auto_advance_zero'
        ? { action_type: 'auto_advance', default_score: 0 }
        : { lock_type: 'employee', permissions: { view_only: true } };
      const { error } = await supabase.from('review_period_auto_rules').insert([{
        review_period_id: periodId,
        rule_type: ruleType,
        trigger_condition: triggerCondition as any,
        action: actionPayload as any,
        is_active: true,
        created_by: user?.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-period-auto-rules', periodId] });
      setNewRuleType('');
      setNewLockDate(undefined);
      toast({ title: 'Rule added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to add rule', description: err.message, variant: 'destructive' });
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ ruleId, active }: { ruleId: string; active: boolean }) => {
      const { error } = await supabase
        .from('review_period_auto_rules')
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-period-auto-rules', periodId] });
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from('review_period_auto_rules').delete().eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-period-auto-rules', periodId] });
      toast({ title: 'Rule deleted' });
    },
  });

  const updateDeadlineDays = useMutation({
    mutationFn: async ({ ruleId, days }: { ruleId: string; days: number }) => {
      const rule = (rules || []).find(r => r.id === ruleId);
      const existing = (rule?.trigger_condition as any) || {};
      const { error } = await supabase
        .from('review_period_auto_rules')
        .update({ trigger_condition: { ...existing, deadline_days: days } as any, updated_at: new Date().toISOString() })
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-period-auto-rules', periodId] });
      toast({ title: 'Deadline updated' });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Auto-Lock Rules</CardTitle>
              <CardDescription>Automate locking based on review events</CardDescription>
            </div>
          </div>
          <div className="flex gap-2 items-center">
             <Select value={newRuleType} onValueChange={setNewRuleType}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select rule type..." />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(newRuleType === 'deadline_passed' || newRuleType === 'auto_advance_zero') && (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={newDeadlineDays}
                  onChange={e => setNewDeadlineDays(Number(e.target.value))}
                  className="w-[80px]"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            )}
            {newRuleType === 'scheduled_lock' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[160px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newLockDate ? format(newLockDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={newLockDate} onSelect={setNewLockDate} disabled={(date) => date < new Date()} initialFocus />
                </PopoverContent>
              </Popover>
            )}
            <Button
              size="sm"
              onClick={() => newRuleType && addRule.mutate({
                ruleType: newRuleType,
                deadlineDays: (newRuleType === 'deadline_passed' || newRuleType === 'auto_advance_zero') ? newDeadlineDays : undefined,
                lockDate: newRuleType === 'scheduled_lock' && newLockDate ? newLockDate.toISOString().split('T')[0] : undefined,
              })}
              disabled={!newRuleType || addRule.isPending || ((newRuleType === 'deadline_passed' || newRuleType === 'auto_advance_zero') && (!newDeadlineDays || newDeadlineDays < 1)) || (newRuleType === 'scheduled_lock' && !newLockDate)}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Loading rules...</p>
        ) : (rules || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No auto-lock rules configured. Add a rule above.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules || []).map(rule => {
                const template = RULE_TYPES.find(r => r.value === rule.rule_type);
                return (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Badge variant="outline">{template?.label || rule.rule_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(rule.rule_type === 'deadline_passed' || rule.rule_type === 'auto_advance_zero') ? (
                        <div className="flex items-center gap-2">
                          <span>{rule.rule_type === 'auto_advance_zero' ? 'Auto-advance stuck KPIs after' : 'Lock self-review after'}</span>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            defaultValue={(rule.trigger_condition as any)?.deadline_days || ''}
                            className="w-[70px] h-8"
                            placeholder="days"
                            onBlur={e => {
                              const val = Number(e.target.value);
                              if (val > 0 && val !== (rule.trigger_condition as any)?.deadline_days) {
                                updateDeadlineDays.mutate({ ruleId: rule.id, days: val });
                              }
                            }}
                          />
                          <span>days from stage start date</span>
                        </div>
                      ) : rule.rule_type === 'scheduled_lock' ? (
                        <span>Lock on <strong>{(rule.trigger_condition as any)?.lock_date || 'N/A'}</strong></span>
                      ) : (
                        template?.description || (rule.trigger_condition as any)?.description || '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={active => toggleRule.mutate({ ruleId: rule.id, active })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingRuleId(rule.id)}
                        disabled={deleteRule.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ConfirmDestructiveDialog
        open={!!deletingRuleId}
        onConfirm={() => {
          if (!deletingRuleId) return;
          deleteRule.mutate(deletingRuleId, { onSuccess: () => setDeletingRuleId(null) });
        }}
        onCancel={() => setDeletingRuleId(null)}
        title="Delete Auto-Rule?"
        description="This will permanently delete this automation rule for the review period. Any future scheduled actions tied to it will not run. This cannot be undone."
        confirmLabel="Delete Rule"
        isLoading={deleteRule.isPending}
      />
    </Card>
  );
}
