import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScanSearch, BookCheck, Wrench, ShieldCheck, Activity, Sparkles, History } from 'lucide-react';
import { BuildRegistryTab } from '@/components/admin/kpi-standardization/BuildRegistryTab';
import { ReviewRegistryTab } from '@/components/admin/kpi-standardization/ReviewRegistryTab';
import { CorrectMayKpisTab } from '@/components/admin/kpi-standardization/CorrectMayKpisTab';
import { GovernanceTab } from '@/components/admin/kpi-standardization/GovernanceTab';
import { HealthCoverageTab } from '@/components/admin/kpi-standardization/HealthCoverageTab';
import { SuggestionsTab } from '@/components/admin/kpi-standardization/SuggestionsTab';
import { HistoryUndoTab } from '@/components/admin/kpi-standardization/HistoryUndoTab';

export default function KpiStandardization() {
  const [activeTab, setActiveTab] = useState('build');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">KPI Standardization</h1>
        <p className="text-muted-foreground mt-1">
          Build a canonical KPI registry, review entries, and correct May 2026+ KPI names.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-7 w-full max-w-5xl">
          <TabsTrigger value="build" className="flex items-center gap-1.5">
            <ScanSearch className="h-4 w-4" />
            Build Registry
          </TabsTrigger>
          <TabsTrigger value="review" className="flex items-center gap-1.5">
            <BookCheck className="h-4 w-4" />
            Review Registry
          </TabsTrigger>
          <TabsTrigger value="correct" className="flex items-center gap-1.5">
            <Wrench className="h-4 w-4" />
            Correct May KPIs
          </TabsTrigger>
          <TabsTrigger value="governance" className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Governance
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            Health & Coverage
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            <History className="h-4 w-4" />
            History &amp; Undo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="build" className="mt-4">
          <BuildRegistryTab onRegistryUpdated={() => setActiveTab('review')} />
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <ReviewRegistryTab />
        </TabsContent>

        <TabsContent value="correct" className="mt-4">
          <CorrectMayKpisTab />
        </TabsContent>

        <TabsContent value="governance" className="mt-4">
          <GovernanceTab />
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <HealthCoverageTab />
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          <SuggestionsTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryUndoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}