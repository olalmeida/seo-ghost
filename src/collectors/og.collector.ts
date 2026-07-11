import type { Page } from 'playwright';
import type { SeoResult, ScrapeOptions } from '../types.js';
import type { Collector } from './types.js';

/**
 * OGCollector: extrae etiquetas Open Graph y Twitter Cards.
 *
 * Open Graph (Facebook, LinkedIn, Discord, etc.):
 *   - og:title       → Título para redes sociales
 *   - og:description → Descripción para redes sociales
 *   - og:image       → Imagen destacada para compartir
 *   - og:url         → URL canónica para el post
 *   - og:type        → Tipo de contenido (website, article, etc.)
 *
 * Twitter Cards:
 *   - twitter:card       → Tipo de tarjeta (summary, summary_large_image, etc.)
 *   - twitter:title      → Título para Twitter
 *   - twitter:description → Descripción para Twitter
 *   - twitter:image      → Imagen para Twitter
 *
 * Validaciones que reporta como headingIssues (reusando el array existente):
 *   - Sin og:title → warning (crucial para compartir en redes)
 *   - Sin og:image → warning (no hay preview al compartir)
 *   - og:image sin https → warning (algunas plataformas bloquean http)
 */
export class OGCollector implements Collector {
  readonly name = 'og';

  isEnabled(options: ScrapeOptions): boolean {
    return options.runSeo !== false;
  }

  async extract(page: Page, result: SeoResult, _options: ScrapeOptions): Promise<void> {
    // ─── Open Graph ───────────────────────────────────────────────
    result.ogTitle = await this.extractMetaProperty(page, 'og:title');
    result.ogDescription = await this.extractMetaProperty(page, 'og:description');
    result.ogImage = await this.extractMetaProperty(page, 'og:image');
    result.ogUrl = await this.extractMetaProperty(page, 'og:url');
    result.ogType = await this.extractMetaProperty(page, 'og:type');

    // ─── Twitter Cards ────────────────────────────────────────────
    result.twitterCard = await this.extractMetaName(page, 'twitter:card');
    result.twitterTitle = await this.extractMetaName(page, 'twitter:title');
    result.twitterDescription = await this.extractMetaName(page, 'twitter:description');
    result.twitterImage = await this.extractMetaName(page, 'twitter:image');

    // ─── Debug en consola ─────────────────────────────────────────
    this.logDebug(result);
  }

  /**
   * Extrae el content de un meta tag con property="..." (Open Graph).
   */
  private async extractMetaProperty(page: Page, property: string): Promise<string | null> {
    return page
      .$eval(`meta[property="${property}"]`, (el) => el.getAttribute('content'))
      .catch(() => null);
  }

  /**
   * Extrae el content de un meta tag con name="..." (Twitter Cards, etc.).
   */
  private async extractMetaName(page: Page, name: string): Promise<string | null> {
    return page
      .$eval(`meta[name="${name}"]`, (el) => el.getAttribute('content'))
      .catch(() => null);
  }

  /**
   * Muestra resumen de OG/Twitter en consola.
   */
  private logDebug(result: SeoResult): void {
    const ogParts: string[] = [];

    if (result.ogTitle) {
      ogParts.push(`✅ OG Title`);
    } else {
      ogParts.push(`❌ Sin OG Title`);
    }

    if (result.ogImage) {
      ogParts.push(`🖼️ OG Image`);
    } else {
      ogParts.push(`❌ Sin OG Image`);
    }

    if (result.ogDescription) {
      ogParts.push(`📝 OG Desc`);
    }

    if (result.twitterCard) {
      ogParts.push(`🐦 ${result.twitterCard}`);
    }

    if (ogParts.length > 0) {
      console.log(`  📢 ${ogParts.join(' | ')}`);
    }
  }
}
