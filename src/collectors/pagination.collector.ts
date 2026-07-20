import type { Page } from 'playwright';
import type { SeoResult, ScrapeOptions } from '../types.js';
import type { Collector } from './types.js';
import { ImageCollector } from './image.collector.js';
import { detectUrlPattern, isAltIssue } from './helpers.js';

/**
 * PaginationCollector: navega páginas adicionales en listados paginados
 * y mergea los resultados en el mismo objeto SeoResult.
 *
 * A diferencia del resto de collectors, éste modifica el resultado
 * EXISTENTE en lugar de crear uno nuevo: agrega headings e imágenes
 * de páginas adicionales al resultado de la página 1.
 *
 * Estrategia:
 *   - Detecta el patrón de URL desde el enlace "Siguiente"
 *   - Navega DIRECTAMENTE a page/N (más rápido que clickear)
 *   - Mergea headings sin duplicar texto exacto
 *   - Mergea imágenes sin duplicar URLs
 */
export class PaginationCollector implements Collector {
  readonly name = 'pagination';

  isEnabled(options: ScrapeOptions): boolean {
    // Solo se activa si hay páginas para recorrer y no es modo solo-a11y
    return (options.maxPages ?? 1) > 1 && options.runSeo !== false;
  }

  async extract(page: Page, result: SeoResult, options: ScrapeOptions): Promise<void> {
    const maxPages = options.maxPages ?? 1;
    if (maxPages <= 1) return;

    // ─── Detectar patrón de URL ──────────────────────────────────
    const href = await this.findNextHref(page);
    const urlPattern = href ? detectUrlPattern(href, result.url) : null;
    if (!urlPattern) {
      console.log('  📄 Paginación: no se detectó patrón de URL (sin "Siguiente" con href numérico)');
      return;
    }

    console.log(`  📄 Patrón detectado: ${urlPattern.replace('{n}', 'N')}`);

    for (let p = 2; p <= maxPages; p++) {
      const pageUrl = urlPattern.replace('{n}', String(p));
      console.log(`  📄 Yendo a página ${p}: ${pageUrl}`);

      try {
        const response = await page.goto(pageUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });

        const statusCode = response?.status() ?? 0;
        if (statusCode === 404) {
          console.log(`  ⚠️  Página ${p} devolvió 404, deteniendo paginación`);
          break;
        }

        // Esperar renderizado JS
        await page.waitForTimeout(1_500);

        // Activar lazy loading
        const imageCollector = new ImageCollector();
        await imageCollector.activateLazyLoading(page);

        // Extraer y mergear headings
        await this.mergeHeadings(page, result);

        // Extraer y mergear imágenes conservando las mismas categorías que
        // usa la primera página, incluido <img alt> cuando el HTML lo permite.
        const rawHtml = await response?.text().catch(() => undefined);
        await this.mergeImages(page, result, rawHtml);

        console.log(`  ✓ Página ${p} mergeada | H1: ${result.h1Count} | H2: ${result.h2Count} | H3: ${result.h3Count} | Errores ALT: ${result.imagesWithoutAlt}/${result.totalImages}`);
      } catch {
        console.log(`  ⚠️  Error al navegar a página ${p}, deteniendo paginación`);
        break;
      }
    }
  }

  // ─── Detección de patrón de URL ─────────────────────────────────

  /**
   * Busca el enlace "Siguiente" en la página y retorna su href.
   * La deducción del patrón de URL se delega a detectUrlPattern() (helper puro).
   */
  private async findNextHref(page: Page): Promise<string | null> {
    const nextSelectors = [
      'a[rel="next"]',
      'link[rel="next"]',
      'a.pagination-next',
      'a.next:not(.sr-only):not([hidden])',
      'a:has-text("Siguiente")',
      'a:has-text("Next")',
      'a:has-text("›")',
      'a:has-text("❯")',
      'a:has-text("→")',
      'a[class*="next"]',
      'li.next a',
      '[aria-label="Next page"] a',
      '[aria-label="Siguiente página"] a',
    ];

    for (const sel of nextSelectors) {
      const el = await page.$(sel);
      if (el) {
        const href = await el.getAttribute('href').catch(() => null);
        if (href && href !== '#') return href;
      }
    }

    return null;
  }

  // ─── Merge de headings ─────────────────────────────────────────

  private async mergeHeadings(page: Page, result: SeoResult): Promise<void> {
    const extractTags = async (tag: string): Promise<string[]> => {
      return page
        .$$eval(tag, (els) =>
          els.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
        )
        .catch(() => [] as string[]);
    };

    const mergeTags = (existing: string[], nuevos: string[], result: SeoResult, tag: string): string[] => {
      const seen = new Set(existing);
      for (const h of nuevos) {
        if (!seen.has(h)) {
          existing.push(h);
          seen.add(h);
        }
      }
      return existing;
    };

    const h1New = await extractTags('h1');
    const h2New = await extractTags('h2');
    const h3New = await extractTags('h3');

    result.h1Tags = mergeTags(result.h1Tags, h1New, result, 'h1');
    result.h2Tags = mergeTags(result.h2Tags, h2New, result, 'h2');
    result.h3Tags = mergeTags(result.h3Tags, h3New, result, 'h3');

    result.h1Count = result.h1Tags.length;
    result.h2Count = result.h2Tags.length;
    result.h3Count = result.h3Tags.length;
  }

  // ─── Merge de imágenes ─────────────────────────────────────────

  private async mergeImages(
    page: Page,
    result: SeoResult,
    rawHtml?: string,
  ): Promise<void> {
    const extracted = await new ImageCollector().extractRaw(page, rawHtml);
    for (const img of extracted.images) {
      if (!img.src) continue;
      result.totalImages++;
      result.images.push(img);

      if (isAltIssue(img.category)) {
        result.imagesWithoutAlt++;
        result.imagesWithoutAltList.push(img.src);
      }
    }
  }
}
