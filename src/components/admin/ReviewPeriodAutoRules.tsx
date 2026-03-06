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
import { Plus, Zap, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  periodId: string;
}

const RULE_TYPES = [
  { value: 'deadline_passed', label: 'Self Review Deadline Passed', description: 'Lock self-review when deadline passes' },
  { value: 'review_submitted', label: 'Manager Review Submitted', description: 'Lock employee after manager submits review' },
  { value: 'approval_complete', label: 'Final Approval Complete', description: 'Lock record after final approval' },
  { value: 'calibration_complete', label: 'Calibration Complete', description: 'Lock department after calibration' },
];

export default function ReviewPeriodAutoRules({ periodId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newRuleType, setNewRuleType] = useState('');

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
    mutationFn: async (ruleType: string) => {
      const template = RULE_TYPES.find(r => r.value === ruleType);
      const { error } = await supabase.from('review_period_auto_rules').insert({
        review_period_id: periodId,
        rule_type: ruleType,
        trigger_condition: { description: template?.description || '' },
        action: { lock_type: 'employee', permissions: { view_only: true } },
        is_active: true,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-period-auto-rules', periodId] });
      setNewRuleType('');
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
            <Button
              size="sm"
              onClick={() => newRuleType && addRule.mutate(newRuleType)}
              disabled={!newRuleType || addRule.isPending}
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
                      {template?.description || (rule.trigger_condition as any)?.description || '—'}
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
                        onClick={() => deleteRule.mutate(rule.id)}
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
    </Card>
  );
}
