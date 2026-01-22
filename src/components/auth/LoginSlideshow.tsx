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
          {/* Overlay gradient - lighter for better wallpaper visibility, from right */}
          <div className="absolute inset-0 bg-gradient-to-l from-background/85 via-background/40 to-transparent" />
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

      {/* Content overlay - right-aligned strip */}
      <div className="relative z-10 h-full flex">
        {/* Left side: Empty - wallpaper shows through */}
        <div className="flex-1" />
        
        {/* Right content strip */}
        <div className="w-2/5 max-w-md h-full flex flex-col justify-between p-8 lg:p-12">
          {/* Top spacer */}
          <div />

          {/* Middle: Slide indicators */}
          {wallpapers.length > 1 ? (
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
          ) : (
            <div />
          )}

          {/* Bottom spacer */}
          <div />
        </div>
      </div>
    </div>
  );
}
