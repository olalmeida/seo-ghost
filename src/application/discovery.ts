import type { Browser } from 'playwright';
import { discoverUrls } from '../discover.js';

export interface UrlDiscoveryOptions {
  /** Selector de enlaces de contenido. Por defecto conserva el modo artículos. */
  selector?: string;
  /** Tiempo máximo de navegación por página. */
  timeout?: number;
  /** Muestra el detalle del descubrimiento delegado. */
  verbose?: boolean;
  /** Máximo de páginas paginadas que se recorren por semilla o sección. */
  maxPages?: number;
  /** Primero obtiene secciones internas y luego las recorre para encontrar contenido. */
  recursive?: boolean;
  /** Incluye cualquier enlace interno descubierto, no solo artículos `.html`. */
  scrapeAll?: boolean;
}

export interface UrlDiscoveryResult {
  /** Semillas seguidas de las URLs descubiertas, sin deduplicar contra las semillas. */
  urls: string[];
  /** URLs descubiertas, deduplicadas y filtradas según el modo seleccionado. */
  discoveredUrls: string[];
  /** Selector efectivo usado durante el descubrimiento. */
  selector: string;
  /** Secciones internas encontradas en la primera fase recursiva. */
  sectionUrls: string[];
  /** Artículos encontrados directamente en las semillas durante la primera fase. */
  directArticleUrls: string[];
}

export type DiscoverUrls = (
  browser: Browser,
  seedUrl: string,
  selector: string,
  options: { timeout?: number; verbose?: boolean; maxPages?: number },
) => Promise<string[]>;

export interface UrlDiscoveryDependencies {
  discoverUrls?: DiscoverUrls;
}

/**
 * Coordina el descubrimiento para una auditoría sin acoplarlo al CLI.
 *
 * Conserva el comportamiento previo: las URLs de entrada siempre se mantienen,
 * el modo normal busca con el selector configurado y el recursivo toma como
 * secciones únicamente los enlaces del mismo origen que la primera semilla.
 */
export async function discoverAuditUrls(
  browser: Browser,
  seedUrls: readonly string[],
  options: UrlDiscoveryOptions = {},
  dependencies: UrlDiscoveryDependencies = {},
): Promise<UrlDiscoveryResult> {
  const findUrls = dependencies.discoverUrls ?? discoverUrls;
  const timeout = options.timeout;
  const verbose = options.verbose ?? false;
  const maxPages = options.maxPages ?? 1;
  const recursive = options.recursive ?? false;
  const scrapeAll = options.scrapeAll ?? false;
  const articleSelector = options.selector ?? 'a[href$=".html"]';
  const selector = scrapeAll ? (options.selector ?? 'a') : articleSelector;

  if (!recursive) {
    const found: string[] = [];
    for (const seedUrl of seedUrls) {
      found.push(...await findUrls(browser, seedUrl, selector, { timeout, verbose, maxPages }));
    }
    const discoveredUrls = unique(found);
    return {
      urls: [...seedUrls, ...discoveredUrls],
      discoveredUrls,
      selector,
      sectionUrls: [],
      directArticleUrls: [],
    };
  }

  const allLinks: string[] = [];
  for (const seedUrl of seedUrls) {
    allLinks.push(...await findUrls(browser, seedUrl, 'a', { timeout, verbose, maxPages }));
  }
  const initialOrigin = getOrigin(seedUrls[0]);
  const directArticleUrls = allLinks.filter((url) => url.endsWith('.html'));
  const sectionUrls = unique(allLinks.filter((url) => !url.endsWith('.html') && url.startsWith(initialOrigin)));

  const secondPhase: string[] = [];
  for (const sectionUrl of sectionUrls) {
    secondPhase.push(...await findUrls(browser, sectionUrl, scrapeAll ? 'a' : 'a[href$=".html"]', {
      timeout,
      verbose: false,
      maxPages,
    }));
  }

  const discoveredUrls = scrapeAll
    ? unique([...allLinks, ...secondPhase])
    : unique([...directArticleUrls, ...secondPhase]);

  return {
    urls: [...seedUrls, ...discoveredUrls],
    discoveredUrls,
    selector,
    sectionUrls,
    directArticleUrls,
  };
}

function unique(urls: readonly string[]): string[] {
  return [...new Set(urls)];
}

function getOrigin(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}
