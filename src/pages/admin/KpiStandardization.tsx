import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScanSearch, BookCheck, Wrench } from 'lucide-react';
import { BuildRegistryTab } from '@/components/admin/kpi-standardization/BuildRegistryTab';
import { ReviewRegistryTab } from '@/components/admin/kpi-standardization/ReviewRegistryTab';
import { CorrectMayKpisTab } from '@/components/admin/kpi-standardization/CorrectMayKpisTab';

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
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
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
      </Tabs>
    </div>
  );
}