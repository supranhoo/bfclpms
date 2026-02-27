/**
 * Reusable page header with back navigation
 */

import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  backTo?: string;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  backTo,
  actions,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {backTo && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(backTo)}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
