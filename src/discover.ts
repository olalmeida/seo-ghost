import type { Browser, Page } from 'playwright';

/**
 * Opciones para el descubrimiento de URLs.
 */
export interface DiscoverOptions {
  /** Timeout de navegación por página seed (default: 30000) */
  timeout?: number;
  /** Mostrar logs en consola */
  verbose?: boolean;
  /** Máximo de páginas a recorrer en secciones paginadas (default: 1) */
  maxPages?: number;
}

/**
 * Selectores para detectar el botón "Siguiente" en paginación.
 */
const NEXT_PAGE_SELECTORS = [
  'a[rel="next"]',
  'a.pagination-next',
  'a.next',
  '.pagination a:last-child',
  '.pagination .next a',
  'a:has-text("Siguiente")',
  'a:has-text("Next")',
  'a:has-text("›")',
  'a:has-text("»")',
  'a.siguiente',
];

/**
 * Extrae links de una página que matchean un selector, filtrando por origen.
 */
async function extractLinksFromPage(
  page: Page,
  selector: string,
  origin: string,
  pageLabel: string,
  verbose: boolean,
): Promise<string[]> {
  const links = await page
    .$$eval(selector, (els, baseOrigin) =>
      els
        .map((el) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const href = (el as any).href ?? '';
          if (!href) return '';
          try {
            const u = new URL(href);
            return u.origin === baseOrigin ? u.href : '';
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i),
      origin,
    )
    .catch(() => [] as string[]);

  if (verbose) {
    console.log(`  🔍 [${pageLabel}] Encontrados ${links.length} links`);
  }

  return links;
}

/**
 * Busca un link a la página siguiente en la página actual.
 */
async function findNextPageUrl(page: Page, currentUrl: string): Promise<string | null> {
  // Primero intentar con selectores conocidos
  for (const sel of NEXT_PAGE_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const href = await el.evaluate((node: any) => node.href ?? node.getAttribute('href') ?? '');
        if (href) {
          try {
            const fullUrl = new URL(href, currentUrl).href;
            // No volver a la misma página
            if (fullUrl !== currentUrl) return fullUrl;
          } catch {
            // ignorar
          }
        }
      }
    } catch {
      // ignorar
    }
  }

  // Fallback: buscar el último link de paginación que tenga un número
  try {
    const pageLinks = await page.$$eval(
      '.pagination a, .pager a, nav[aria-label*="pagin"] a, [class*="pagin"] a',
      (els, baseUrl) =>
        els
          .map((el) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const href = (el as any).href ?? '';
            const text = el.textContent?.trim() ?? '';
            if (!href || !text) return null;
            // Si el texto es un número o contiene "siguiente"/"next"
            if (/^\d+$/.test(text) || /siguiente|next|›|»/i.test(text)) {
              try {
                return new URL(href, baseUrl).href;
              } catch {
                return null;
              }
            }
            return null;
          })
          .filter(Boolean),
      currentUrl,
    );

    if (pageLinks.length > 0) {
      // Tomar el último link que no sea la URL actual
      const unique = [...new Set(pageLinks as string[])];
      const next = unique.find((u) => u !== currentUrl);
      if (next) return next;
    }
  } catch {
    // ignorar
  }

  return null;
}

/**
 * Descubre URLs de artículos/notas a partir de una URL semilla (home, sección).
 *
 * Navega a la URL, extrae todos los `<a href>` que matchean el selector CSS,
 * los des-duplica y filtra por mismo origen.
 *
 * Si `maxPages > 1`, sigue la paginación ("Siguiente") para descubrir más URLs.
 *
 * @param browser - Instancia de Playwright Browser (debe estar lanzada)
 * @param seedUrl - URL de la página semilla
 * @param selector - Selector CSS para encontrar links de interés
 * @param options - Opciones adicionales
 * @returns Array de URLs absolutas descubiertas
 */
export async function discoverUrls(
  browser: Browser,
  seedUrl: string,
  selector: string,
  options: DiscoverOptions = {},
): Promise<string[]> {
  const { timeout = 30_000, verbose = false, maxPages = 1 } = options;
  const allLinks = new Set<string>();

  let origin: string;
  try {
    origin = new URL(seedUrl).origin;
  } catch {
    console.error(`  ✗ URL inválida: "${seedUrl}"`);
    return [];
  }

  if (verbose) {
    console.log(`  🔍 Descubriendo URLs desde: ${seedUrl}`);
    console.log(`  🔍 Selector: ${selector}`);
    if (maxPages > 1) console.log(`  🔍 Paginación: ${maxPages} páginas`);
  }

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  let currentUrl = seedUrl;
  let pagesVisited = 0;

  try {
    while (pagesVisited < maxPages) {
      pagesVisited++;
      const pageLabel = `página ${pagesVisited}/${maxPages}`;

      if (verbose) {
        console.log(`  🔍 Navegando a ${pageLabel}: ${currentUrl.substring(0, 80)}`);
      }

      await page.goto(currentUrl, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      // Pausa para que JS renderice
      await page.waitForTimeout(2_000);

      // Extraer links de la página actual
      const links = await extractLinksFromPage(page, selector, origin, pageLabel, verbose);
      for (const link of links) {
        allLinks.add(link);
      }

      if (verbose) {
        console.log(`  🔍 [${pageLabel}] Total acumulado: ${allLinks.size} URLs únicas`);
      }

      // Si no hay más páginas por recorrer, salir
      if (pagesVisited >= maxPages) break;

      // Buscar link a la página siguiente
      const nextUrl = await findNextPageUrl(page, currentUrl);
      if (!nextUrl || nextUrl === currentUrl) {
        if (verbose) console.log(`  🔍 No se encontró página siguiente.`);
        break;
      }

      currentUrl = nextUrl;
    }

    const result = [...allLinks];
    if (verbose) {
      console.log(`  🔍 Total URLs descubiertas desde ${seedUrl}: ${result.length}`);
      for (const link of result.slice(0, 5)) {
        console.log(`    → ${link}`);
      }
      if (result.length > 5) {
        console.log(`    → ... y ${result.length - 5} más`);
      }
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Error descubriendo URLs desde ${seedUrl}: ${msg}`);
    return [...allLinks]; // devolver lo que se encontró hasta el error
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}
