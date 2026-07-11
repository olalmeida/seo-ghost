import type { Page } from 'playwright';
import type { SeoResult, ScrapeOptions } from '../types.js';
import type { Collector } from './types.js';
import { validateHeadings } from './helpers.js';

/**
 * HeadingCollector: extrae y valida la jerarquía de headings (H1/H2/H3).
 *
 * Responsabilidades:
 *   - Extraer texto de todas las etiquetas H1, H2, H3
 *   - Validar jerarquía: H1 único, sin saltos, sin H1 vacíos
 *   - Generar headingIssues con los problemas encontrados
 *
 * La validación de jerarquía delega en validateHeadings() (helper puro)
 * para poder testearla sin navegador.
 */
export class HeadingCollector implements Collector {
  readonly name = 'heading';

  isEnabled(options: ScrapeOptions): boolean {
    return options.runSeo !== false;
  }

  async extract(page: Page, result: SeoResult, _options: ScrapeOptions): Promise<void> {
    // ─── Extraer headings ─────────────────────────────────────────
    result.h1Tags = await this.extractTags(page, 'h1');
    result.h2Tags = await this.extractTags(page, 'h2');
    result.h3Tags = await this.extractTags(page, 'h3');

    result.h1Count = result.h1Tags.length;
    result.h2Count = result.h2Tags.length;
    result.h3Count = result.h3Tags.length;

    // ─── Validar jerarquía (función pura, testeable) ──────────────
    result.headingIssues = validateHeadings(result);

    // ─── Debug en consola ─────────────────────────────────────────
    this.logDebug(result);
  }

  /**
   * Extrae el texto de todas las etiquetas de un nivel específico.
   */
  private async extractTags(page: Page, tag: string): Promise<string[]> {
    return page
      .$$eval(tag, (els) =>
        els.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
      )
      .catch(() => []);
  }

  /**
   * Muestra una muestra de los headings detectados en consola.
   */
  private logDebug(result: SeoResult): void {
    const logSample = (count: number, tags: string[], label: string): void => {
      if (count === 0) {
        console.log(`  📝 ${label}: 0 (sin ${label} en la página)`);
        return;
      }
      const sample = tags.slice(0, 3);
      const extra = count > 3 ? `, +${count - 3} más` : '';
      console.log(`  📝 ${label} (${count}): ${sample.map(h => JSON.stringify(h.substring(0, 50))).join(', ')}${extra}`);
    };

    logSample(result.h1Count, result.h1Tags, 'H1');
    if (result.h2Count > 0) {
      logSample(result.h2Count, result.h2Tags, 'H2');
    }
    if (result.h3Count > 0) {
      logSample(result.h3Count, result.h3Tags, 'H3');
    }
  }
}
