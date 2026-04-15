import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings2, Shield, Users } from 'lucide-react';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useAccessProfiles } from '@/hooks/useAccessProfiles';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfilesTab, MappingTab, AssignmentTab } from './AccessProfilesManager';

export function MenuAccessTab() {
  const { configs, isLoading: menuLoading } = useMenuAccess();
  const {
    profiles, orgScopes, menuRights, assignments, isLoading: profilesLoading,
    createProfile, updateProfile, deleteProfile,
    saveOrgScope, deleteOrgScope, saveMenuRights,
    assignUser, removeAssignment,
  } = useAccessProfiles();
  const { toast } = useToast();

  const isLoading = menuLoading || profilesLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="profiles" className="space-y-4">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="profiles"><Settings2 className="h-4 w-4 mr-1" />Profiles</TabsTrigger>
        <TabsTrigger value="mapping"><Shield className="h-4 w-4 mr-1" />Profile Mapping</TabsTrigger>
        <TabsTrigger value="assignment"><Users className="h-4 w-4 mr-1" />Assignment</TabsTrigger>
      </TabsList>

      {/* Tab 1: Profiles */}
      <TabsContent value="profiles">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Access Profiles</CardTitle>
            <CardDescription>Create and manage named permission profiles.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfilesTab
              profiles={profiles}
              assignments={assignments}
              createProfile={createProfile}
              updateProfile={updateProfile}
              deleteProfile={deleteProfile}
              toast={toast}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab 2: Profile Mapping */}
      <TabsContent value="mapping">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Profile Mapping</CardTitle>
            <CardDescription>Map org scope and menu rights per profile.</CardDescription>
          </CardHeader>
          <CardContent>
            <MappingTab
              profiles={profiles}
              orgScopes={orgScopes}
              menuRights={menuRights}
              configs={configs}
              saveOrgScope={saveOrgScope}
              deleteOrgScope={deleteOrgScope}
              saveMenuRights={saveMenuRights}
              toast={toast}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab 3: Assignment */}
      <TabsContent value="assignment">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Profile Assignments</CardTitle>
            <CardDescription>Assign access profiles to individual employees.</CardDescription>
          </CardHeader>
          <CardContent>
            <AssignmentTab
              profiles={profiles}
              assignments={assignments}
              assignUser={assignUser}
              removeAssignment={removeAssignment}
              toast={toast}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
