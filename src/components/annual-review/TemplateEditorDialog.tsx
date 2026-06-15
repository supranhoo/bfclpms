import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Settings2, Sparkles, Loader2, Languages, ListOrdered } from 'lucide-react';
import { CriterionOptionsDialog } from './CriterionOptionsDialog';
import { toast } from 'sonner';
import * as svc from '@/services/annualReview/annualReviewService';
import type {
  AnnualReviewTemplate, TemplateSections, TemplateCriterion, TemplateSystemScore,
  EligibilityCriterion, SelfReviewField, AnnualReviewerRole, CriterionOption,
} from '@/types/annualReview';
import { SUPPORTED_LANGUAGES, STAGE_LABEL, STAGE_ORDER } from '@/lib/annualReview/constants';
import { BLUE_COLLAR_PRESET, BLUE_COLLAR_PRESET_META } from '@/lib/annualReview/blueCollarPreset';
import { FY_MONTHS } from '@/services/annualReview/carryKraScore';
import type { CarryKraConfig } from '@/types/annualReview';

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

function emptySections(): TemplateSections {
  return {
    settings: { enable_multilingual: false, default_language: 'en', available_languages: ['en'] },
    system_scores: [],
    criteria: [],
    eligibility_criteria: [],
    self_review_fields: [],
    translations: {},
  };
}

export function TemplateEditorDialog({
  open, onOpenChange, template, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: AnnualReviewTemplate | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sections, setSections] = useState<TemplateSections>(emptySections());

  useEffect(() => {
    if (open) {
      setName(template?.name ?? '');
      setDescription(template?.description ?? '');
      setIsActive(template?.is_active ?? true);
      setSections(template?.sections ?? emptySections());
    }
  }, [open, template]);

  const save = useMutation({
    mutationFn: () => svc.upsertTemplate({
      id: template?.id, name, description, is_active: isActive, sections,
    }),
    onSuccess: () => { toast.success('Template saved'); onSaved(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const settings = sections.settings ?? { enable_multilingual: false, default_language: 'en', available_languages: ['en'] };
  const multilingual = settings.enable_multilingual === true;
  const extraLangs = (settings.available_languages ?? []).filter((c) => c !== 'en');
  const tr = sections.translations ?? {};

  const setTr = (lang: string, key: string, value: string) => {
    setSections((s) => {
      const next = { ...(s.translations ?? {}) };
      next[lang] = { ...(next[lang] ?? {}), [key]: value };
      return { ...s, translations: next };
    });
  };

  const systemScores = sections.system_scores ?? [];
  const eligibility = sections.eligibility_criteria ?? [];
  const criteria = sections.criteria ?? [];
  const selfFields = sections.self_review_fields ?? [];

  const systemWeight = systemScores.reduce((a, x) => a + (Number(x.weight) || 0), 0);
  const criteriaWeight = criteria.reduce((a, x) => a + (Number(x.weight) || 0), 0);
  const combined = systemWeight + criteriaWeight;
  const weightOk = combined === 100;

  const applyPreset = () => {
    setName(BLUE_COLLAR_PRESET_META.name);
    setDescription(BLUE_COLLAR_PRESET_META.description);
    setSections(BLUE_COLLAR_PRESET);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Identity */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Template Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blue-Collar Comprehensive Review" className="h-10" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-10" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="t-active" />
            <Label htmlFor="t-active">Active (visible to assignment rules)</Label>
          </div>

          {/* Multilingual */}
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold flex items-center gap-2"><Languages className="h-4 w-4" />Multilingual Support</div>
                <p className="text-xs text-muted-foreground">Allow users to switch languages for form labels and descriptions.</p>
              </div>
              <Switch
                checked={multilingual}
                onCheckedChange={(v) => setSections((s) => ({
                  ...s,
                  settings: {
                    ...(s.settings ?? {}),
                    enable_multilingual: v,
                    default_language: s.settings?.default_language ?? 'en',
                    available_languages: v ? (s.settings?.available_languages?.length ? s.settings!.available_languages : ['en', 'hi']) : ['en'],
                  },
                }))}
              />
            </div>
            {multilingual && (
              <div className="space-y-1">
                <Label className="text-xs">Available Languages (en is always available)</Label>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_LANGUAGES.filter((l) => l.code !== 'en').map((l) => {
                    const on = extraLangs.includes(l.code);
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => setSections((s) => {
                          const cur = new Set(s.settings?.available_languages ?? ['en']);
                          cur.add('en');
                          on ? cur.delete(l.code) : cur.add(l.code);
                          return { ...s, settings: { ...(s.settings ?? {}), available_languages: Array.from(cur) } };
                        })}
                        className={`px-3 h-8 rounded-full text-xs border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
                      >
                        {l.label} ({l.code})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Eligibility */}
          <SectionShell
            title="Eligibility Criteria (HR Inputs)"
            onAdd={() => setSections((s) => ({
              ...s,
              eligibility_criteria: [...eligibility, { id: uid('elig'), name: '', type: 'number', operator: 'gte', expected_value: 0 }],
            }))}
            addLabel="Add Eligibility"
          >
            {eligibility.length === 0 ? <Empty msg="No eligibility criteria. Add one to gate reviews." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead className="w-32">Rule</TableHead>
                    <TableHead className="w-40">Expected Value</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligibility.map((e, i) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Input className="h-9" value={e.name} onChange={(ev) => updateAt(setSections, 'eligibility_criteria', i, { name: ev.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select value={e.type} onValueChange={(v) => updateAt(setSections, 'eligibility_criteria', i, { type: v as EligibilityCriterion['type'] })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="boolean">Yes/No</SelectItem>
                            <SelectItem value="string">Text</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={e.operator} onValueChange={(v) => updateAt(setSections, 'eligibility_criteria', i, { operator: v as EligibilityCriterion['operator'] })}>
                          <SelectTrigger className="h-9 min-w-[180px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">= Equals</SelectItem>
                            <SelectItem value="not_equals">≠ Not equals</SelectItem>
                            <SelectItem value="gt">&gt; Greater than</SelectItem>
                            <SelectItem value="gte">≥ Greater than or equal</SelectItem>
                            <SelectItem value="lt">&lt; Less than</SelectItem>
                            <SelectItem value="lte">≤ Less than or equal</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {e.type === 'boolean' ? (
                          <Select value={String(e.expected_value)} onValueChange={(v) => updateAt(setSections, 'eligibility_criteria', i, { expected_value: v === 'true' })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
                          </Select>
                        ) : (
                          <Input className="h-9" type={e.type === 'number' ? 'number' : 'text'}
                            value={String(e.expected_value ?? '')}
                            onChange={(ev) => updateAt(setSections, 'eligibility_criteria', i, { expected_value: e.type === 'number' ? Number(ev.target.value) : ev.target.value })} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeAt(setSections, 'eligibility_criteria', i)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionShell>

          {/* System Scores */}
          <SectionShell
            title="System Scores"
            onAdd={() => setSections((s) => ({
              ...s, system_scores: [...systemScores, { id: uid('sys'), name: '', weight: 0, source: 'manual' }],
            }))}
            addLabel="Add Score"
          >
            {systemScores.length === 0 ? <Empty msg="No system scores. These are pre-calculated percentage contributions (e.g. Safety, HR)." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-32">Weight (%)</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemScores.map((sc, i) => (
                    <TableRow key={sc.id}>
                      <TableCell>
                        <Input className="h-9" value={sc.name} onChange={(ev) => updateAt(setSections, 'system_scores', i, { name: ev.target.value })} />
                      </TableCell>
                      <TableCell className="space-y-2">
                        <Select
                          value={(sc.source as string) ?? 'manual'}
                          onValueChange={(v) => updateAt(setSections, 'system_scores', i, {
                            source: v,
                            carry_config: v === 'carry_kra'
                              ? (sc.carry_config ?? { aggregation: 'overall_avg', excludeNa: true })
                              : undefined,
                          })}
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual entry</SelectItem>
                            <SelectItem value="safety">Safety</SelectItem>
                            <SelectItem value="hr">HR</SelectItem>
                            <SelectItem value="env">Environment</SelectItem>
                            <SelectItem value="carry_kra">Carry KRA Score (auto-fetched)</SelectItem>
                          </SelectContent>
                        </Select>
                        {sc.source === 'carry_kra' && (
                          <CarryKraConfigEditor
                            cfg={sc.carry_config ?? { aggregation: 'overall_avg', excludeNa: true }}
                            onChange={(cfg) => updateAt(setSections, 'system_scores', i, { carry_config: cfg })}
                          />
                        )}
                      </TableCell>
                      <TableCell><Input className="h-9" type="number" value={sc.weight} onChange={(ev) => updateAt(setSections, 'system_scores', i, { weight: Number(ev.target.value) })} /></TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => removeAt(setSections, 'system_scores', i)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionShell>

          {/* Criteria */}
          <SectionShell
            title="Criteria"
            titleExtra={
              <Badge variant={weightOk ? 'default' : 'destructive'} className={weightOk ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' : ''}>
                Combined Weight (System + Criteria): {combined}% {weightOk ? '✓' : '— must equal 100%'}
              </Badge>
            }
            extraActions={
              <Button variant="outline" size="sm" onClick={applyPreset} className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Auto-Populate Blue-Collar Template
              </Button>
            }
            onAdd={() => setSections((s) => ({
              ...s, criteria: [...criteria, {
                id: uid('crit'), name: '', description: '', weight: 0,
                reviewer_stages: ['self', 'manager', 'skip_manager', 'bu_head', 'hr'],
                enable_remarks: true, enable_evidence: false, options: [],
              }],
            }))}
            addLabel="Add Criterion"
          >
            {criteria.length === 0 ? <Empty msg="No criteria yet. Add one, or use Auto-Populate." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24">Weight</TableHead>
                    <TableHead className="w-44">Feedback Config</TableHead>
                    <TableHead className="w-28">Options</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criteria.map((c, i) => (
                    <TableRow key={c.id}>
                      <TableCell className="align-top space-y-1">
                        <Input className="h-9" value={c.name} onChange={(ev) => updateAt(setSections, 'criteria', i, { name: ev.target.value })} />
                        {multilingual && extraLangs.map((lang) => (
                          <Input key={lang} className="h-9" dir="auto"
                            placeholder={`${lang.toUpperCase()} name`}
                            value={tr[lang]?.[`criterion:${c.id}:name`] ?? ''}
                            onChange={(ev) => setTr(lang, `criterion:${c.id}:name`, ev.target.value)} />
                        ))}
                      </TableCell>
                      <TableCell className="align-top space-y-1">
                        <Textarea rows={2} value={c.description ?? ''} onChange={(ev) => updateAt(setSections, 'criteria', i, { description: ev.target.value })} />
                        {multilingual && extraLangs.map((lang) => (
                          <Textarea key={lang} rows={2} dir="auto"
                            placeholder={`${lang.toUpperCase()} description`}
                            value={tr[lang]?.[`criterion:${c.id}:description`] ?? ''}
                            onChange={(ev) => setTr(lang, `criterion:${c.id}:description`, ev.target.value)} />
                        ))}
                      </TableCell>
                      <TableCell className="align-top">
                        <Input className="h-9" type="number" value={c.weight} onChange={(ev) => updateAt(setSections, 'criteria', i, { weight: Number(ev.target.value) })} />
                      </TableCell>
                      <TableCell className="align-top">
                        <CriterionConfigPopover criterion={c} onChange={(patch) => updateAt(setSections, 'criteria', i, patch)} />
                      </TableCell>
                      <TableCell className="align-top">
                        <CriterionOptionsButton
                          criterion={c}
                          onChange={(patch) => updateAt(setSections, 'criteria', i, patch)}
                          multilingual={multilingual}
                          extraLangs={extraLangs}
                          getTr={(lang, key) => tr[lang]?.[key] ?? ''}
                          setTr={setTr}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Button size="icon" variant="ghost" onClick={() => removeAt(setSections, 'criteria', i)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionShell>

          {/* Self Review Fields */}
          <SectionShell
            title="Self Review Fields"
            onAdd={() => setSections((s) => ({
              ...s, self_review_fields: [...selfFields, { id: uid('f'), label: '', placeholder: '', required: false }],
            }))}
            addLabel="Add Field"
          >
            {selfFields.length === 0 ? <Empty msg="No self-review fields." /> : (
              <div className="space-y-3">
                {selfFields.map((f, i) => (
                  <Card key={f.id} className="p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto] items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Field Label *</Label>
                        <Input className="h-9" value={f.label} onChange={(ev) => updateAt(setSections, 'self_review_fields', i, { label: ev.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Placeholder</Label>
                        <Input className="h-9" value={f.placeholder ?? ''} onChange={(ev) => updateAt(setSections, 'self_review_fields', i, { placeholder: ev.target.value })} />
                      </div>
                      <div className="flex items-center gap-2 px-1">
                        <Switch checked={!!f.required} onCheckedChange={(v) => updateAt(setSections, 'self_review_fields', i, { required: v })} id={`req-${f.id}`} />
                        <Label htmlFor={`req-${f.id}`} className="text-xs">Required</Label>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => moveAt(setSections, 'self_review_fields', i, -1)} aria-label="Move up">↑</Button>
                        <Button size="icon" variant="ghost" onClick={() => moveAt(setSections, 'self_review_fields', i, +1)} aria-label="Move down">↓</Button>
                        <Button size="icon" variant="ghost" onClick={() => removeAt(setSections, 'self_review_fields', i)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {multilingual && extraLangs.length > 0 && (
                      <div className="mt-2 pl-3 border-l-2 border-primary/30 space-y-2">
                        <p className="text-xs text-muted-foreground">Translations:</p>
                        {extraLangs.map((lang) => (
                          <div key={lang} className="grid gap-2 md:grid-cols-2">
                            <Input className="h-9" dir="auto" placeholder={`${lang.toUpperCase()} label`}
                              value={tr[lang]?.[`field:${f.id}:label`] ?? ''}
                              onChange={(ev) => setTr(lang, `field:${f.id}:label`, ev.target.value)} />
                            <Input className="h-9" dir="auto" placeholder={`${lang.toUpperCase()} placeholder`}
                              value={tr[lang]?.[`field:${f.id}:placeholder`] ?? ''}
                              onChange={(ev) => setTr(lang, `field:${f.id}:placeholder`, ev.target.value)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </SectionShell>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!name || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- helpers ----------

function updateAt<K extends keyof TemplateSections>(
  setSections: React.Dispatch<React.SetStateAction<TemplateSections>>,
  key: K,
  index: number,
  patch: Record<string, unknown>,
) {
  setSections((s) => {
    const arr = ([...((s[key] as unknown as Array<Record<string, unknown>>) ?? [])]);
    arr[index] = { ...arr[index], ...patch };
    return { ...s, [key]: arr } as TemplateSections;
  });
}

function removeAt<K extends keyof TemplateSections>(
  setSections: React.Dispatch<React.SetStateAction<TemplateSections>>, key: K, index: number,
) {
  setSections((s) => {
    const arr = [...((s[key] as unknown as unknown[]) ?? [])];
    arr.splice(index, 1);
    return { ...s, [key]: arr } as TemplateSections;
  });
}

function moveAt<K extends keyof TemplateSections>(
  setSections: React.Dispatch<React.SetStateAction<TemplateSections>>, key: K, index: number, dir: -1 | 1,
) {
  setSections((s) => {
    const arr = [...((s[key] as unknown as unknown[]) ?? [])];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return s;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    return { ...s, [key]: arr } as TemplateSections;
  });
}

function SectionShell({
  title, titleExtra, extraActions, addLabel, onAdd, children,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  extraActions?: React.ReactNode;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold">{title}</h3>
          {titleExtra}
        </div>
        <div className="flex items-center gap-2">
          {extraActions}
          <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> {addLabel}
          </Button>
        </div>
      </div>
      {children}
    </Card>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded">{msg}</p>;
}

function CriterionConfigPopover({
  criterion, onChange,
}: { criterion: TemplateCriterion; onChange: (patch: Partial<TemplateCriterion>) => void }) {
  const stages = new Set(criterion.reviewer_stages ?? []);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 w-full justify-start">
          <Settings2 className="h-4 w-4" /> Configure
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div>
          <p className="text-xs font-semibold mb-2">Reviewer Stages</p>
          <div className="space-y-1.5">
            {STAGE_ORDER.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={stages.has(s)}
                  onCheckedChange={(v) => {
                    const next = new Set(stages);
                    v ? next.add(s) : next.delete(s);
                    onChange({ reviewer_stages: Array.from(next) as AnnualReviewerRole[] });
                  }}
                /> {STAGE_LABEL[s]}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 border-t pt-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!criterion.enable_remarks} onCheckedChange={(v) => onChange({ enable_remarks: v })} /> Enable Remarks
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!criterion.enable_evidence} onCheckedChange={(v) => onChange({ enable_evidence: v })} /> Enable Evidence Upload
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!criterion.evidence_required} onCheckedChange={(v) => onChange({ evidence_required: v })} disabled={!criterion.enable_evidence} /> Evidence Required
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CriterionOptionsButton({
  criterion, onChange, multilingual, extraLangs, getTr, setTr,
}: {
  criterion: TemplateCriterion;
  onChange: (patch: Partial<TemplateCriterion>) => void;
  multilingual: boolean;
  extraLangs: string[];
  getTr: (lang: string, key: string) => string;
  setTr: (lang: string, key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = (criterion.options ?? []).length;
  return (
    <>
      <Button variant="outline" size="sm" className="h-9 gap-1.5 w-full justify-start" onClick={() => setOpen(true)}>
        <ListOrdered className="h-4 w-4" /> Manage <Badge variant="secondary" className="ml-auto">{count}</Badge>
      </Button>
      {open && (
        <CriterionOptionsDialog
          open={open}
          onOpenChange={setOpen}
          criterion={criterion}
          onSave={(options) => onChange({ options })}
          multilingual={multilingual}
          extraLangs={extraLangs}
          getTr={getTr}
          setTr={setTr}
        />
      )}
    </>
  );
}

function CarryKraConfigEditor({
  cfg, onChange,
}: {
  cfg: CarryKraConfig;
  onChange: (cfg: CarryKraConfig) => void;
}) {
  const months = cfg.months ?? [];
  const toggleMonth = (m: string) => {
    const set = new Set(months);
    set.has(m) ? set.delete(m) : set.add(m);
    onChange({ ...cfg, months: Array.from(set) });
  };
  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">Aggregation</Label>
        <Select
          value={cfg.aggregation}
          onValueChange={(v) => onChange({ ...cfg, aggregation: v as CarryKraConfig['aggregation'] })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="overall_avg">Overall (all 12 months)</SelectItem>
            <SelectItem value="last_n_months">Last N months</SelectItem>
            <SelectItem value="selected_months">Selected months</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {cfg.aggregation === 'last_n_months' && (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">N (months)</Label>
          <Input
            type="number" min={1} max={12}
            className="h-8 w-20 text-xs"
            value={cfg.lastN ?? 6}
            onChange={(e) => onChange({ ...cfg, lastN: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
          />
        </div>
      )}
      {cfg.aggregation === 'selected_months' && (
        <div className="flex flex-wrap gap-1.5">
          {FY_MONTHS.map((m) => {
            const on = months.includes(m);
            return (
              <button
                type="button" key={m}
                onClick={() => toggleMonth(m)}
                className={`px-2 h-6 rounded-full border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
              >{m.slice(0, 3)}</button>
            );
          })}
        </div>
      )}
      <label className="flex items-center gap-2">
        <Checkbox
          checked={cfg.excludeNa !== false}
          onCheckedChange={(v) => onChange({ ...cfg, excludeNa: v === true })}
        /> Exclude N/A KPIs
      </label>
      <p className="text-[10px] text-muted-foreground leading-snug">
        Carry value = average of monthly KRA scores from this employee's PMS history (final → auditor → manager → self).
      </p>
    </div>
  );
}