import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageLoadingOverlay } from '@/components/ui/PageLoadingOverlay';

// The overlay calls useBrandingSettings() which talks to Supabase via React
// Query. Stub it to a known empty state so we can prove the `branding` prop
// override fully drives the rendered card.
vi.mock('@/hooks/useBrandingSettings', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    useBrandingSettings: () => ({
      companyName: '',
      tagline: '',
      showLogo: false,
      logoUrl: '',
      isLoading: false,
    }),
  };
});

describe('PageLoadingOverlay branding', () => {
  it('renders the bare card when no branding is configured', () => {
    render(<PageLoadingOverlay open variant="inline" />);
    expect(screen.getByText('Please wait')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the company name when configured', () => {
    render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{ companyName: 'ACME Corp' }}
      />,
    );
    expect(screen.getByText('ACME Corp')).toBeInTheDocument();
  });

  it('renders the tagline only when set', () => {
    const { rerender } = render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{ companyName: 'ACME', tagline: '' }}
      />,
    );
    expect(screen.queryByText('Performance Suite')).not.toBeInTheDocument();

    rerender(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{ companyName: 'ACME', tagline: 'Performance Suite' }}
      />,
    );
    expect(screen.getByText('Performance Suite')).toBeInTheDocument();
  });

  it('hides the logo when toggle is off, even if logoUrl is provided', () => {
    render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{
          companyName: 'ACME',
          showLogo: false,
          logoUrl: 'https://example.com/logo.png',
        }}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the logo when toggle is on AND a logoUrl exists', () => {
    render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{
          companyName: 'ACME',
          showLogo: true,
          logoUrl: 'https://example.com/logo.png',
        }}
      />,
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/logo.png');
  });

  it('returns null when open=false', () => {
    const { container } = render(<PageLoadingOverlay open={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});