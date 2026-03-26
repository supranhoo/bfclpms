import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, GraduationCap } from 'lucide-react';
import JdManagerTab from '@/components/admin/JdManagerTab';
import CompetencyManagerTab from '@/components/admin/CompetencyManagerTab';

export default function EmployeeDevelopment() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Development"
        description="Manage Job Descriptions and Skill Competencies across the organization."
      />

      <Tabs defaultValue="jd" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jd" className="gap-1">
            <FileText className="h-4 w-4" /> Job Descriptions
          </TabsTrigger>
          <TabsTrigger value="competency" className="gap-1">
            <GraduationCap className="h-4 w-4" /> Skill Competency
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jd">
          <JdManagerTab />
        </TabsContent>

        <TabsContent value="competency">
          <CompetencyManagerTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
