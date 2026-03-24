import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, Save } from 'lucide-react';
import { useDisqualificationRules, useUpsertDqRule, useDeleteDqRule } from '@/hooks/useIncentivePrograms';

interface Props {
  programId: string;
}

const RULE_TYPES = [
  { value: 'absence', label: 'Absence', defaultConfig: { threshold_days: 1 } },
  { value: 'lwp', label: 'LWP (Leave Without Pay)', defaultConfig: { max_lwp_days: 3, exempt_roles: [] } },
  { value: 'warning', label: 'Warning Letter', defaultConfig: { disqualify: true } },
  { value: 'suspension', label: 'Suspension', defaultConfig: { disqualify: true } },
  { value: 'contract', label: 'Contract Worker', defaultConfig: { ineligible: true, exempt_bus: [] } },
  { value: 'lti', label: 'LTI (Lost Time Injury)', defaultConfig: { lti_1_penalty_percent: 50, lti_2_plus_penalty_percent: 100, scope: 'department' } },
];

export function DisqualificationRulesEditor({ programId }: Props) {
  const { data: rules = [], isLoading } = useDisqualificationRules(programId);
  const upsertRule = useUpsertDqRule();
  const deleteRule = useDeleteDqRule();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<string>('');

  const existingTypes = rules.map((r: any) => r.rule_type);
  const availableTypes = RULE_TYPES.filter(t => !existingTypes.includes(t.value));

  const handleAddRule = (ruleType: typeof RULE_TYPES[0]) => {
    upsertRule.mutate({
      program_id: programId,
      rule_type: ruleType.value,
      rule_config: ruleType.defaultConfig,
      is_active: true,
    });
  };

  const handleSaveConfig = (ruleId: string, programId: string, ruleType: string) => {
    try {
      const parsed = JSON.parse(editConfig);
      upsertRule.mutate({ id: ruleId, program_id: programId, rule_type: ruleType, rule_config: parsed });
      setEditingId(null);
    } catch {
      // invalid JSON
    }
  };

  const handleToggleActive = (rule: any) => {
    upsertRule.mutate({ id: rule.id, program_id: rule.program_id, rule_type: rule.rule_type, rule_config: rule.rule_config, is_active: !rule.is_active });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Disqualification Rules</CardTitle>
        <CardDescription>Configure conditions that disqualify or reduce incentive eligibility</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule Type</TableHead>
                  <TableHead>Configuration</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No rules configured</TableCell></TableRow>
                ) : (
                  rules.map((rule: any) => {
                    const typeLabel = RULE_TYPES.find(t => t.value === rule.rule_type)?.label || rule.rule_type;
                    return (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <Badge variant="outline">{typeLabel}</Badge>
                        </TableCell>
                        <TableCell>
                          {editingId === rule.id ? (
                            <div className="flex gap-2">
                              <Input
                                value={editConfig}
                                onChange={e => setEditConfig(e.target.value)}
                                className="h-8 font-mono text-xs"
                              />
                              <Button size="sm" variant="outline" onClick={() => handleSaveConfig(rule.id, rule.program_id, rule.rule_type)}>
                                <Save className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <code
                              className="text-xs bg-muted px-2 py-1 rounded cursor-pointer"
                              onClick={() => { setEditingId(rule.id); setEditConfig(JSON.stringify(rule.rule_config, null, 0)); }}
                            >
                              {JSON.stringify(rule.rule_config)}
                            </code>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch checked={rule.is_active} onCheckedChange={() => handleToggleActive(rule)} />
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => deleteRule.mutate(rule.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {availableTypes.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground self-center">Add rule:</span>
            {availableTypes.map(rt => (
              <Button key={rt.value} size="sm" variant="outline" onClick={() => handleAddRule(rt)} disabled={upsertRule.isPending}>
                <Plus className="h-3 w-3 mr-1" /> {rt.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
