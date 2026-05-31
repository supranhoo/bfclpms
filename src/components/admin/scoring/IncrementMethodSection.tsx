import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, Save, History, Copy, Plus, Trash2 } from 'lucide-react';
import { useCompanies } from '@/hooks/useCompanies';
import {
  useIncrementMethodConfig,
  useIncrementMethodSlabs,
  useIncrementMethodVersionHistory,
  useSaveIncrementMethod,
  useCopyIncrementMethodFromYear,
  type IncrementMethodType,
  type IncrementMethodScope,
  type SlabDraft,
} from '@/hooks/useIncrementMethod';
import {
  useKnownAssessmentYears,
  generateAssessmentYears,
} from '@/hooks/useIncrementEligibility';
import { getCurrentAssessmentYear } from '@/lib/assessmentYear';

const METHOD_OPTIONS: { value: IncrementMethodType; label: string; description: string }[] = [
  { value: 'full', label: 'Full Increment', description: 'Employee receives the complete increment percentage from the applicable slab.' },
  { value: 'prorated_doj', label: 'Prorated by Date of Joining', description: 'Eligible % = (Configured Increment % ÷ 12) × Months Served in the assessment year.' },
  { value: 'custom', label: 'Custom Service-Period Slabs', description: 'Apply a configurable percentage of the slab based on the employee\'s months of service.' },
];

const DEFAULT_SLABS: SlabDraft[] = [
  { from_months: 0, to_months: 3, percent_of_slab: 0 },
  { from_months: 3, to_months: 6, percent_of_slab: 50 },
  { from_months: 6, to_months: 9, percent_of_slab: 75 },
  { from_months: 9, to_months: null, percent_of_slab: 100 },
];

const DEFAULT_CUTOFF_DAY = 15;

export function IncrementMethodSection() {
  const { data: companies = [] } = useCompanies();
  const { data: knownYears = [] } = useKnownAssessmentYears();
  const years = useMemo(() => {
    const seeded = generateAssessmentYears(4);
    return Array.from(new Set([...knownYears, ...seeded])).sort().reverse();
  }, [knownYears]);

  const [assessmentYear, setAssessmentYear] = useState<string>(getCurrentAssessmentYear());
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [copyFromYear, setCopyFromYear] = useState<string>('');

  useEffect(() => {
    if (!assessmentYear && years.length > 0) setAssessmentYear(getCurrentAssessmentYear());
  }, [years, assessmentYear]);

  const scope: IncrementMethodScope | null = assessmentYear
    ? { assessment_year: assessmentYear, company_id: companyId }
    : null;

  const { data: config, isLoading } = useIncrementMethodConfig(scope);
  const { data: existingSlabs = [] } = useIncrementMethodSlabs(config?.id ?? null);
  const { data: history = [] } = useIncrementMethodVersionHistory(scope);
  const save = useSaveIncrementMethod();
  const copyFrom = useCopyIncrementMethodFromYear();

  const [method, setMethod] = useState<IncrementMethodType>('full');
  const [slabs, setSlabs] = useState<SlabDraft[]>(DEFAULT_SLABS);
  const [cutoffDay, setCutoffDay] = useState<number>(DEFAULT_CUTOFF_DAY);

  useEffect(() => {
    if (config) {
      setMethod(config.method);
      setCutoffDay(config.joining_month_cutoff_day ?? DEFAULT_CUTOFF_DAY);
    } else {
      setMethod('full');
      setCutoffDay(DEFAULT_CUTOFF_DAY);
    }
  }, [config]);

  useEffect(() => {
    if (existingSlabs.length > 0) {
      setSlabs(existingSlabs.map((s) => ({
        from_months: Number(s.from_months),
        to_months: s.to_months === null ? null : Number(s.to_months),
        percent_of_slab: Number(s.percent_of_slab),
      })));
    } else if (config?.method !== 'custom') {
      setSlabs(DEFAULT_SLABS);
    }
  }, [existingSlabs, config]);

  const addSlab = () => setSlabs((s) => [...s, { from_months: 0, to_months: null, percent_of_slab: 0 }]);
  const removeSlab = (idx: number) => setSlabs((s) => s.filter((_, i) => i !== idx));
  const updateSlab = (idx: number, patch: Partial<SlabDraft>) =>
    setSlabs((s) => s.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const slabErrors: string[] = [];
  if (method === 'custom') {
    if (slabs.length === 0) slabErrors.push('Add at least one slab.');
    slabs.forEach((s, i) => {
      if (s.percent_of_slab < 0 || s.percent_of_slab > 100) slabErrors.push(`Row ${i + 1}: percent must be 0-100.`);
      if (s.to_months !== null && s.to_months <= s.from_months) slabErrors.push(`Row ${i + 1}: To months must be greater than From.`);
    });
  }
  // Cutoff applies to ALL methods now — always validate.
  const cutoffValid = Number.isInteger(cutoffDay) && cutoffDay >= 1 && cutoffDay <= 31;
  const isValid = (method !== 'custom' || slabErrors.length === 0) && cutoffValid;

  const handleSave = () => {
    if (!scope || !isValid) return;
    save.mutate({
      scope,
      method,
      slabs: method === 'custom' ? slabs : [],
      existing: config ?? null,
      joiningMonthCutoffDay: cutoffDay,
    });
  };

  const handleCopy = () => {
    if (!scope || !copyFromYear) return;
    copyFrom.mutate({ fromYear: copyFromYear, toScope: scope });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Increment Method
        </CardTitle>
        <CardDescription>
          Choose how the increment percentage from the slab is applied to each employee. Works in tandem with the
          Ineligibility Criteria tab — those rules can disqualify an employee; for everyone who is not disqualified, this method determines the percentage applied.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Header filters */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Assessment Year</Label>
            <Select value={assessmentYear} onValueChange={setAssessmentYear}>
              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Company</Label>
            <Select value={companyId ?? '__all__'} onValueChange={(v) => setCompanyId(v === '__all__' ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All companies</SelectItem>
                {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Copy from previous year</Label>
            <div className="flex gap-2">
              <Select value={copyFromYear} onValueChange={setCopyFromYear}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select source year" /></SelectTrigger>
                <SelectContent>
                  {years.filter((y) => y !== assessmentYear).map((y) =>
                    <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handleCopy} disabled={!copyFromYear || copyFrom.isPending} aria-label="Copy from selected year">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Joining Month Cutoff Day — applies to ALL methods */}
        <div className="rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Joining Month Cutoff Day</h3>
            <Badge variant="outline" className="text-[10px]">Applies to all methods</Badge>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Day of month (1–31) that decides whether the employee's joining month
            is counted in their AY-bounded service. If DOJ day &lt; cutoff, the
            joining month is counted; if DOJ day ≥ cutoff, the joining month is
            excluded and counting starts from the next month. This whole-month
            count drives <strong>Final Eligible Months</strong>, prorated-DOJ
            math, and custom-slab matching.
          </p>
          <div className="flex items-center gap-3">
            <Input
              id="joining-month-cutoff"
              type="number"
              min={1}
              max={31}
              step={1}
              value={Number.isFinite(cutoffDay) ? cutoffDay : ''}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setCutoffDay(Number.isFinite(n) ? n : NaN);
              }}
              className="h-9 w-28"
              aria-invalid={!cutoffValid}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCutoffDay(DEFAULT_CUTOFF_DAY)}
              disabled={cutoffDay === DEFAULT_CUTOFF_DAY}
            >
              Reset to {DEFAULT_CUTOFF_DAY}
            </Button>
          </div>
          {!cutoffValid && (
            <p className="mt-1 text-xs text-destructive">Enter a whole number between 1 and 31.</p>
          )}
        </div>

        {/* Method picker */}
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Increment Method</h3>
            {config && <Badge variant="secondary">v{config.version} · active</Badge>}
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as IncrementMethodType)} className="space-y-3">
              {METHOD_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-md border p-3 ${method === opt.value ? 'border-primary bg-primary/5' : ''}`}
                >
                  <RadioGroupItem value={opt.value} id={`im-${opt.value}`} className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor={`im-${opt.value}`} className="font-medium">{opt.label}</Label>
                    <p className="mt-0.5 text-sm text-muted-foreground">{opt.description}</p>
                    {opt.value === 'custom' && method === 'custom' && (
                      <div className="mt-3 space-y-3">
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-32">From (months)</TableHead>
                                <TableHead className="w-32">To (months)</TableHead>
                                <TableHead className="w-32">% of slab</TableHead>
                                <TableHead className="w-12"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {slabs.map((s, i) => (
                                <TableRow key={i}>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={s.from_months}
                                      onChange={(e) => updateSlab(i, { from_months: Number(e.target.value) })}
                                      className="h-9"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min={0}
                                      placeholder="∞"
                                      value={s.to_months ?? ''}
                                      onChange={(e) =>
                                        updateSlab(i, {
                                          to_months: e.target.value === '' ? null : Number(e.target.value),
                                        })
                                      }
                                      className="h-9"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={s.percent_of_slab}
                                      onChange={(e) => updateSlab(i, { percent_of_slab: Number(e.target.value) })}
                                      className="h-9"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => removeSlab(i)} aria-label="Remove slab">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <Button variant="outline" size="sm" onClick={addSlab} className="gap-2">
                          <Plus className="h-4 w-4" /> Add Slab
                        </Button>
                        {slabErrors.length > 0 && (
                          <ul className="text-xs text-destructive">
                            {slabErrors.map((e, i) => <li key={i}>• {e}</li>)}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </RadioGroup>
          )}

          <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
            <Button onClick={handleSave} disabled={!isValid || save.isPending} className="gap-2">
              <Save className="h-4 w-4" />
              {save.isPending ? 'Saving…' : 'Save Configuration'}
            </Button>
          </div>
        </div>

        {history.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4" /> Version History
            </h3>
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/50">
                  <span>v{h.version} · {METHOD_OPTIONS.find((o) => o.value === h.method)?.label}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={h.status === 'active' ? 'default' : 'outline'}>{h.status}</Badge>
                    {new Date(h.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}