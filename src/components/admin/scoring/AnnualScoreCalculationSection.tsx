import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Save, History, Copy } from 'lucide-react';
import { useCompanies } from '@/hooks/useCompanies';
import {
  useAnnualScoreConfig,
  useAnnualScoreVersionHistory,
  useSaveAnnualScoreConfig,
  useCopyAnnualScoreFromYear,
  type AnnualScoreMethod,
  type AnnualScoreScope,
} from '@/hooks/useAnnualScoreConfig';
import {
  useKnownAssessmentYears,
  generateAssessmentYears,
} from '@/hooks/useIncrementEligibility';

// Fiscal year Jul-Jun → checkbox order
const FISCAL_MONTHS: { value: number; label: string }[] = [
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
];

const METHOD_OPTIONS: { value: AnnualScoreMethod; label: string; description: string }[] = [
  { value: 'avg_all', label: 'Average of All Monthly Scores', description: 'Annual PMS Score = arithmetic mean of every monthly final_score in the assessment period.' },
  { value: 'last_6', label: 'Last 6 Months Average', description: 'Annual PMS Score = average of monthly final_scores for the last 6 months of the assessment period.' },
  { value: 'custom', label: 'Custom Month Selection', description: 'Annual PMS Score = average of monthly final_scores for the selected months only.' },
];

export function AnnualScoreCalculationSection() {
  const { data: companies = [] } = useCompanies();
  const { data: knownYears = [] } = useKnownAssessmentYears();
  const years = useMemo(() => {
    const seeded = generateAssessmentYears(4);
    return Array.from(new Set([...knownYears, ...seeded])).sort().reverse();
  }, [knownYears]);

  const [assessmentYear, setAssessmentYear] = useState<string>('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [copyFromYear, setCopyFromYear] = useState<string>('');

  useEffect(() => {
    if (!assessmentYear && years.length > 0) setAssessmentYear(years[0]);
  }, [years, assessmentYear]);

  const scope: AnnualScoreScope | null = assessmentYear
    ? { assessment_year: assessmentYear, company_id: companyId }
    : null;

  const { data: config, isLoading } = useAnnualScoreConfig(scope);
  const { data: history = [] } = useAnnualScoreVersionHistory(scope);
  const save = useSaveAnnualScoreConfig();
  const copyFrom = useCopyAnnualScoreFromYear();

  const [method, setMethod] = useState<AnnualScoreMethod>('avg_all');
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

  useEffect(() => {
    if (config) {
      setMethod(config.method);
      setSelectedMonths(config.custom_months ?? []);
    } else {
      setMethod('avg_all');
      setSelectedMonths([]);
    }
  }, [config]);

  const toggleMonth = (m: number) => {
    setSelectedMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b),
    );
  };

  const isValid = method !== 'custom' || selectedMonths.length > 0;
  const isDirty = !config
    || config.method !== method
    || JSON.stringify(config.custom_months ?? []) !== JSON.stringify(method === 'custom' ? selectedMonths : []);

  const handleSave = () => {
    if (!scope || !isValid) return;
    save.mutate({
      scope,
      method,
      custom_months: method === 'custom' ? selectedMonths : null,
      existing: config ?? null,
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
          <TrendingUp className="h-5 w-5" />
          Annual Score Calculation
        </CardTitle>
        <CardDescription>
          Define how monthly PMS scores roll up into an annual score for each assessment year and company scope.
          Used by the Increment Calculation engine. Only one method can be active per scope at a time.
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
            <Select
              value={companyId ?? '__all__'}
              onValueChange={(v) => setCompanyId(v === '__all__' ? null : v)}
            >
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
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                disabled={!copyFromYear || copyFrom.isPending}
                aria-label="Copy from selected year"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Method picker */}
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Calculation Method</h3>
            {config && (
              <Badge variant="secondary">v{config.version} · active</Badge>
            )}
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as AnnualScoreMethod)} className="space-y-3">
              {METHOD_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
                    method === opt.value ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <RadioGroupItem value={opt.value} id={`asm-${opt.value}`} className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor={`asm-${opt.value}`} className="font-medium">{opt.label}</Label>
                    <p className="mt-0.5 text-sm text-muted-foreground">{opt.description}</p>
                    {opt.value === 'custom' && method === 'custom' && (
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {FISCAL_MONTHS.map((m) => (
                          <label key={m.value} className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted/50">
                            <Checkbox
                              checked={selectedMonths.includes(m.value)}
                              onCheckedChange={() => toggleMonth(m.value)}
                            />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    )}
                    {opt.value === 'custom' && method === 'custom' && selectedMonths.length === 0 && (
                      <p className="mt-2 text-xs text-destructive">Select at least one month.</p>
                    )}
                  </div>
                </div>
              ))}
            </RadioGroup>
          )}

          <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
            <Button onClick={handleSave} disabled={!isDirty || !isValid || save.isPending} className="gap-2">
              <Save className="h-4 w-4" />
              {save.isPending ? 'Saving…' : 'Save Configuration'}
            </Button>
          </div>
        </div>

        {/* Version history */}
        {history.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4" /> Version History
            </h3>
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/50">
                  <span>
                    v{h.version} · {METHOD_OPTIONS.find((o) => o.value === h.method)?.label}
                    {h.method === 'custom' && h.custom_months && ` (${h.custom_months.length} months)`}
                  </span>
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