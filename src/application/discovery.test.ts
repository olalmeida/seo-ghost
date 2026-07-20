import { describe, expect, it, vi } from 'vitest';
import { discoverAuditUrls, type DiscoverUrls } from './discovery.js';

const browser = {} as never;

describe('discoverAuditUrls', () => {
  it('conserva semillas y deduplica los resultados del modo normal', async () => {
    const findUrls = vi.fn<DiscoverUrls>().mockResolvedValue([
      'https://example.com/a.html',
      'https://example.com/a.html',
      'https://example.com/b.html',
    ]);

    const result = await discoverAuditUrls(
      browser,
      ['https://example.com/'],
      { timeout: 500, maxPages: 2, verbose: true },
      { discoverUrls: findUrls },
    );

    expect(result.urls).toEqual([
      'https://example.com/',
      'https://example.com/a.html',
      'https://example.com/b.html',
    ]);
    expect(result.discoveredUrls).toEqual(['https://example.com/a.html', 'https://example.com/b.html']);
    expect(result.selector).toBe('a[href$=".html"]');
    expect(findUrls).toHaveBeenCalledWith(
      browser,
      'https://example.com/',
      'a[href$=".html"]',
      { timeout: 500, verbose: true, maxPages: 2 },
    );
  });

  it('en modo recursivo limita las secciones al dominio de la primera semilla', async () => {
    const findUrls = vi.fn<DiscoverUrls>(async (_browser, url, selector) => {
      if (selector === 'a') {
        return [
          'https://example.com/news',
          'https://example.com/direct.html',
          'https://other.example/section',
        ];
      }
      if (url === 'https://example.com/news') return ['https://example.com/from-section.html'];
      return [];
    });

    const result = await discoverAuditUrls(
      browser,
      ['https://example.com/'],
      { recursive: true },
      { discoverUrls: findUrls },
    );

    expect(result.sectionUrls).toEqual(['https://example.com/news']);
    expect(result.directArticleUrls).toEqual(['https://example.com/direct.html']);
    expect(result.discoveredUrls).toEqual([
      'https://example.com/direct.html',
      'https://example.com/from-section.html',
    ]);
    expect(findUrls).toHaveBeenLastCalledWith(
      browser,
      'https://example.com/news',
      'a[href$=".html"]',
      { timeout: undefined, verbose: false, maxPages: 1 },
    );
  });

  it('en modo recursivo scrapeAll conserva enlaces de cualquier tipo de la primera fase', async () => {
    const findUrls = vi.fn<DiscoverUrls>(async (_browser, url) => {
      if (url === 'https://example.com/news') return ['https://example.com/author/alice'];
      return ['https://example.com/news', 'https://example.com/direct.html'];
    });

    const result = await discoverAuditUrls(
      browser,
      ['https://example.com/'],
      { recursive: true, scrapeAll: true },
      { discoverUrls: findUrls },
    );

    expect(result.discoveredUrls).toEqual([
      'https://example.com/news',
      'https://example.com/direct.html',
      'https://example.com/author/alice',
    ]);
  });
});
