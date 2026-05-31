import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Phone, Plus, Trash2 } from 'lucide-react';
import {
  useEmergencyContacts,
  useUpsertEmergencyContact,
  useDeleteEmergencyContact,
} from '@/hooks/useSafetyEmergency';
import {
  SAFETY_EMERGENCY_CONTACT_TYPES,
  SAFETY_EMERGENCY_CONTACT_TYPE_LABEL,
  type SafetyEmergencyContactType,
  validateContactDraft,
} from '@/lib/safetyEmergency';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

export default function SafetyEmergencyContacts() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<SafetyEmergencyContactType | 'all'>('all');
  const { data: contacts = [], isLoading } = useEmergencyContacts({ type: filter });
  const upsert = useUpsertEmergencyContact();
  const del = useDeleteEmergencyContact();

  const [name, setName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneAlt, setPhoneAlt] = useState('');
  const [email, setEmail] = useState('');
  const [contactType, setContactType] = useState<SafetyEmergencyContactType>('internal');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const submit = async () => {
    const err = validateContactDraft({ name, phone_primary: phone, contact_type: contactType });
    if (err) {
      toast({ title: 'Cannot save', description: err, variant: 'destructive' });
      return;
    }
    try {
      await upsert.mutateAsync({
        name: name.trim(),
        role_title: roleTitle.trim() || null,
        phone_primary: phone.trim(),
        phone_alt: phoneAlt.trim() || null,
        email: email.trim() || null,
        contact_type: contactType,
        is_active: true,
      });
      toast({ title: 'Contact saved' });
      setName(''); setRoleTitle(''); setPhone(''); setPhoneAlt(''); setEmail('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await del.mutateAsync(pendingDelete);
      toast({ title: 'Contact removed' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/safety/emergency"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
          <Phone className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Emergency Contacts</h1>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Add a contact</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="n">Name</Label>
              <Input id="n" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rt">Role / Title</Label>
              <Input id="rt" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p1">Primary phone</Label>
              <Input id="p1" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p2">Alternate phone</Label>
              <Input id="p2" value={phoneAlt} onChange={(e) => setPhoneAlt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="em">Email</Label>
              <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={contactType} onValueChange={(v) => setContactType(v as SafetyEmergencyContactType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SAFETY_EMERGENCY_CONTACT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SAFETY_EMERGENCY_CONTACT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Plus className="h-4 w-4 mr-2" /> Add Contact
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center gap-3">
          <div className="flex-1">
            <CardTitle className="text-base">Directory</CardTitle>
            <CardDescription>{contacts.length} contact(s).</CardDescription>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as SafetyEmergencyContactType | 'all')}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {SAFETY_EMERGENCY_CONTACT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{SAFETY_EMERGENCY_CONTACT_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No contacts yet.</div>
          ) : (
            contacts.map((c) => (
              <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card min-h-[64px]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.name}</span>
                    {c.role_title && <span className="text-xs text-muted-foreground">· {c.role_title}</span>}
                    <Badge variant="outline">{SAFETY_EMERGENCY_CONTACT_TYPE_LABEL[c.contact_type]}</Badge>
                  </div>
                  <div className="text-sm flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <a
                      href={`tel:${c.phone_primary}`}
                      className="text-primary hover:underline inline-flex items-center min-h-[36px] font-medium"
                    >
                      📞 {c.phone_primary}
                    </a>
                    {c.phone_alt && (
                      <a
                        href={`tel:${c.phone_alt}`}
                        className="text-primary hover:underline inline-flex items-center min-h-[36px]"
                      >
                        📞 {c.phone_alt}
                      </a>
                    )}
                  </div>
                  {c.email && (
                    <div className="text-xs text-muted-foreground">
                      <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                    </div>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 h-10 w-10 shrink-0"
                  onClick={() => setPendingDelete(c.id)}
                  aria-label="Remove contact"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmDestructiveDialog
        open={!!pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Remove contact?"
        description="This contact will be permanently removed from the emergency directory."
        confirmLabel="Remove"
        isLoading={del.isPending}
      />
    </div>
  );
}
