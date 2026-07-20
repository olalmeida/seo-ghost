import type { Page } from 'playwright';
import type { ImageAnalysis, BgImageAnalysis, PictureSourceAnalysis, SeoResult, ScrapeOptions } from '../types.js';
import { assessImageAltQuality } from './image-quality.js';
import type { Collector } from './types.js';
import { classifyAlt, isAltIssue } from './helpers.js';

/**
 * ImageCollector: extrae y analiza las imágenes de la página.
 *
 * Responsabilidades:
 *   - Clickear carousels/sliders para forzar carga de imágenes lazy
 *   - Scrollear la página para activar lazy loading (loading="lazy", IntersectionObserver)
 *   - Extraer todas las etiquetas <img> con su src (absoluto) y alt (DOM property)
 *   - Detectar imágenes sin alt text significativo
 *   - Reportar muestra en consola
 *
 * Estrategias:
 *   - Carousels: detecta Slick, Swiper, Owl, Bootstrap + genéricos
 *   - Scroll: 800px/step, máximo 100, estabiliza en 3 intentos sin cambio
 *   - Alt: usa el.alt (DOM property, no getAttribute) para capturar JS frameworks
 *   - Src: usa el.src (URL absoluta) para evitar rutas relativas rotas
 */
export class ImageCollector implements Collector {
  readonly name = 'image';

  isEnabled(options: ScrapeOptions): boolean {
    return options.runSeo !== false;
  }

  async extract(page: Page, result: SeoResult, options: ScrapeOptions): Promise<void> {
    await this.triggerCarousels(page, options.maxCarouselClicks);
    await this.scrollToBottom(page, options.maxScrolls);
    await this.extractImages(page, result, options.rawHtml);
    await this.extractBgImages(page, result);
    await this.extractPictureSources(page, result);

    // ─── Debug en consola ──────────────────────────────────────────
    this.logDebug(result);
  }

  // ─── Carousels / Sliders ─────────────────────────────────────────

  /**
   * Detecta y clickea elementos de navegación de carousels para forzar
   * la carga de imágenes lazy en slides ocultos.
   */
  private async triggerCarousels(page: Page, maxClicks = 25): Promise<void> {
    // ─── Dots / paginación ───────────────────────────────────────
    const dotSelectors = [
      '.slick-dots li',
      '.slick-dots button',
      '.swiper-pagination-bullet',
      '.owl-dot',
      '.carousel-indicators li',
      '.carousel-indicators button',
      '[data-bs-slide-to]',
      '.carousel-dot',
      '[role="tab"]:not([aria-selected="true"])',
    ];

    for (const selector of dotSelectors) {
      const elements = await page.$$(selector);
      for (const el of elements) {
        try {
          await el.click();
          await page.waitForTimeout(400);
        } catch {
          // Elemento no clickeable → seguir
        }
      }
    }

    // ─── Flechas "siguiente" ────────────────────────────────────
    const nextSelectors = [
      '.slick-next',
      '.slick-arrow.slick-next',
      '.swiper-button-next',
      '.carousel-control-next',
      '.carousel-control-next-icon',
      '.owl-next',
      'button[aria-label="Next"]',
      'button[aria-label="Siguiente"]',
      'button[aria-label="next"]',
      'button[aria-label="siguiente"]',
      'a[aria-label="Next"]',
      'a[aria-label="next"]',
      '.next:not(.sr-only)',
      '[data-slide="next"]',
    ];

    for (const selector of nextSelectors) {
      const button = await page.$(selector);
      if (!button) continue;

      for (let i = 0; i < maxClicks; i++) {
        try {
          if (!(await button.isVisible())) break;
          await button.click();
          await page.waitForTimeout(300);
        } catch {
          break;
        }
      }
    }

    // ─── Genéricos (SVG, carousel classes) ──────────────────────
    const genericNext = await page.$$(
      'button:has(svg), button:has(span.carousel-control), [class*="carousel"] button, [class*="slick"] button'
    );
    for (const btn of genericNext) {
      try {
        const text = await btn.textContent();
        if (text && /^(>|›|❯|→|next|siguiente|\u276F|\u25B6)$/i.test(text.trim())) {
          for (let i = 0; i < Math.min(maxClicks, 15); i++) {
            if (!(await btn.isVisible())) break;
            await btn.click();
            await page.waitForTimeout(300);
          }
        }
      } catch {
        // ignorar errores menores
      }
    }

    await page.waitForTimeout(800);
  }

  // ─── Scroll para lazy loading ────────────────────────────────────

  /**
   * Scrollea la página completa para activar el lazy loading de imágenes.
   *
   * Estrategia mejorada:
   *   - Scroll más lento (300ms entre pasos) para dar tiempo a IntersectionObserver
   *   - Múltiples pasadas: scroll down, espera, scroll up, scroll down again
   *   - Dispara eventos de scroll manualmente como fallback
   */
  private async scrollToBottom(page: Page, maxScrolls = 100): Promise<void> {
    const scrollStep = 800;
    const scrollDelay = 300;

    // Pasada 1: scroll down lento
    await this.scrollPass(page, scrollStep, scrollDelay, maxScrolls);

    // Pequeña pausa para que carguen imágenes rezagadas
    await page.waitForTimeout(1_500);

    // Pasada 2: scroll up + down again para activar imágenes que necesitan
    // entrar al viewport desde arriba
    await page.evaluate('window.scrollTo(0, 0)');
    await page.waitForTimeout(500);
    await this.scrollPass(page, scrollStep, scrollDelay, Math.min(maxScrolls, 30));

    // Intentar disparar eventos de scroll manualmente (fallback para sitios tricky)
    await page.evaluate(`window.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize'));`);

    await page.waitForTimeout(1_000);
    await page.evaluate('window.scrollTo(0, 0)');
    await page.waitForTimeout(500);
  }

  /**
   * Una pasada de scroll: va bajando de a scrollStep píxeles.
   */
  private async scrollPass(page: Page, step: number, delay: number, max: number): Promise<void> {
    let prevHeight = 0;
    let scrolls = 0;
    let stalledCount = 0;

    while (scrolls < max) {
      const newHeight = await page.evaluate('document.body.scrollHeight') as number;

      if (newHeight === prevHeight) {
        stalledCount++;
        if (stalledCount >= 3) break;
      } else {
        stalledCount = 0;
      }

      prevHeight = newHeight;
      await page.evaluate(`window.scrollBy(0, ${step})`);
      await page.waitForTimeout(delay);
      scrolls++;
    }
  }

  // ─── Extracción de imágenes ─────────────────────────────────────

  /**
   * Busca en el HTML original las URLs de imágenes que tienen `<img alt>`
   * (atributo sin valor). El DOM normaliza `<img alt>` a `<img alt="">`,
   * así que necesitamos el HTML crudo de la respuesta HTTP.
   */
  private findBareSources(rawHtml: string, baseUrl: string): Set<string> {
    const bareSources = new Set<string>();
    const imgRegex = /<img\b[^>]*>/gi;
    let match: RegExpExecArray | null;

    while ((match = imgRegex.exec(rawHtml)) !== null) {
      const tag = match[0];
      const hasBareAlt = /(?:^|\s)alt(?:\s|\/?>)/i.test(tag) && !/(?:^|\s)alt\s*=/i.test(tag);
      if (!hasBareAlt) continue;

      const attrRegex = /\b(?:src|data-src|data-lazy-src|srcset|data-srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
      let attr: RegExpExecArray | null;
      while ((attr = attrRegex.exec(tag)) !== null) {
        const value = attr[1] ?? attr[2] ?? attr[3] ?? '';
        for (const candidate of value.split(',').map((item) => item.trim().split(/\s+/)[0]).filter(Boolean)) {
          try {
            bareSources.add(new URL(candidate, baseUrl).href);
          } catch {
            // Un valor inválido no impide clasificar el resto de imágenes.
          }
        }
      }
    }

    return bareSources;
  }

  private async extractImages(page: Page, result: SeoResult, rawHtml?: string): Promise<void> {
    interface RawImage {
      src: string;
      alt: string;
      hasAlt: boolean;
      currentSrc: string;
    }

    // Si tenemos raw HTML, detectar srcs con bare alt
    const bareSources = rawHtml ? this.findBareSources(rawHtml, page.url()) : new Set<string>();

    // Extraer <img> tags
    const images = await page
      .$$eval('img', (els) =>
        els.map((el) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const src = (el as any).src ?? '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const alt = (el as any).alt ?? '';
          const hasAlt = el.hasAttribute('alt');
          const currentSrc = (el as { currentSrc?: string }).currentSrc ?? src;
          return { src, alt, hasAlt, currentSrc };
        })
      )
      .catch(() => [] as RawImage[]);

    // Extraer <video poster="..."> — también son imágenes que necesitan descripción
    const videoPosters = await page
      .$$eval('video[poster]', (els) =>
        els.map((el) => {
          const poster = el.getAttribute('poster') ?? '';
          // El alt equivalente de un video suele estar en aria-label o title
          const ariaLabel = el.getAttribute('aria-label') ?? '';
          const title = el.getAttribute('title') ?? '';
          const altText = ariaLabel || title;
          return {
            src: poster,
            alt: altText,
            hasAlt: altText.length > 0,
            currentSrc: poster,
          };
        })
      )
      .catch(() => [] as RawImage[]);

    // Extraer <iframe> de video embebidos (YouTube, Vimeo, Dailymotion, Facebook)
    // Los iframes no tienen alt, pero pueden tener title para accesibilidad
    const videoIframes = await page
      .$$eval(
        'iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"], iframe[src*="dailymotion"], iframe[src*="facebook.com/plugins/video"]',
        (els) =>
          els.map((el) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const src = (el as any).src ?? '';
            const title = el.getAttribute('title') ?? '';
            return {
              src,
              alt: title,
              hasAlt: title.length > 0,
              currentSrc: src,
            };
          }),
      )
      .catch(() => [] as RawImage[]);

    const allImages = [...images, ...videoPosters, ...videoIframes];

    result.totalImages = allImages.length;

    // Clasificar cada imagen
    const analyzed: ImageAnalysis[] = allImages.map((img) => {
      const isBare = bareSources.has(img.src) || bareSources.has(img.currentSrc);

      return {
        src: img.src,
        alt: img.alt,
        category: classifyAlt(img.alt, img.hasAlt, !isBare),
      };
    });
    result.images = analyzed;

    const problematic = analyzed.filter((img) => isAltIssue(img.category));
    result.imagesWithoutAlt = problematic.length;
    result.imagesWithoutAltList = problematic
      .map((img) => img.src)
      .filter(Boolean);
    ImageCollector.applyAltQuality(result);
  }

  /** Recalcula hallazgos de calidad después de completar el inventario de imágenes. */
  static applyAltQuality(result: SeoResult): void {
    const assessment = assessImageAltQuality(result.images);
    result.altQualityIssues = assessment.issues;
    result.altQualityErrorCount = assessment.errorCount;
    result.altQualityReviewCount = assessment.reviewCount;
  }

  // ─── Background images (CSS) ──────────────────────────────────

  /**
   * Extrae imágenes de fondo CSS (background-image) del DOM.
   * Solo elementos con contenido visual: div, section, article, figure, header, etc.
   */
  private async extractBgImages(page: Page, result: SeoResult): Promise<void> {
    try {
      const bgImages = await page.evaluate(() => {
        interface BgItem { src: string; alt: string; element: string; }
        const results: BgItem[] = [];
        const selectors = ['div', 'section', 'article', 'figure', 'header', 'footer', 'aside', 'main', 'span', 'a', 'button'];
        // @ts-expect-error - browser context
        const elements = document.querySelectorAll(selectors.join(','));

        for (const el of elements) {
          // @ts-expect-error - browser context
          const style = window.getComputedStyle(el);
          const bg = style.backgroundImage;
          if (!bg || bg === 'none' || !bg.includes('url(')) continue;

          const urls: string[] = [];
          const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
          let m: RegExpExecArray | null;
          while ((m = urlRegex.exec(bg)) !== null) {
            urls.push(m[1]);
          }
          if (urls.length === 0) continue;

          const alt = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          const cls = (Array.from(el.classList) as string[]).slice(0, 2).map((c) => `.${c}`).join('');
          const elementRef = `${tag}${id}${cls}`;

          for (const src of urls) {
            let absoluteSrc: string;
            try {
              // @ts-expect-error - browser context
              absoluteSrc = new URL(src, window.location.href).href;
            } catch {
              absoluteSrc = src;
            }
            results.push({ src: absoluteSrc, alt, element: elementRef });
          }
        }
        return results;
      }) as BgImageAnalysis[];

      result.backgroundImages = bgImages;
      result.totalBgImages = bgImages.length;

      if (bgImages.length > 0) {
        console.log(`  🎨 Background images: ${bgImages.length}`);
      }
    } catch {
      result.backgroundImages = [];
      result.totalBgImages = 0;
    }
  }

  // ─── Picture sources ──────────────────────────────────────────

  /**
   * Extrae elementos <picture> con sus <source> y media queries.
   */
  private async extractPictureSources(page: Page, result: SeoResult): Promise<void> {
    try {
      const sources = await page.evaluate(() => {
        interface PicItem { src: string; media: string; alt: string; }
        const results: PicItem[] = [];
        // @ts-expect-error - browser context
        const pictures = document.querySelectorAll('picture');

        for (const pic of pictures) {
          const img = pic.querySelector('img');
          const alt = img?.getAttribute('alt') ?? '';
          const sourceEls = pic.querySelectorAll('source');

          for (const src of sourceEls) {
            const media = src.getAttribute('media') ?? '';
            const srcset = src.getAttribute('srcset') ?? '';
            if (!srcset) continue;

            const firstUrl = srcset.split(',')[0].trim().split(/\s+/)[0];
            let absoluteSrc: string;
            try {
              // @ts-expect-error - browser context
              absoluteSrc = new URL(firstUrl, window.location.href).href;
            } catch {
              absoluteSrc = firstUrl;
            }

            results.push({ src: absoluteSrc, media: media || '(default)', alt });
          }
        }
        return results;
      }) as PictureSourceAnalysis[];

      result.pictureSources = sources;

      if (sources.length > 0) {
        console.log(`  📐 Picture sources: ${sources.length} (${sources.filter(s => s.media !== '(default)').length} con media query)`);
      }
    } catch {
      result.pictureSources = [];
    }
  }

  // ─── Debug ─────────────────────────────────────────────────────

  private logDebug(result: SeoResult): void {
    if (!result.images || result.images.length === 0) return;

    const missing = result.images.filter((i) => i.category === 'missing');
    const empty = result.images.filter((i) => i.category === 'empty');
    const bare = result.images.filter((i) => i.category === 'bare');
    const generic = result.images.filter((i) => i.category === 'generic');
    const descriptive = result.images.filter((i) => i.category === 'descriptive');

    console.log(`  📊 Alt: ${descriptive.length}✅ ${generic.length}🟡 ${empty.length}⚪ ${bare.length}🟠 ${missing.length}🔴`);

    // Mostrar muestra de imágenes problemáticas (hasta 3 de cada)
    const showSample = (list: ImageAnalysis[], label: string, icon: string) => {
      if (list.length === 0) return;
      const sample = list.slice(0, 3);
      for (const img of sample) {
        console.log(`  ${icon} [${label}] src="${img.src.substring(0, 50)}" alt="${img.alt.substring(0, 40)}"`);
      }
      if (list.length > 3) {
        console.log(`  ${icon} ... y ${list.length - 3} más`);
      }
    };

    showSample(missing, 'missing', '🔴');
    showSample(empty, 'empty', '⚪');
    showSample(bare, 'bare', '🟠');
    showSample(generic, 'generic', '🟡');
  }

  // ─── Helpers públicos ───────────────────────────────────────────

  /**
   * Activa lazy loading en una página (scroll + carousels).
   * Útil para paginación cuando se navega a una nueva página.
   */
  async activateLazyLoading(page: Page, options: ScrapeOptions = {}): Promise<void> {
    await this.triggerCarousels(page, options.maxCarouselClicks);
    await this.scrollToBottom(page, options.maxScrolls);
  }

  /**
   * Extrae imágenes sin mantener estado interno (para merge de paginación).
   * Retorna los datos crudos para que el caller decida cómo mergearlos.
   */
  async extractRaw(page: Page, rawHtml?: string): Promise<{
    totalImages: number;
    imagesWithoutAlt: number;
    imagesWithoutAltList: string[];
    images: ImageAnalysis[];
  }> {
    interface RawImage {
      src: string;
      alt: string;
      hasAlt: boolean;
      currentSrc: string;
    }

    const imgs = await page
      .$$eval('img', (els) =>
        els.map((el) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const src = (el as any).src ?? '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const alt = (el as any).alt ?? '';
          const hasAlt = el.hasAttribute('alt');
          const currentSrc = (el as { currentSrc?: string }).currentSrc ?? src;
          return { src, alt, hasAlt, currentSrc };
        })
      )
      .catch(() => [] as RawImage[]);

    const videoPosters = await page
      .$$eval('video[poster]', (els) =>
        els.map((el) => {
          const poster = el.getAttribute('poster') ?? '';
          const ariaLabel = el.getAttribute('aria-label') ?? '';
          const title = el.getAttribute('title') ?? '';
          const altText = ariaLabel || title;
          return {
            src: poster,
            alt: altText,
            hasAlt: altText.length > 0,
            currentSrc: poster,
          };
        })
      )
      .catch(() => [] as RawImage[]);

    const videoIframes = await page
      .$$eval(
        'iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"], iframe[src*="dailymotion"], iframe[src*="facebook.com/plugins/video"]',
        (els) =>
          els.map((el) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const src = (el as any).src ?? '';
            const title = el.getAttribute('title') ?? '';
            return {
              src,
              alt: title,
              hasAlt: title.length > 0,
              currentSrc: src,
            };
          }),
      )
      .catch(() => [] as RawImage[]);

    const allImages = [...imgs, ...videoPosters, ...videoIframes];
    const bareSources = rawHtml ? this.findBareSources(rawHtml, page.url()) : new Set<string>();
    const analyzed: ImageAnalysis[] = allImages.map((img) => ({
      src: img.src,
      alt: img.alt,
      category: classifyAlt(img.alt, img.hasAlt, !(bareSources.has(img.src) || bareSources.has(img.currentSrc))),
    }));

    const problematic = analyzed.filter((img) => isAltIssue(img.category));

    return {
      totalImages: allImages.length,
      imagesWithoutAlt: problematic.length,
      imagesWithoutAltList: problematic.map((img) => img.src).filter(Boolean),
      images: analyzed,
    };
  }
}
