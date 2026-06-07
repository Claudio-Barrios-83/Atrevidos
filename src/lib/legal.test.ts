import { describe, expect, it } from 'vitest';
import { LEGAL_NOTICE_LINKS, LEGAL_PAGES, LEGAL_ROUTE_PATHS, getLegalPage } from './legal';

describe('legal notice helpers', () => {
  it('exposes stable legal route paths and footer links for privacy, terms, and safety', () => {
    expect(LEGAL_ROUTE_PATHS).toEqual(['/privacy', '/terms', '/safety']);
    expect(LEGAL_NOTICE_LINKS).toEqual([
      { href: '/privacy', label: 'Privacidad' },
      { href: '/terms', label: 'Términos y consentimiento' },
      { href: '/safety', label: 'Seguridad y comunidad' }
    ]);
  });

  it('returns terms content that matches onboarding acknowledgements', () => {
    const page = getLegalPage('terms');

    expect(page.title).toBe('Términos y consentimiento');
    expect(page.summary).toContain('mayor de 18 años');
    expect(page.sections.some((section) => section.body.some((paragraph) => paragraph.includes('consentimiento claro')))).toBe(true);
  });

  it('resolves every expected slug to a matching page definition', () => {
    expect(getLegalPage('privacy')).toMatchObject({ slug: 'privacy', href: '/privacy' });
    expect(getLegalPage('terms')).toMatchObject({ slug: 'terms', href: '/terms' });
    expect(getLegalPage('safety')).toMatchObject({ slug: 'safety', href: '/safety' });
  });

  it('keeps slugs, hrefs, and labels unique and internally consistent', () => {
    const slugs = LEGAL_PAGES.map((page) => page.slug);
    const hrefs = LEGAL_PAGES.map((page) => page.href);
    const labels = LEGAL_PAGES.map((page) => page.label);

    expect(new Set(slugs).size).toBe(LEGAL_PAGES.length);
    expect(new Set(hrefs).size).toBe(LEGAL_PAGES.length);
    expect(new Set(labels).size).toBe(LEGAL_PAGES.length);

    expect(LEGAL_ROUTE_PATHS).toEqual(hrefs);
    expect(LEGAL_NOTICE_LINKS).toEqual(LEGAL_PAGES.map(({ href, label }) => ({ href, label })));

    for (const page of LEGAL_PAGES) {
      expect(page.href).toBe(`/${page.slug}`);
      expect(page.sections.length).toBeGreaterThan(0);
    }
  });

  it('mentions email/authentication data in the privacy page copy', () => {
    const page = getLegalPage('privacy');

    expect(page.sections.some((section) => section.body.some((paragraph) => paragraph.includes('correo electrónico')))).toBe(true);
    expect(page.sections.some((section) => section.body.some((paragraph) => paragraph.includes('credenciales de autenticación')))).toBe(true);
  });

  it('throws a clear error for unsupported legal page slugs', () => {
    expect(() => getLegalPage('unknown' as never)).toThrowError('Unknown legal page: unknown');
  });
});
