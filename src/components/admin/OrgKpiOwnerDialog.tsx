import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProfiles } from '@/hooks/useOrganization';
import { useOrgKpiOwners, useAssignOrgKpiOwner, useRemoveOrgKpiOwner } from '@/hooks/useOrgKpiDataOwner';
import { Loader2, UserPlus, X, Search, Users } from 'lucide-react';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

interface OrgKpiOwnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  kraName: string;
  kpiName: string;
}

export function OrgKpiOwnerDialog({
  open,
  onOpenChange,
  categoryId,
  kraName,
  kpiName,
}: OrgKpiOwnerDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [removingOwner, setRemovingOwner] = useState<{ id: string; name: string } | null>(null);
  
  const { data: profiles, isLoading: loadingProfiles } = useProfiles();
  const { data: owners, isLoading: loadingOwners } = useOrgKpiOwners(categoryId, kraName, kpiName);
  const assignOwner = useAssignOrgKpiOwner();
  const removeOwner = useRemoveOrgKpiOwner();

  const ownerIds = useMemo(() => new Set(owners?.map(o => o.owner_id) || []), [owners]);

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    const query = searchQuery.toLowerCase();
    return profiles.filter(p => 
      !ownerIds.has(p.id) && (
        p.full_name?.toLowerCase().includes(query) ||
        p.email?.toLowerCase().includes(query) ||
        p.employee_code?.toLowerCase().includes(query)
      )
    );
  }, [profiles, searchQuery, ownerIds]);

  const handleAssign = (userId: string) => {
    assignOwner.mutate({
      categoryId,
      kraName,
      kpiName,
      ownerId: userId,
    });
  };

  const handleRemove = (ownerId: string, ownerName: string) => {
    setRemovingOwner({ id: ownerId, name: ownerName });
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Assign Data Owners
          </DialogTitle>
          <DialogDescription>
            Assign users who can enter data for this org-level KPI
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* KPI Info */}
          <div className="bg-muted/50 p-3 rounded-lg text-sm break-words">
            <p className="font-medium break-words">{kraName}</p>
            <p className="text-muted-foreground break-words">{kpiName}</p>
          </div>

          {/* Current Owners */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Data Owners</Label>
            {loadingOwners ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : owners && owners.length > 0 ? (
              <div className="space-y-2">
                {owners.map(owner => (
                  <div key={owner.id} className="flex items-center justify-between p-2 bg-background border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{getInitials(owner.owner?.full_name || null)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{owner.owner?.full_name || owner.owner?.email}</p>
                        <p className="text-xs text-muted-foreground">{owner.owner?.email}</p>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRemove(owner.id, owner.owner?.full_name || owner.owner?.email || 'this owner')}
                      disabled={removeOwner.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">No data owners assigned. Only admins can edit this KPI.</p>
            )}
          </div>

          {/* Add Owner */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Add Data Owner</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <ScrollArea className="h-[200px] border rounded-lg">
              {loadingProfiles ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : filteredProfiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <p className="text-sm">
                    {searchQuery ? 'No matching users found' : 'All users are already owners'}
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredProfiles.slice(0, 20).map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => handleAssign(profile.id)}
                      disabled={assignOwner.isPending}
                      className="w-full flex items-center justify-between p-2 hover:bg-muted rounded-lg transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile.avatar_url || undefined} />
                          <AvatarFallback>{getInitials(profile.full_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{profile.full_name || profile.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {profile.employee_code && `${profile.employee_code} • `}
                            {profile.email}
                          </p>
                        </div>
                      </div>
                      <UserPlus className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                  {filteredProfiles.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Showing first 20 results. Type to narrow search.
                    </p>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
