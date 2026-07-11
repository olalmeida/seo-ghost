import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import type { SeoResult, ScrapeOptions, WaitUntil, Checkpoint, StructuredDataItem } from './types.js';
import { getEvasionContext, EVASION_INIT_SCRIPT } from './evasion.js';
import { runAxeAnalysis } from './axe.js';
import { ProgressBar } from './progress.js';
import type { Collector } from './collectors/types.js';
import { MetaCollector } from './collectors/meta.collector.js';
import { HeadingCollector } from './collectors/heading.collector.js';
import { ImageCollector } from './collectors/image.collector.js';
import { PaginationCollector } from './collectors/pagination.collector.js';
import { OGCollector } from './collectors/og.collector.js';

/**
 * Orquestador principal de scraping.
 *
 * Responsabilidades:
 *   - Gestionar el lifecycle del navegador (Chrome del sistema o Chromium)
 *   - Iterar URLs con delay entre cada una
 *   - Navegación con estrategias de fallback
 *   - Detección y manejo de bloqueos (Cloudflare, WAF)
 *   - Ejecutar los collectors habilitados según opciones
 *   - Ejecutar axe-core si está habilitado
 *
 * Los COLLECTORS hacen la extracción de datos real:
 *   - MetaCollector   → title, description, canonical, robots
 *   - HeadingCollector → H1, H2, H3, jerarquía
 *   - ImageCollector  → imágenes, alt, carousels, lazy scroll
 *   - PaginationCollector → páginas adicionales (si maxPages > 1)
 */
export async function scrapeUrls(
  urls: string[],
  options: ScrapeOptions = {}
): Promise<SeoResult[]> {
  const {
    timeout = 30_000,
    delay = 1_000,
    waitUntil: preferredWait = 'domcontentloaded',
    useGooglebot = false,
    cacheBuster = true,
    maxPages = 1,
    runAxe = false,
    runSeo = true,
    checkpointPath,
    checkpointEvery = 10,
    existingResults,
    startIndex = 0,
    concurrency = 1,
  } = options;

  // ─── Configurar wait strategies ──────────────────────────────────
  const waitStrategies: WaitUntil[] = [preferredWait];
  if (preferredWait !== 'load') waitStrategies.push('load');
  if (preferredWait !== 'domcontentloaded') waitStrategies.push('domcontentloaded');

  // ─── Configurar collectors según opciones ──────────────────────
  const collectors: Collector[] = [];
  if (runSeo) {
    collectors.push(new MetaCollector());
    collectors.push(new OGCollector());
    collectors.push(new HeadingCollector());
    collectors.push(new ImageCollector());
    collectors.push(new PaginationCollector());
  }

  const activeCollectors = collectors.filter((c) => c.isEnabled(options));
  if (activeCollectors.length > 0) {
    console.log(`  🔌 Collectors activos: ${activeCollectors.map(c => c.name).join(', ')}`);
  }

  // ─── Barra de progreso ──────────────────────────────────────────
  const progress = urls.length > 1
    ? new ProgressBar(urls.length, startIndex)
    : null;

  // ─── Lanzar browser ──────────────────────────────────────────────
  const browser = await launchBrowser();

  try {
    if (concurrency <= 1) {
      // ─── Modo secuencial ────────────────────────────────────
      const results: SeoResult[] = [...(existingResults ?? [])];
      const context = await browser.newContext(getEvasionContext({}, useGooglebot));

      for (let i = startIndex; i < urls.length; i++) {
        const url = buildUrl(urls[i], cacheBuster);
        if (!url) continue;

        const result = await processSingleUrl(
          context, url, i, urls.length,
          { waitStrategies, timeout, runAxe, runSeo, useGooglebot, activeCollectors, options, progress },
        );

        results.push(result);

        // Checkpoint
        if (checkpointPath && checkpointEvery > 0 && (i + 1) % checkpointEvery === 0) {
          saveCheckpoint(checkpointPath, urls, results, i + 1);
        }

        if (i < urls.length - 1 && delay > 0) {
          await sleep(delay);
        }
      }

      await context.close();
      progress?.done();
      return results;
    } else {
      // ─── Modo concurrente ────────────────────────────────────
      const allResults: (SeoResult | undefined)[] = new Array(urls.length);

      // Copiar resultados existentes (por si hay resume)
      if (existingResults) {
        for (let i = 0; i < existingResults.length && i < urls.length; i++) {
          allResults[i] = existingResults[i];
        }
      }

      let nextIdx = startIndex;
      let completedCount = startIndex;

      // Crear N workers, cada uno con su propio context
      const workers = Array.from({ length: concurrency }, async (_, workerId) => {
        const context = await browser.newContext(getEvasionContext({}, useGooglebot));

        try {
          while (true) {
            const idx = nextIdx++;
            if (idx >= urls.length) break;

            const url = buildUrl(urls[idx], cacheBuster);
            if (!url) {
              allResults[idx] = createEmptyResult('');
              completedCount++;
              continue;
            }

            const result = await processSingleUrl(
              context, url, idx, urls.length,
              { waitStrategies, timeout, runAxe, runSeo, useGooglebot, activeCollectors, options, progress },
            );

            allResults[idx] = result;
            completedCount++;

            // Checkpoint: guardar después de cada URL en modo concurrente
            if (checkpointPath && checkpointEvery > 0 && completedCount % checkpointEvery === 0) {
              const cpResults = allResults.filter((r): r is SeoResult => r !== undefined);
              saveCheckpoint(checkpointPath, urls, cpResults, completedCount);
            }

            if (delay > 0) {
              await sleep(delay);
            }
          }
        } finally {
          await context.close();
        }
      });

      await Promise.all(workers);
      progress?.done();

      return allResults.filter((r): r is SeoResult => r !== undefined);
    }
  } finally {
    await browser.close();
  }
}

// ─── Navegación con fallback ─────────────────────────────────────

async function navigateWithFallback(
  page: Page,
  url: string,
  strategies: WaitUntil[],
  timeout: number
): Promise<Response | null> {
  let response: Response | null = null;
  let lastError: Error | null = null;

  for (const strategy of strategies) {
    try {
      response = await page.goto(url, { waitUntil: strategy, timeout });
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (strategy === strategies[strategies.length - 1]) {
        throw lastError;
      }
      console.log(`  ⚡ Falló con "${strategy}", reintentando con estrategia menos estricta...`);
    }
  }

  throw lastError ?? new Error('No se pudo navegar a la URL');
}

// ─── Manejo de bloqueos ─────────────────────────────────────────

async function handleBlockedResponse(
  page: Page,
  url: string,
  result: SeoResult,
  timeout: number,
  statusCode: number,
  headers: Record<string, string>
): Promise<void> {
  const cfRay = headers['cf-ray'];
  const server = headers['server'] ?? '';
  const isCloudflare = cfRay || server.includes('cloudflare');
  const blockedBy = isCloudflare ? 'Cloudflare' : 'WAF desconocido';

  console.log(`  ⚠️  ${blockedBy} bloqueó con ${statusCode}. Ejecutando estrategia anti-bloqueo...`);

  if (isCloudflare) {
    result.error = await handleCloudflareChallenge(page, url, timeout);
  } else {
    result.error = await handleGenericBlock(page, url, timeout);
  }

  if (result.error) {
    console.error(`  ✗ BLOQUEADO por ${blockedBy}: ${result.error}`);
  }
}

async function handleCloudflareChallenge(
  page: Page,
  url: string,
  timeout: number
): Promise<string | undefined> {
  console.log('  ⏳ Cloudflare detectado. Esperando 12s para que el challenge resuelva...');
  await sleep(12_000);

  const currentUrl = page.url();
  if (currentUrl !== url && currentUrl !== 'about:blank') {
    console.log(`  ✓ Redirigido a: ${currentUrl}`);
    return undefined;
  }

  console.log('  🔄 Reintentando con recarga...');
  try {
    const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3_000);

    const status2 = response?.status() ?? 0;
    if (status2 === 200 || (status2 >= 300 && status2 < 400)) {
      console.log(`  ✓ Recarga exitosa: Status ${status2}`);
      return undefined;
    }

    if (status2 === 403) {
      console.log('  🔄 Todavía bloqueado. Probando navegación intermedia...');
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
      await sleep(2_000);

      const response3 = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForTimeout(5_000);

      const status3 = response3?.status() ?? 0;
      if (status3 === 200 || (status3 >= 300 && status3 < 400)) {
        console.log(`  ✓ Navegación intermedia exitosa: Status ${status3}`);
        return undefined;
      }
    }
  } catch (err) {
    return `Cloudflare bloqueó el acceso: ${err instanceof Error ? err.message : String(err)}`;
  }

  return 'Cloudflare bloqueó el acceso incluso después de reintentos. Posible IP bloqueada o fingerprint detectado.';
}

async function handleGenericBlock(
  page: Page,
  url: string,
  timeout: number
): Promise<string | undefined> {
  console.log('  ⏳ Esperando 5s y reintentando...');
  await sleep(5_000);

  try {
    const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3_000);

    const status = response?.status() ?? 0;
    if (status === 200 || (status >= 300 && status < 400)) {
      console.log(`  ✓ Reintento exitoso: Status ${status}`);
      return undefined;
    }
  } catch (err) {
    return `WAF bloqueó el acceso: ${err instanceof Error ? err.message : String(err)}`;
  }

  return 'Acceso bloqueado por WAF incluso después de reintentos.';
}

// ─── Accesibilidad (axe-core) ──────────────────────────────────

async function runA11y(page: Page, result: SeoResult): Promise<void> {
  try {
    const violations = await runAxeAnalysis(page);
    result.axeViolations = violations;
    result.axeViolationCount = violations.length;

    if (violations.length === 0) {
      console.log(`  ♿ OK | Status: ${result.statusCode} | Accesibilidad: ✅ Sin violaciones`);
      return;
    }

    // Agrupar por severidad
    const critical = violations.filter((v) => v.severity === 'critical').length;
    const serious = violations.filter((v) => v.severity === 'serious').length;
    const moderate = violations.filter((v) => v.severity === 'moderate').length;
    const minor = violations.filter((v) => v.severity === 'minor').length;

    const parts: string[] = [];
    if (critical) parts.push(`🔴 ${critical} críticas`);
    if (serious) parts.push(`🟠 ${serious} serias`);
    if (moderate) parts.push(`🟡 ${moderate} moderadas`);
    if (minor) parts.push(`🔵 ${minor} menores`);

    console.log(`  ♿ OK | Status: ${result.statusCode} | Accesibilidad: ${violations.length} violaciones (${parts.join(', ')})`);

    for (const v of violations.slice(0, 5)) {
      const icon = v.severity === 'critical' ? '🔴' : v.severity === 'serious' ? '🟠' : '🟡';
      console.log(`    ${icon} ${v.id}: ${v.help} (${v.nodes} elementos)`);
    }
  } catch (err) {
    result.error = `axe-core: ${err instanceof Error ? err.message : String(err)}`;
    console.log(`  ♿ ERROR | Status: ${result.statusCode} | Accesibilidad: ${result.error}`);
  }
}

// ─── Browser Launcher ──────────────────────────────────────────

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-http2',
        '--no-sandbox',
      ],
    });
  } catch {
    console.log('  ⚡ Chrome del sistema no disponible, usando Chromium de Playwright...');
    return await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-http2',
        '--disable-client-hints',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Checkpoint ──────────────────────────────────────────────────

/**
 * Guarda un checkpoint con los resultados parciales.
 * Se llama periódicamente durante el scraping.
 */
function saveCheckpoint(
  path: string,
  urls: string[],
  results: SeoResult[],
  nextIndex: number,
): void {
  const cp: Checkpoint = {
    urls,
    results,
    nextIndex,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(cp, null, 2), 'utf-8');
}

/**
 * Carga un checkpoint guardado previamente.
 * Retorna null si no existe o no se puede leer.
 */
export function loadCheckpoint(path: string): Checkpoint | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    const cp = JSON.parse(raw) as Checkpoint;

    // Validar estructura básica
    if (!Array.isArray(cp.urls) || !Array.isArray(cp.results) || typeof cp.nextIndex !== 'number') {
      return null;
    }

    return cp;
  } catch {
    return null;
  }
}

// ─── Structured Data (JSON-LD) ──────────────────────────────────

/**
 * Extrae bloques JSON-LD (<script type="application/ld+json">) del DOM.
 * Parsea cada bloque, identifica @type(s), y reporta errores de parseo.
 */
async function extractStructuredData(
  page: Page,
): Promise<{ items: StructuredDataItem[]; count: number; valid: number }> {
  try {
    const rawScripts: string[] = await page.evaluate(() => {
      // @ts-expect-error - browser context
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      return Array.from(scripts).map((s: any) => s.textContent ?? '');
    });

    const items: StructuredDataItem[] = [];
    const seen = new Set<string>(); // dedup

    for (const raw of rawScripts) {
      const trimmed = raw.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);

      try {
        const parsed = JSON.parse(trimmed);
        const types = extractJsonLdTypes(parsed);
        items.push({ raw: trimmed, types: [...new Set(types)], valid: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        items.push({ raw: trimmed, types: [], valid: false, error: msg.slice(0, 120) });
      }
    }

    return {
      items,
      count: items.length,
      valid: items.filter((i) => i.valid).length,
    };
  } catch {
    return { items: [], count: 0, valid: 0 };
  }
}

/**
 * Extrae todos los @type de un objeto JSON-LD parseado.
 * Maneja arrays, @graph, y objetos anidados.
 */
function extractJsonLdTypes(obj: unknown): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const o = obj as Record<string, unknown>;

  if (Array.isArray(obj)) {
    return obj.flatMap((item) => extractJsonLdTypes(item));
  }

  const types: string[] = [];

  if (o['@graph'] && Array.isArray(o['@graph'])) {
    types.push(...o['@graph'].flatMap((item: unknown) => extractJsonLdTypes(item)));
  }

  if (o['@type']) {
    if (Array.isArray(o['@type'])) {
      types.push(...o['@type'].filter((t): t is string => typeof t === 'string'));
    } else if (typeof o['@type'] === 'string') {
      types.push(o['@type']);
    }
  }

  // También buscar type en sub-objetos (ej: carousels con múltiples items)
  for (const key of Object.keys(o)) {
    if (key.startsWith('@')) continue;
    if (Array.isArray(o[key])) {
      types.push(...(o[key] as unknown[]).flatMap((item) => extractJsonLdTypes(item)));
    } else if (o[key] && typeof o[key] === 'object') {
      types.push(...extractJsonLdTypes(o[key]));
    }
  }

  return types;
}

// ─── Estadísticas de contenido ──────────────────────────────────

/**
 * Extrae word count y paragraph count del DOM via page.evaluate.
 */
async function extractContentStats(
  page: Page,
): Promise<{ wordCount: number; paragraphCount: number }> {
  try {
    // page.evaluate corre en el contexto del browser, NO en Node.js
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats: any = await page.evaluate(() => {
      // @ts-expect-error - browser context (document.body)
      const body = document.body as any;
      if (!body) return { wordCount: 0, paragraphCount: 0 };

      const clone = body.cloneNode(true) as any;
      const removes = clone.querySelectorAll(
        'script, style, noscript, svg, [aria-hidden="true"], template',
      );
      removes.forEach((el: any) => el.remove());

      const text = clone.innerText ?? '';
      const words = text.split(/\s+/).filter((w: string) => w.length > 0).length;
      // @ts-expect-error - browser context
      const paragraphs = document.querySelectorAll('p').length;

      return { wordCount: words, paragraphCount: paragraphs };
    });

    return {
      wordCount: (stats?.wordCount ?? 0) as number,
      paragraphCount: (stats?.paragraphCount ?? 0) as number,
    };
  } catch {
    return { wordCount: 0, paragraphCount: 0 };
  }
}

// ─── Procesamiento de URL individual ─────────────────────────────

interface ProcessUrlContext {
  waitStrategies: WaitUntil[];
  timeout: number;
  runAxe: boolean;
  runSeo: boolean;
  useGooglebot: boolean;
  activeCollectors: Collector[];
  options: ScrapeOptions;
  progress: ProgressBar | null;
}

/**
 * Aplica cache buster a una URL.
 */
function buildUrl(raw: string, useCacheBuster: boolean): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!useCacheBuster) return trimmed;
  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}_cb=${Date.now()}`;
}

/**
 * Crea un objeto SeoResult vacío para una URL.
 */
function createEmptyResult(url: string): SeoResult {
  return {
    url,
    statusCode: null,
    metaTitle: null,
    metaDescription: null,
    canonical: null,
    metaRobots: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    ogUrl: null,
    ogType: null,
    twitterCard: null,
    twitterTitle: null,
    twitterDescription: null,
    twitterImage: null,
    h1Tags: [],
    h1Count: 0,
    h2Tags: [],
    h2Count: 0,
    h3Tags: [],
    h3Count: 0,
    headingIssues: [],
    totalImages: 0,
    imagesWithoutAlt: 0,
    imagesWithoutAltList: [],
    images: [],
    wordCount: 0,
    paragraphCount: 0,
    structuredData: [],
    structuredDataCount: 0,
    structuredDataValid: 0,
    backgroundImages: [],
    totalBgImages: 0,
    pictureSources: [],
  };
}

/**
 * Procesa una URL individual: navega, ejecuta collectors, axe, y retorna el resultado.
 * Crea y destruye su propia page dentro del context dado.
 */
async function processSingleUrl(
  context: BrowserContext,
  url: string,
  index: number,
  total: number,
  ctx: ProcessUrlContext,
): Promise<SeoResult> {
  const { waitStrategies, timeout, runAxe, runSeo, useGooglebot, activeCollectors, options: sharedOptions, progress } = ctx;
  // Copia local para no mutar el objeto compartido entre workers concurrentes
  const options = { ...sharedOptions };
  const result = createEmptyResult(url);
  const page = await context.newPage();

  await page.addInitScript(EVASION_INIT_SCRIPT);

  // Interceptar requests para eliminar headers que delatan automatización
  await page.route('**/*', async (route) => {
    const headers = route.request().headers();
    delete headers['sec-fetch-site'];
    delete headers['sec-fetch-mode'];
    delete headers['sec-fetch-dest'];
    delete headers['sec-fetch-user'];
    delete headers['upgrade-insecure-requests'];
    await route.continue({ headers });
  });

  try {
    const response = await navigateWithFallback(page, url, waitStrategies, timeout);
    await page.waitForTimeout(2_000);

    const statusCode = response?.status() ?? 0;
    const headers = response?.headers() ?? {};

    // Capturar el HTML original de la respuesta HTTP (antes del parseo)
    // para detectar atributos bare que el browser normaliza en el DOM
    try {
      const rawHtml = await response?.text();
      if (rawHtml) {
        options.rawHtml = rawHtml;
      }
    } catch {
      // Si falla (ej: stream ya consumido), seguir sin rawHtml
    }

    if (statusCode === 403 || statusCode === 429) {
      result.statusCode = statusCode;
      await handleBlockedResponse(page, url, result, timeout, statusCode, headers);
    } else {
      result.statusCode = statusCode;
    }

    if (!result.error) {
      const contentStats = await extractContentStats(page);
      result.wordCount = contentStats.wordCount;
      result.paragraphCount = contentStats.paragraphCount;

      const sd = await extractStructuredData(page);
      result.structuredData = sd.items;
      result.structuredDataCount = sd.count;
      result.structuredDataValid = sd.valid;

      for (const collector of activeCollectors) {
        await collector.extract(page, result, options);
      }

      if (runAxe) {
        await runA11y(page, result);
      }
    } else if (runAxe) {
      await runA11y(page, result);
    }

    const resultMsg = buildResultLine(index + 1, total, result, runSeo, runAxe);
    if (progress) {
      progress.tick(resultMsg);
    } else {
      console.log(resultMsg);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    const catchMsg = buildResultLine(index + 1, total, result, runSeo, runAxe);
    if (progress) {
      progress.tick(catchMsg);
    } else {
      console.error(catchMsg);
    }
  }

  await page.close().catch(() => {});
  return result;
}

// ─── Resultado por URL ────────────────────────────────────────────

/**
 * Construye una línea de resultado compacta para una URL procesada.
 * El formato varía según qué collectors se ejecutaron (SEO, a11y, o ambos).
 */
/**
 * Acorta una URL para mostrar en consola, manteniendo la parte informativa.
 * Ej: "https://www.ecuavisa.com/politica/caso-progen-karla-saud--20260710-0051.html"
 *   → ".../politica/caso-progen-karla-saud--20260710-0051.html"
 */
function shortenUrl(url: string, maxLen = 60): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length <= maxLen) return path;
    // Truncar dejando el final (donde está la fecha-ID)
    return `...${path.slice(-(maxLen - 3))}`;
  } catch {
    return url.length > maxLen ? `...${url.slice(-(maxLen - 3))}` : url;
  }
}

function buildResultLine(
  index: number,
  total: number,
  result: SeoResult,
  runSeo: boolean,
  runAxe: boolean,
): string {
  const shortUrl = shortenUrl(result.url, 55);

  if (result.error) {
    return `  ✗ #${index}/${total} | ${shortUrl} | ${result.error.slice(0, 100)}`;
  }

  const tags: string[] = [];

  if (runSeo) {
    tags.push(result.metaTitle ? '✅ Title' : '❌ Sin title');
    if (result.metaDescription) tags.push('✅ Desc');
    if (result.canonical) tags.push('🔗 Canonical');
    if (result.metaRobots) tags.push(`🤖 ${result.metaRobots}`);
    if (result.h1Count) tags.push(`H1: ${result.h1Count}`);
    if (result.h2Count) tags.push(`H2: ${result.h2Count}`);
    if (result.ogTitle) tags.push('OG: ✅');
    if (result.ogImage) tags.push('OG-img: ✅');
    if (result.twitterCard) tags.push('🐦 ✅');
    if (result.imagesWithoutAlt > 0) {
      tags.push(`🖼️  sin alt: ${result.imagesWithoutAlt}/${result.totalImages}`);
    }
    if (result.wordCount > 0) tags.push(`📝 ${result.wordCount} palabras`);
    if (result.paragraphCount > 0) tags.push(`¶ ${result.paragraphCount} párrafos`);
  }

  // Structured data (JSON-LD) — siempre que haya datos
  if (result.structuredDataCount > 0) {
    const valid = result.structuredDataValid;
    const invalid = result.structuredDataCount - valid;
    const allTypes = [...new Set(result.structuredData.flatMap((s) => s.types).filter(Boolean))];
    const typesStr = allTypes.length > 0 ? allTypes.slice(0, 3).join(', ') : '';
    const summary = typesStr ? `📊 ${valid} bloques (${typesStr})` : `📊 ${valid} bloques`;
    tags.push(invalid > 0 ? `${summary} ⚠️ ${invalid} inválidos` : summary);
  }

  if (runAxe && result.axeViolationCount !== undefined) {
    const severity = result.axeViolationCount === 0
      ? '✅ Sin violaciones'
      : `${result.axeViolationCount} violaciones`;
    tags.push(`♿ ${severity}`);
  }

  const label = tags.length > 0 ? tags.join(' | ') : '✓ OK';
  return `  ✓ #${index}/${total} | ${shortUrl} | ${label}`;
}
