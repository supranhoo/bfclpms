import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, AlertTriangle, FileText, Activity } from 'lucide-react';

/**
 * SafetyHome — Phase 0 placeholder.
 * KPI tiles, recent incidents, and personal dashboards land here in Phase 1.I.
 */
export default function SafetyHome() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Safety Module</h1>
          <p className="text-muted-foreground">
            Incident reporting, investigation, and compliance — coming online phase by phase.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Incidents</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>End-to-end reporting, FSM, SLA, evidence.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Available in Phase 1.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Permits</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Work permits and high-risk approvals.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Roadmap.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Analytics</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>HSE KPIs, trend lines, BU drilldowns.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Roadmap.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}