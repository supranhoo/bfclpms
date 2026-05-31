import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useModules } from '@/hooks/useModules';
import { MinimalHeader } from '@/components/layout/MinimalHeader';
import { ModuleCard } from '@/components/modules/ModuleCard';
import { Loader2 } from 'lucide-react';

export default function ModuleHub() {
  const { user, profile, loading: authLoading } = useAuth();
  const { data: modules, isLoading: modulesLoading } = useModules();

  if (authLoading || modulesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="min-h-screen bg-muted/30">
      <MinimalHeader />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Welcome Section */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Welcome back, {firstName}!
          </h1>
          <p className="mt-2 text-muted-foreground">
            Select a module to get started
          </p>
        </div>

        {/* Module Grid */}
        <div className="w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules?.map((module) => (
              <ModuleCard
                key={module.id}
                code={module.code}
                name={module.name}
                description={module.description}
                icon={module.icon}
                color={module.color}
                route={module.route}
              />
            ))}
            
            {/* Placeholder cards for future modules */}
            <ModuleCard
              code="hrms"
              name="HRMS"
              description="Human Resource Management System for employee lifecycle management"
              icon="Users"
              color="secondary"
              route="/hrms"
              isComingSoon
            />
            <ModuleCard
              code="lms"
              name="LMS"
              description="Learning Management System for training and development"
              icon="GraduationCap"
              color="secondary"
              route="/lms"
              isComingSoon
            />
          </div>
        </div>
      </main>
    </div>
  );
}
