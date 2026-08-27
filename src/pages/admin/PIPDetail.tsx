/**
 * Full-page PIP detail screen (`/admin/pip/:pipId`).
 * Replaces the legacy right-side detail sheet so long plan content is readable
 * and the record is deep-linkable.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { PIPDetailView } from '@/components/pip/PIPDetailView';
import { usePIPDetails } from '@/hooks/usePIP';

export default function PIPDetail() {
  const { pipId } = useParams<{ pipId: string }>();
  const navigate = useNavigate();
  const { data: pip } = usePIPDetails(pipId);

  if (!pipId) {
    navigate('/admin/pip', { replace: true });
    return null;
  }

  const description = pip?.employee
    ? `${pip.employee.full_name} (${pip.employee.employee_code})`
    : 'Structured improvement plan';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Performance Improvement Plan"
        description={description}
        backTo="/admin/pip"
      />
      <PIPDetailView pipId={pipId} />
    </div>
  );
}
