import type { Page } from 'playwright';
import type { SeoResult, ScrapeOptions } from '../types.js';
import type { Collector } from './types.js';

/**
 * MetaCollector: extrae metadata general de la página.
 *
 * Responsabilidades:
 *   - <title>
 *   - <meta name="description">
 *   - <link rel="canonical">
 *   - <meta name="robots">
 *
 * Es el collector más básico: siempre se ejecuta en modo SEO
 * y no requiere interacción con la página (scroll, clicks, etc.).
 */
export class MetaCollector implements Collector {
  readonly name = 'meta';

  isEnabled(options: ScrapeOptions): boolean {
    // Se ejecuta siempre que no estemos en modo solo-a11y
    return options.runSeo !== false;
  }

  async extract(page: Page, result: SeoResult, _options: ScrapeOptions): Promise<void> {
    // ─── <title> ────────────────────────────────────────────────
    result.metaTitle = await page.title().catch(() => null);

    // ─── <meta name="description"> ──────────────────────────────
    result.metaDescription = await page
      .$eval('meta[name="description"]', (el) => el.getAttribute('content'))
      .catch(() => null);

    // ─── <link rel="canonical"> ─────────────────────────────────
    result.canonical = await page
      .$eval('link[rel="canonical"]', (el) => el.getAttribute('href'))
      .catch(() => null);

    // ─── <meta name="robots"> ───────────────────────────────────
    result.metaRobots = await page
      .$eval('meta[name="robots"]', (el) => el.getAttribute('content'))
      .catch(() => null);
  }
}
