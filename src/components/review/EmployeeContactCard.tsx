import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Mail, Phone, Copy, Check, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EmployeeContactCardProps {
  employee: {
    id: string;
    full_name: string | null;
    email: string;
    designation: string | null;
    avatar_url: string | null;
    department_id: string | null;
    mobile_number?: string | null;
  };
  departmentName?: string | null;
  onViewKpis: () => void;
  children: React.ReactNode;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: `${label} copied` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  return (
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleCopy}>
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {label}
    </Button>
  );
}

export function EmployeeContactCard({ employee, departmentName, onViewKpis, children }: EmployeeContactCardProps) {
  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Popover>
      <PopoverTrigger asChild onClick={e => e.stopPropagation()}>
        {children as any}
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 overflow-hidden"
        align="start"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 flex items-start gap-3">
          <Avatar className="h-12 w-12 ring-2 ring-background">
            <AvatarImage src={employee.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {getInitials(employee.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight truncate">
              {employee.full_name || employee.email}
            </p>
            {employee.designation && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{employee.designation}</p>
            )}
            {departmentName && (
              <p className="text-xs text-muted-foreground truncate">{departmentName}</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Contact details */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium text-foreground truncate">{employee.email}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Mobile</p>
              <p className="text-sm font-medium text-foreground">
                {employee.mobile_number || <span className="text-muted-foreground italic text-xs">Not provided</span>}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="p-3 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <CopyButton value={employee.email} label="Email" />
            {employee.mobile_number && (
              <CopyButton value={employee.mobile_number} label="Mobile" />
            )}
          </div>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1.5"
            onClick={(e) => { e.stopPropagation(); onViewKpis(); }}
          >
            View KPIs
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
