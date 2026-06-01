import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useModules, type Module } from '@/hooks/useModules';
import { MinimalHeader } from '@/components/layout/MinimalHeader';
import { ModuleCard } from '@/components/modules/ModuleCard';
import { Loader2 } from 'lucide-react';

/**
 * Presentational-only mapping of module `code` → product family.
 * Unknown codes fall back to "Workspaces" so newly added modules
 * render safely without any change here.
 */
const MODULE_FAMILY: Record<string, string> = {
  pms: 'Performance & Growth',
  performance: 'Performance & Growth',
  increment: 'Performance & Growth',
  incentive: 'Performance & Growth',
  safety: 'Safety & Compliance',
  hrms: 'Core HRMS',
  attendance: 'Core HRMS',
  leave: 'Core HRMS',
  payroll: 'Core HRMS',
  employee: 'Core HRMS',
  recruitment: 'Core HRMS',
  onboarding: 'Core HRMS',
  lms: 'Learning & Development',
  training: 'Learning & Development',
};

const FAMILY_ORDER = [
  'Core HRMS',
  'Performance & Growth',
  'Safety & Compliance',
  'Learning & Development',
  'Workspaces',
  'Future Modules',
];

type PlaceholderModule = Pick<Module, 'code' | 'name' | 'description' | 'icon' | 'color' | 'route'> & {
  isComingSoon: true;
};

const COMING_SOON_MODULES: PlaceholderModule[] = [
  {
    code: 'hrms',
    name: 'HRMS',
    description: 'Human Resource Management System for employee lifecycle management',
    icon: 'Users',
    color: 'secondary',
    route: '/hrms',
    isComingSoon: true,
  },
  {
    code: 'lms',
    name: 'LMS',
    description: 'Learning Management System for training and development',
    icon: 'GraduationCap',
    color: 'secondary',
    route: '/lms',
    isComingSoon: true,
  },
];

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
  const activeModules = modules ?? [];
  const totalAvailable = activeModules.length;

  // Build family → cards map (presentational grouping only)
  const grouped = new Map<string, Array<{ key: string; node: JSX.Element }>>();
  const pushTo = (family: string, item: { key: string; node: JSX.Element }) => {
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family)!.push(item);
  };

  activeModules.forEach((m) => {
    const family = MODULE_FAMILY[m.code] ?? 'Workspaces';
    pushTo(family, {
      key: m.id,
      node: (
        <ModuleCard
          code={m.code}
          name={m.name}
          description={m.description}
          icon={m.icon}
          color={m.color}
          route={m.route}
        />
      ),
    });
  });

  COMING_SOON_MODULES.forEach((m) => {
    pushTo('Future Modules', {
      key: `cs-${m.code}`,
      node: (
        <ModuleCard
          code={m.code}
          name={m.name}
          description={m.description}
          icon={m.icon}
          color={m.color}
          route={m.route}
          isComingSoon
        />
      ),
    });
  });

  // Order families per FAMILY_ORDER, then append any unknown families.
  const orderedFamilies = [
    ...FAMILY_ORDER.filter((f) => grouped.has(f)),
    ...Array.from(grouped.keys()).filter((f) => !FAMILY_ORDER.includes(f)),
  ];

  return (
    <div className="relative min-h-screen bg-background">
      {/* Soft layered background — subtle enterprise depth, no loud gradients */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-card/60 via-card/20 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 800px 300px at 20% 0%, hsl(var(--primary) / 0.05), transparent 60%), radial-gradient(ellipse 600px 240px at 100% 10%, hsl(var(--primary) / 0.04), transparent 60%)',
        }}
      />

      <div className="relative">
        <MinimalHeader />

        <main className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          {/* Welcome Section — enterprise, left-aligned on ≥sm */}
          <div className="mb-10 sm:mb-14">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>HRMS Workspace</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Welcome back, {firstName}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
              Access your HRMS workspace. Choose a module to continue.
            </p>
            {totalAvailable > 0 && (
              <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px w-10 bg-border" />
                <span>
                  {totalAvailable} {totalAvailable === 1 ? 'workspace' : 'workspaces'} available
                </span>
              </div>
            )}
          </div>

          {/* Grouped Module Sections */}
          <div className="space-y-10 sm:space-y-12">
            {orderedFamilies.map((family) => {
              const items = grouped.get(family) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={family}>
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {family}
                    </h2>
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-[11px] font-medium tabular-nums text-muted-foreground/80">
                      {items.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                    {items.map((it) => (
                      <div key={it.key}>{it.node}</div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
