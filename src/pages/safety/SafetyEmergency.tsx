import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Siren, Loader2, ArrowRight, Phone } from 'lucide-react';
import { useDrills } from '@/hooks/useSafetyEmergency';
import { useSafetyRealtimeSync } from '@/hooks/useSafetyRealtimeSync';
import {
  SAFETY_DRILL_STATUSES,
  SAFETY_DRILL_STATUS_LABEL,
  SAFETY_DRILL_TYPES,
  SAFETY_DRILL_TYPE_LABEL,
  type SafetyDrillStatus,
  type SafetyDrillType,
  formatEvacuationDuration,
} from '@/lib/safetyEmergency';
import { DrillStatusBadge } from '@/components/safety/DrillStatusBadge';
import { format } from 'date-fns';

/**
 * Emergency Response hub — drill list with quick filters and shortcuts to
 * the contact directory + new drill wizard.
 */
export default function SafetyEmergency() {
  // Scoped realtime: drills + participants + findings + contacts.
  useSafetyRealtimeSync(true, [
    'safety_emergency_drills',
    'safety_drill_participants',
    'safety_drill_findings',
    'safety_emergency_contacts',
  ]);
  const [status, setStatus] = useState<SafetyDrillStatus | 'all'>('all');
  const [type, setType] = useState<SafetyDrillType | 'all'>('all');
  const { data: drills = [], isLoading } = useDrills({ status, type });

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-destructive/10 text-destructive">
          <Siren className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Emergency Response</h1>
          <p className="text-muted-foreground">
            Plan and run drills, muster participants, and keep emergency contacts current.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/safety/emergency/contacts"><Phone className="h-4 w-4 mr-2" /> Contacts</Link>
        </Button>
        <Button asChild>
          <Link to="/safety/emergency/drills/new"><Plus className="h-4 w-4 mr-2" /> Schedule Drill</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center gap-3">
          <div className="flex-1">
            <CardTitle className="text-base">Drills</CardTitle>
            <CardDescription>{drills.length} drill(s) match the filters.</CardDescription>
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as SafetyDrillStatus | 'all')}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SAFETY_DRILL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{SAFETY_DRILL_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => setType(v as SafetyDrillType | 'all')}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {SAFETY_DRILL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{SAFETY_DRILL_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : drills.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No drills yet.</div>
          ) : (
            drills.map((d) => (
              <Link
                key={d.id}
                to={`/safety/emergency/drills/${d.id}`}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{d.drill_code}</span>
                    <Badge variant="outline">{SAFETY_DRILL_TYPE_LABEL[d.type]}</Badge>
                    <DrillStatusBadge status={d.status} />
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{d.scenario}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Scheduled {format(new Date(d.scheduled_at), 'PPp')}
                    {d.evacuation_seconds !== null && (
                      <> · Evac {formatEvacuationDuration(d.evacuation_seconds)}</>
                    )}
                    {d.score !== null && <> · Score {d.score}</>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
