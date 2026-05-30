import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Briefcase, MapPin, Award, Hash, Calendar, Users, BadgeCheck } from 'lucide-react';
import { format } from 'date-fns';

interface OrgInfo {
  division: string | null;
  businessUnit: string | null;
  department: string | null;
  subBranch: string | null;
  designation: string | null;
  pmsGrade: string | null;
  employeeCategory?: string | null;
  employmentStatus?: string | null;
  employeeCode: string | null;
  joiningDate: string | null;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function OrganizationInfoCard({ info }: { info: OrgInfo }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Organization Details
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <InfoRow icon={Building2} label="Division" value={info.division} />
        <InfoRow icon={Briefcase} label="Business Unit" value={info.businessUnit} />
        <InfoRow icon={MapPin} label="Department" value={info.department} />
        {info.subBranch && <InfoRow icon={MapPin} label="Sub-Branch" value={info.subBranch} />}
        <InfoRow icon={Briefcase} label="Designation" value={info.designation} />
        <InfoRow icon={Award} label="PMS Grade" value={info.pmsGrade} />
        {info.employeeCategory && <InfoRow icon={Users} label="Employee Category" value={info.employeeCategory} />}
        {info.employmentStatus && <InfoRow icon={BadgeCheck} label="Employment Status" value={info.employmentStatus} />}
        <InfoRow icon={Hash} label="Employee Code" value={info.employeeCode} />
        <InfoRow icon={Calendar} label="Date of Joining" value={info.joiningDate ? format(new Date(info.joiningDate), 'dd MMM yyyy') : null} />
      </CardContent>
    </Card>
  );
}
