import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface LoginSlideshowProps {
  wallpapers: string[];
  interval?: number;
  organizationName?: string;
  appName?: string;
  logoUrl?: string | null;
}

export function LoginSlideshow({
  wallpapers,
  interval = 5000,
  organizationName,
  appName,
  logoUrl,
}: LoginSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Auto-advance slides
  useEffect(() => {
    if (wallpapers.length <= 1) return;

    const timer = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % wallpapers.length);
        setIsTransitioning(false);
      }, 500); // Half of transition duration
    }, interval);

    return () => clearInterval(timer);
  }, [wallpapers.length, interval]);

  const goToSlide = useCallback((index: number) => {
    if (index === currentIndex) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(index);
      setIsTransitioning(false);
    }, 500);
  }, [currentIndex]);

  const hasWallpapers = wallpapers.length > 0;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Background layers */}
      {hasWallpapers ? (
        <>
          {wallpapers.map((url, index) => (
            <div
              key={url}
              className={cn(
                'absolute inset-0 bg-cover bg-center transition-opacity duration-1000',
                index === currentIndex && !isTransitioning ? 'opacity-100' : 'opacity-0'
              )}
              style={{ backgroundImage: `url(${url})` }}
            />
          ))}
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/50 to-transparent" />
        </>
      ) : (
        /* Default animated gradient background */
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-secondary/20">
          {/* Animated blobs */}
          <div className="absolute top-1/4 -left-20 w-72 h-72 bg-primary/30 rounded-full filter blur-3xl animate-blob" />
          <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-secondary/30 rounded-full filter blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-accent/30 rounded-full filter blur-3xl animate-blob animation-delay-4000" />
        </div>
      )}

      {/* Content overlay */}
      <div className="relative z-10 h-full flex flex-col justify-between p-8 lg:p-12">
        {/* Top: Logo and branding */}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-12 w-12 object-contain rounded-lg shadow-lg"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center shadow-lg">
              <svg
                className="h-6 w-6 text-primary-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {appName || 'PMS Dashboard'}
            </h1>
            {organizationName && (
              <p className="text-sm text-muted-foreground">{organizationName}</p>
            )}
          </div>
        </div>

        {/* Middle: Hero text */}
        <div className="max-w-md">
          <h2 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight">
            Manage performance{' '}
            <span className="text-primary">with clarity.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Track KPIs, conduct reviews, and drive organizational growth with
            a powerful performance management system.
          </p>

          {/* Feature highlights */}
          <div className="mt-8 flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <svg
                  className="h-4 w-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              Multi-stage Reviews
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <svg
                  className="h-4 w-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              Real-time Analytics
            </div>
          </div>
        </div>

        {/* Bottom: Slide indicators */}
        {wallpapers.length > 1 && (
          <div className="flex items-center gap-2">
            {wallpapers.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  index === currentIndex
                    ? 'w-8 bg-primary'
                    : 'w-2 bg-foreground/30 hover:bg-foreground/50'
                )}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
