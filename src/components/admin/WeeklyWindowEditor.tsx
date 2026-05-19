import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Save, CalendarRange } from 'lucide-react';
import { toast } from 'sonner';
import {
  useWeeklyReviewWindowsResolved,
  useUpdateWeeklyReviewWindows,
} from '@/hooks/useFrequencyConfig';
import { WeeklyReviewWindow } from '@/lib/frequencyUtils';

type DraftWindow = { start: string; end: string; nextMonth: boolean };

const WEEK_KEYS = ['week_1', 'week_2', 'week_3', 'week_4', 'week_5'] as const;

function toDraft(w: WeeklyReviewWindow | undefined): DraftWindow {
  return {
    start: w ? String(w.start) : '',
    end: w ? String(w.end) : '',
    nextMonth: !!w?.nextMonth,
  };
}

/**
 * Admin editor for Weekly review windows (frequency_config.review_window_rules).
 * Each row defines the day-of-month range during which employees can submit
 * for that week. Week 5 must be flagged "next month" (its window falls in the
 * month after the review month).
 */
export function WeeklyWindowEditor() {
  const resolved = useWeeklyReviewWindowsResolved();
  const updateMutation = useUpdateWeeklyReviewWindows();

  const [drafts, setDrafts] = useState<Record<string, DraftWindow>>(() =>
    Object.fromEntries(WEEK_KEYS.map(k => [k, toDraft(resolved[k])])),
  );
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setDrafts(Object.fromEntries(WEEK_KEYS.map(k => [k, toDraft(resolved[k])])));
    setHasChanges(false);
  }, [resolved]);

  const update = (key: string, patch: Partial<DraftWindow>) => {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setHasChanges(true);
  };

  const validate = (): string | null => {
    for (const k of WEEK_KEYS) {
      const d = drafts[k];
      const s = Number(d.start);
      const e = Number(d.end);
      if (!Number.isFinite(s) || !Number.isFinite(e)) return `${k}: start/end must be numbers`;
      if (s < 1 || s > 31) return `${k}: start must be 1–31`;
      if (e < 1 || e > 31) return `${k}: end must be 1–31`;
      if (s > e) return `${k}: start must be ≤ end`;
      if (k === 'week_5' && !d.nextMonth) return 'Week 5 must be flagged "next month"';
      if (k !== 'week_5' && d.nextMonth) return `${k}: only Week 5 may use "next month"`;
    }
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    const payload: Record<string, WeeklyReviewWindow> = {};
    for (const k of WEEK_KEYS) {
      const d = drafts[k];
      payload[k] = d.nextMonth
        ? { start: Number(d.start), end: Number(d.end), nextMonth: true }
        : { start: Number(d.start), end: Number(d.end) };
    }
    updateMutation.mutate(payload, {
      onSuccess: () => {
        toast.success('Weekly review windows updated');
        setHasChanges(false);
      },
      onError: (e: Error) => toast.error(e.message || 'Failed to update weekly windows'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarRange className="h-5 w-5 text-primary" />
          Weekly Review Windows
        </CardTitle>
        <CardDescription>
          Days of the month during which employees can submit Weekly KPIs for each week.
          Avoid leaving gaps between consecutive weeks, otherwise employees may have no week
          available to log on certain days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {WEEK_KEYS.map(k => {
          const d = drafts[k];
          const label = k.replace('week_', 'Week ');
          return (
            <div key={k} className="grid grid-cols-1 sm:grid-cols-[100px_1fr_1fr_auto] items-center gap-3 rounded-md border p-3">
              <Label className="font-medium">{label}</Label>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-12">Start</Label>
                <Input
                  type="number" min={1} max={31}
                  value={d.start}
                  onChange={e => update(k, { start: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-12">End</Label>
                <Input
                  type="number" min={1} max={31}
                  value={d.end}
                  onChange={e => update(k, { end: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={d.nextMonth}
                  onChange={e => update(k, { nextMonth: e.target.checked })}
                  disabled={k !== 'week_5'}
                />
                Next month
              </label>
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? 'Saving…' : 'Save Weekly Windows'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
