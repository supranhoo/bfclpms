import { useEffect, useState, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  useGeneralEligibility,
  useGeneralEligibilityHistory,
  useSaveGeneralEligibility,
} from '@/hooks/useGeneralEligibility';
import { useEmployeeCategories, useEmploymentStatuses, useLevels } from '@/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
import { generateAssessmentYears, getCurrentAssessmentYear } from '@/lib/assessmentYear';
import {
  getAyEndDate,
  validateCustomAnchor,
  type ServiceAsOnMode,
} from '@/lib/serviceAnchorDate';

export default function GeneralEligibility() {
  const ayOptions = useMemo(() => generateAssessmentYears(2), []);
  const [year, setYear] = useState<string>(getCurrentAssessmentYear());
  const { data: current, isLoading } = useGeneralEligibility(year);
  const { data: history = [] } = useGeneralEligibilityHistory(year);
  const { data: categories = [] } = useEmployeeCategories();
  const { data: statuses = [] } = useEmploymentStatuses();
  const { data: levels = [] } = useLevels();
  const saveMut = useSaveGeneralEligibility();

  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [statusList, setStatusList] = useState<string[]>([]);
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [minMonths, setMinMonths] = useState<number>(0);
  const [asOnMode, setAsOnMode] = useState<ServiceAsOnMode>('run_date');
  const [customDate, setCustomDate] = useState<Date | null>(null);

  useEffect(() => {
    if (current) {
      setCategoryIds(current.category_ids);
      setStatusList(current.employment_statuses);
      setLevelIds(current.level_ids);
      setMinMonths(current.min_service_months);
      setAsOnMode((current.service_as_on_mode ?? 'run_date') as ServiceAsOnMode);
      setCustomDate(current.service_as_on_date ? new Date(current.service_as_on_date) : null);
    } else {
      setCategoryIds([]);
      setStatusList([]);
      setLevelIds([]);
      setMinMonths(0);
      setAsOnMode('run_date');
      setCustomDate(null);
    }
  }, [current?.id, year]);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const copyPrev = () => {
    const idx = ayOptions.indexOf(year);
    if (idx > 0) setYear(ayOptions[idx - 1]);
  };

  const ayEnd = useMemo(() => getAyEndDate(year), [year]);
  const customError = asOnMode === 'custom' ? validateCustomAnchor(customDate, year) : null;
  const canSave = !customError;

  const onSave = () => {
    if (customError) return;
    saveMut.mutate({
      assessment_year: year,
      category_ids: categoryIds,
      employment_statuses: statusList,
      level_ids: levelIds,
      min_service_months: minMonths,
      service_as_on_mode: asOnMode,
      service_as_on_date:
        asOnMode === 'custom' && customDate ? format(customDate, 'yyyy-MM-dd') : null,
      previousId: current?.id,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Eligibility"
        description="Define who is eligible for the annual increment cycle"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Configuration</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ayOptions.map((y) => <SelectItem key={y} value={y}>AY {y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={copyPrev}>Copy Previous Year</Button>
            <Button onClick={onSave} disabled={saveMut.isPending || !canSave}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <div>
                <Label className="mb-2 block">Employee Categories</Label>
                <div className="flex flex-wrap gap-3">
                  {categories.map((c: any) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={categoryIds.includes(c.id)}
                        onCheckedChange={() => toggle(categoryIds, setCategoryIds, c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                  {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories defined.</p>}
                </div>
              </div>
              <Separator />
              <div>
                <Label className="mb-2 block">Employment Status</Label>
                <div className="flex flex-wrap gap-3">
                  {statuses.map((s: any) => (
                    <label key={s.id ?? s.name} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={statusList.includes(s.name)}
                        onCheckedChange={() => toggle(statusList, setStatusList, s.name)}
                      />
                      {s.name}
                    </label>
                  ))}
                  {statuses.length === 0 && <p className="text-sm text-muted-foreground">No statuses defined.</p>}
                </div>
              </div>
              <Separator />
              <div>
                <Label className="mb-2 block">Levels</Label>
                <div className="flex flex-wrap gap-3">
                  {levels.map((l: any) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={levelIds.includes(l.id)}
                        onCheckedChange={() => toggle(levelIds, setLevelIds, l.id)}
                      />
                      {l.name}
                    </label>
                  ))}
                  {levels.length === 0 && <p className="text-sm text-muted-foreground">No levels defined.</p>}
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Label htmlFor="min-months" className="shrink-0">Minimum Service (months)</Label>
                  <Input
                    id="min-months"
                    type="number"
                    min={0}
                    value={minMonths}
                    onChange={(e) => setMinMonths(Number(e.target.value) || 0)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">evaluated as of</span>
                  <RadioGroup
                    value={asOnMode}
                    onValueChange={(v) => setAsOnMode(v as ServiceAsOnMode)}
                    className="flex flex-wrap items-center gap-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="run_date" id="anchor-run" />
                      Run date
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="ay_end" id="anchor-ay" />
                      AY end ({format(ayEnd, 'dd-MMM-yyyy')})
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="custom" id="anchor-custom" />
                      Custom date
                    </label>
                  </RadioGroup>
                  {asOnMode === 'custom' && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-[200px] justify-start text-left font-normal',
                            !customDate && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customDate ? format(customDate, 'dd-MMM-yyyy') : 'Pick date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={customDate ?? undefined}
                          onSelect={(d) => setCustomDate(d ?? null)}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {customError && (
                  <p className="text-sm text-destructive">{customError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Determines the cutoff date used to compute each employee's tenure against the minimum-service rule.
                  Choose <strong>AY end</strong> or <strong>Custom date</strong> for deterministic, auditable re-runs.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Version History</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={h.status === 'approved' ? 'default' : 'secondary'}>v{h.version}</Badge>
                    <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  <span className="text-xs">
                    {h.category_ids.length} categories · {h.employment_statuses.length} statuses · {h.level_ids.length} levels · {h.min_service_months}mo
                    {' · '}
                    {h.service_as_on_mode === 'custom' && h.service_as_on_date
                      ? `as of ${format(new Date(h.service_as_on_date), 'dd-MMM-yyyy')}`
                      : h.service_as_on_mode === 'ay_end'
                        ? `as of AY end`
                        : 'as of run date'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}