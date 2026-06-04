import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

/**
 * Platform-Owner-only management of implementation_admin assignments per client.
 * Writes audit rows to entitlement_audit.
 */
export function ImplementersTab() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canWrite = hasRole('platform_owner');

  const { data: clients } = useQuery({
    queryKey: ['platform-settings', 'clients-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, client_key, display_name').order('display_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['platform-settings', 'implementers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_implementer_assignments')
        .select('id, client_id, user_id, assigned_by, created_at, clients!inner(client_key, display_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [clientId, setClientId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function lookupUserIdByEmail(em: string): Promise<string | null> {
    const e = em.trim().toLowerCase();
    if (!e) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', e)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  const assign = async () => {
    if (!clientId || !email.trim()) return;
    setSubmitting(true);
    try {
      const targetUserId = await lookupUserIdByEmail(email);
      if (!targetUserId) {
        toast({ title: 'User not found', description: 'No profile matches that email.', variant: 'destructive' });
        return;
      }
      const client = clients?.find((c: any) => c.id === clientId);
      const { error } = await supabase.from('client_implementer_assignments').insert({
        client_id: clientId,
        user_id: targetUserId,
        assigned_by: user?.id,
      });
      if (error) throw error;
      await supabase.from('entitlement_audit').insert({
        actor_id: user?.id,
        event_type: 'update',
        entity_type: 'client_implementer_assignment',
        entity_key: client?.client_key ?? clientId,
        client_id: clientId,
        before: {},
        after: { user_id: targetUserId, email },
        reason: 'impl_console_assign',
      });
      toast({ title: 'Assigned', description: `${email} can now access ${client?.display_name}.` });
      setEmail('');
      qc.invalidateQueries({ queryKey: ['platform-settings', 'implementers'] });
    } catch (e: any) {
      toast({ title: 'Assignment failed', description: e.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const revoke = async (row: any) => {
    try {
      const { error } = await supabase.from('client_implementer_assignments').delete().eq('id', row.id);
      if (error) throw error;
      await supabase.from('entitlement_audit').insert({
        actor_id: user?.id,
        event_type: 'update',
        entity_type: 'client_implementer_assignment',
        entity_key: row.clients?.client_key ?? row.client_id,
        client_id: row.client_id,
        before: { user_id: row.user_id },
        after: {},
        reason: 'impl_console_revoke',
      });
      toast({ title: 'Revoked' });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'implementers'] });
    } catch (e: any) {
      toast({ title: 'Revoke failed', description: e.message, variant: 'destructive' });
    }
  };

  if (!canWrite) {
    return <Alert><AlertDescription>Only platform owners can manage implementer assignments.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Assign Implementation Admin</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
                <SelectContent>
                  {(clients ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.display_name} ({c.client_key})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>User email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
            </div>
            <Button onClick={assign} disabled={submitting || !clientId || !email.trim()}>
              <UserPlus className="h-4 w-4 mr-1" />Assign
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Implementation admins can edit approved per-client setup fields only. They cannot access global Platform Settings, entitlements, or enforcement.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Current Assignments</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : (rows ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No implementers assigned yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1">Client</th><th>User ID</th><th>Assigned</th><th></th></tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{r.clients?.display_name} <span className="text-muted-foreground">({r.clients?.client_key})</span></td>
                    <td className="font-mono text-xs">{r.user_id}</td>
                    <td className="text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => revoke(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}