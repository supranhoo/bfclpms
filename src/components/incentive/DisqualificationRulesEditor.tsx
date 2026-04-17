import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Save, Pencil, X, Check } from 'lucide-react';
import { useDisqualificationRules, useUpsertDqRule, useDeleteDqRule } from '@/hooks/useIncentivePrograms';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

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
  { value: 'kra_score', label: 'KRA Score (PMS)', defaultConfig: { operator: 'gte', threshold: 3, no_kra_action: 'eligible' } },
];

const OPERATOR_LABELS: Record<string, string> = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=' };

function ConfigSummary({ ruleType, config }: { ruleType: string; config: any }) {
  switch (ruleType) {
    case 'absence':
      return <span className="text-sm text-muted-foreground">Threshold: <strong>{config.threshold_days ?? 0}</strong> day(s)</span>;
    case 'lwp':
      return <span className="text-sm text-muted-foreground">Max LWP: <strong>{config.max_lwp_days ?? 0}</strong> day(s)</span>;
    case 'warning':
      return <span className="text-sm text-muted-foreground">Disqualify: <strong>{config.disqualify ? 'Yes' : 'No'}</strong></span>;
    case 'suspension':
      return <span className="text-sm text-muted-foreground">Disqualify: <strong>{config.disqualify ? 'Yes' : 'No'}</strong></span>;
    case 'contract':
      return <span className="text-sm text-muted-foreground">Ineligible: <strong>{config.ineligible ? 'Yes' : 'No'}</strong></span>;
    case 'lti':
      return (
        <span className="text-sm text-muted-foreground">
          1 LTI: <strong>{config.lti_1_penalty_percent ?? 0}%</strong>,{' '}
          2+ LTI: <strong>{config.lti_2_plus_penalty_percent ?? 0}%</strong>,{' '}
          Scope: <strong>{config.scope ?? 'department'}</strong>
        </span>
      );
    case 'kra_score':
      return (
        <span className="text-sm text-muted-foreground">
          Eligible if KRA <strong>{OPERATOR_LABELS[config.operator ?? 'gte']} {config.threshold ?? 3}</strong>
          {' · '}No KRA: <strong>{config.no_kra_action === 'ineligible' ? 'Ineligible' : 'Eligible'}</strong>
        </span>
      );
    default:
      return <code className="text-xs bg-muted px-2 py-1 rounded">{JSON.stringify(config)}</code>;
  }
}

function RuleConfigEditor({ ruleType, config, onChange }: { ruleType: string; config: any; onChange: (c: any) => void }) {
  const update = (key: string, value: any) => onChange({ ...config, [key]: value });

  switch (ruleType) {
    case 'absence':
      return (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Threshold Days</Label>
          <Input type="number" min={0} className="h-8 w-20" value={config.threshold_days ?? 0} onChange={e => update('threshold_days', Number(e.target.value))} />
        </div>
      );
    case 'lwp':
      return (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Max LWP Days</Label>
          <Input type="number" min={0} className="h-8 w-20" value={config.max_lwp_days ?? 0} onChange={e => update('max_lwp_days', Number(e.target.value))} />
        </div>
      );
    case 'warning':
      return (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Disqualify</Label>
          <Switch checked={!!config.disqualify} onCheckedChange={v => update('disqualify', v)} />
        </div>
      );
    case 'suspension':
      return (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Disqualify</Label>
          <Switch checked={!!config.disqualify} onCheckedChange={v => update('disqualify', v)} />
        </div>
      );
    case 'contract':
      return (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Ineligible</Label>
          <Switch checked={!!config.ineligible} onCheckedChange={v => update('ineligible', v)} />
        </div>
      );
    case 'lti':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">1 LTI Penalty %</Label>
            <Input type="number" min={0} max={100} className="h-8 w-20" value={config.lti_1_penalty_percent ?? 0} onChange={e => update('lti_1_penalty_percent', Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">2+ LTI Penalty %</Label>
            <Input type="number" min={0} max={100} className="h-8 w-20" value={config.lti_2_plus_penalty_percent ?? 0} onChange={e => update('lti_2_plus_penalty_percent', Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">Scope</Label>
            <Select value={config.scope ?? 'department'} onValueChange={v => update('scope', v)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    case 'kra_score':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-xs whitespace-nowrap">Eligible if KRA</Label>
          <Select value={config.operator ?? 'gte'} onValueChange={v => update('operator', v)}>
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gte">≥</SelectItem>
              <SelectItem value="gt">&gt;</SelectItem>
              <SelectItem value="lte">≤</SelectItem>
              <SelectItem value="lt">&lt;</SelectItem>
              <SelectItem value="eq">=</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" step="0.1" min={0} max={5} className="h-8 w-20" value={config.threshold ?? 3} onChange={e => update('threshold', Number(e.target.value))} />
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">If no KRA score</Label>
            <Select value={config.no_kra_action ?? 'eligible'} onValueChange={v => update('no_kra_action', v)}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="eligible">Eligible</SelectItem>
                <SelectItem value="ineligible">Ineligible</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    default:
      return <code className="text-xs bg-muted px-2 py-1 rounded">{JSON.stringify(config)}</code>;
  }
}

export function DisqualificationRulesEditor({ programId }: Props) {
  const { data: rules = [], isLoading } = useDisqualificationRules(programId);
  const upsertRule = useUpsertDqRule();
  const deleteRule = useDeleteDqRule();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<any>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleStartEdit = (rule: any) => {
    setEditingId(rule.id);
    setEditConfig({ ...(rule.rule_config as any) });
  };

  const handleSaveConfig = (ruleId: string, programId: string, ruleType: string) => {
    upsertRule.mutate({ id: ruleId, program_id: programId, rule_type: ruleType, rule_config: editConfig });
    setEditingId(null);
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
                            <div className="flex items-center gap-2">
                              <RuleConfigEditor ruleType={rule.rule_type} config={editConfig} onChange={setEditConfig} />
                              <Button size="sm" variant="outline" onClick={() => handleSaveConfig(rule.id, rule.program_id, rule.rule_type)}>
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleStartEdit(rule)}>
                              <ConfigSummary ruleType={rule.rule_type} config={rule.rule_config} />
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch checked={rule.is_active} onCheckedChange={() => handleToggleActive(rule)} />
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => setDeletingId(rule.id)}>
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
      <ConfirmDestructiveDialog
        open={!!deletingId}
        onConfirm={() => { if (deletingId) deleteRule.mutate(deletingId, { onSuccess: () => setDeletingId(null) }); }}
        onCancel={() => setDeletingId(null)}
        title="Delete Disqualification Rule"
        description="Are you sure you want to delete this disqualification rule? This action cannot be undone."
        confirmLabel="Delete Rule"
        isLoading={deleteRule.isPending}
      />
    </Card>
  );
}
