import { chromium, type Browser, type Page, type Response } from 'playwright';
import type { SeoResult, ScrapeOptions, WaitUntil } from './types.js';
import { getEvasionContext, EVASION_INIT_SCRIPT } from './evasion.js';
import { runAxeAnalysis } from './axe.js';

/**
 * Procesa una lista de URLs extrayendo metadata SEO estricta de cada una.
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
  } = options;
  const results: SeoResult[] = [];

  const waitStrategies: WaitUntil[] = [preferredWait];
  if (preferredWait !== 'load') waitStrategies.push('load');
  if (preferredWait !== 'domcontentloaded') waitStrategies.push('domcontentloaded');

  // ─── Lanzar browser ──────────────────────────────────────────────
  // Preferir Chrome del sistema (no expone "HeadlessChrome" en Sec-CH-UA)
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext(getEvasionContext({}, useGooglebot));

    for (let i = 0; i < urls.length; i++) {
      let url = urls[i].trim();
      if (!url) continue;

      // Cache buster: agregar timestamp para evitar respuestas cacheadas
      if (cacheBuster) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}_cb=${Date.now()}`;
      }

      console.log(`[${i + 1}/${urls.length}] Procesando: ${url}`);

      const page = await context.newPage();
      await page.addInitScript(EVASION_INIT_SCRIPT);

      // Interceptar requests para eliminar headers que delatan automatización
      await page.route('**/*', async (route) => {
        const headers = route.request().headers();
        // Eliminar headers Sec-Fetch-* que solo envían navegadores reales
        // y pueden activar reglas de WAF (AWS WAF, CloudFront, etc.)
        delete headers['sec-fetch-site'];
        delete headers['sec-fetch-mode'];
        delete headers['sec-fetch-dest'];
        delete headers['sec-fetch-user'];
        delete headers['upgrade-insecure-requests'];
        await route.continue({ headers });
      });

      const result: SeoResult = {
        url,
        statusCode: null,
        metaTitle: null,
        canonical: null,
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
      };

      try {
        // ─── Navegación con fallback de estrategias ─────────────────
        let response = await navigateWithFallback(page, url, waitStrategies, timeout);

        // ─── Post-navegación: esperar para que JS renderice ─────────
        await page.waitForTimeout(2_000);

        // ─── Detectar y manejar bloqueos (403, challenge, etc.) ────
        const statusCode = response?.status() ?? 0;
        const headers = response?.headers() ?? {};

        if (statusCode === 403 || statusCode === 429) {
          result.statusCode = statusCode;

          const cfRay = headers['cf-ray'];
          const cfChallenge = headers['cf-challenge'];
          const server = headers['server'] ?? '';

          const isCloudflare = cfRay || server.includes('cloudflare');
          const blockedBy = isCloudflare ? 'Cloudflare' : 'WAF desconocido';

          console.log(`  ⚠️  ${blockedBy} bloqueó con ${statusCode}. Ejecutando estrategia anti-bloqueo...`);

          // ─── Estrategia de evasión para 403 ─────────────────────
          if (isCloudflare) {
            result.error = await handleCloudflareChallenge(page, url, timeout);
          } else {
            result.error = await handleGenericBlock(page, url, timeout);
          }

          // Si pudimos resolver, extraer metadata
          if (result.error) {
            console.error(`  ✗ BLOQUEADO por ${blockedBy}: ${result.error}`);
          } else if (runAxe) {
            // ─── Modo solo accesibilidad ──────────────────────────
            // Saltamos SEO (H tags, imágenes) y solo ejecutamos axe-core
            await runA11y(page, result);
          } else {
            // ─── Modo SEO completo ────────────────────────────────
            await extractMetadata(page, result);
            await handlePagination(page, result, maxPages);
            console.log(`  ✓ OK | Status: ${result.statusCode} | H1: ${result.h1Count} | H2: ${result.h2Count} | H3: ${result.h3Count} | Img sin alt: ${result.imagesWithoutAlt}/${result.totalImages} | Issues: ${result.headingIssues.length}`);
          }
        } else if (runAxe) {
          // ─── Modo solo accesibilidad ──────────────────────────────
          result.statusCode = statusCode;
          await runA11y(page, result);
        } else {
          // ─── Modo SEO completo ────────────────────────────────────
          result.statusCode = statusCode;
          await extractMetadata(page, result);
          await handlePagination(page, result, maxPages);
          console.log(`  ✓ OK | Status: ${result.statusCode} | H1: ${result.h1Count} | H2: ${result.h2Count} | H3: ${result.h3Count} | Img sin alt: ${result.imagesWithoutAlt}/${result.totalImages} | Issues: ${result.headingIssues.length}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.error = message;
        console.error(`  ✗ ERROR: ${message}`);
      }

      results.push(result);
      await page.close().catch(() => {});

      if (i < urls.length - 1 && delay > 0) {
        await sleep(delay);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return results;
}

// ─── Estrategias de navegación ─────────────────────────────────────

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

// ─── Manejo de bloqueo Cloudflare ──────────────────────────────────

async function handleCloudflareChallenge(
  page: Page,
  url: string,
  timeout: number
): Promise<string | undefined> {
  // Estrategia 1: esperar a que el challenge de Cloudflare resuelva solo
  console.log('  ⏳ Cloudflare detectado. Esperando 12s para que el challenge resuelva...');
  await sleep(12_000);

  // Verificar si la página se redirigió automáticamente
  const currentUrl = page.url();
  if (currentUrl !== url && currentUrl !== 'about:blank') {
    console.log(`  ✓ Redirigido a: ${currentUrl}`);
    return undefined; // Resuelto!
  }

  // Estrategia 2: recargar la página (a veces en el segundo intento pasa)
  console.log('  🔄 Reintentando con recarga...');
  try {
    const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3_000);

    const currentUrl2 = page.url();
    const status2 = response?.status() ?? 0;

    if (status2 === 200 || (status2 >= 300 && status2 < 400)) {
      console.log(`  ✓ Recarga exitosa: Status ${status2}`);
      return undefined;
    }

    // Estrategia 3: navegar a otra página y volver (reiniciar sesión HTTP)
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
    // Si la recarga falla, devolver error
    return `Cloudflare bloqueó el acceso: ${err instanceof Error ? err.message : String(err)}`;
  }

  return 'Cloudflare bloqueó el acceso incluso después de reintentos. Posible IP bloqueada o fingerprint detectado.';
}

// ─── Manejo de bloqueo genérico (no Cloudflare) ────────────────────

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

// ─── Extracción de metadata ────────────────────────────────────────

async function extractMetadata(page: Page, result: SeoResult): Promise<void> {
  const pageTitle = await page.title().catch(() => '');

  // Si el título sigue siendo "Just a moment" o "Error 403", el challenge no se resolvió
  if (pageTitle.includes('Just a moment') || pageTitle === 'Error 403') {
    result.error = 'Cloudflare challenge no resuelto.';
    return;
  }

  // <title>
  result.metaTitle = pageTitle || null;

  // <link rel="canonical">
  result.canonical = await page
    .$eval('link[rel="canonical"]', (el) => el.getAttribute('href'))
    .catch(() => null);

  // ─── H1 ─────────────────────────────────────────────────────────
  result.h1Tags = await page
    .$$eval('h1', (els) =>
      els.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
    )
    .catch(() => []);
  result.h1Count = result.h1Tags.length;

  // ─── H2 ─────────────────────────────────────────────────────────
  result.h2Tags = await page
    .$$eval('h2', (els) =>
      els.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
    )
    .catch(() => []);
  result.h2Count = result.h2Tags.length;

  // ─── H3 ─────────────────────────────────────────────────────────
  result.h3Tags = await page
    .$$eval('h3', (els) =>
      els.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
    )
    .catch(() => []);
  result.h3Count = result.h3Tags.length;

  // ─── Debug: mostrar headings detectados ────────────────────────
  if (result.h1Count > 0) {
    const sample = result.h1Tags.slice(0, 3);
    console.log(`  📝 H1 (${result.h1Count}): ${sample.map(h => JSON.stringify(h.substring(0, 50))).join(', ')}${result.h1Count > 3 ? `, +${result.h1Count - 3} más` : ''}`);
  } else {
    console.log(`  📝 H1: 0 (sin H1 en la página)`);
  }
  if (result.h2Count > 0) {
    console.log(`  📝 H2 (${result.h2Count}): ${result.h2Tags.slice(0, 3).map(h => JSON.stringify(h.substring(0, 40))).join(', ')}${result.h2Count > 3 ? `, +${result.h2Count - 3} más` : ''}`);
  }
  if (result.h3Count > 0) {
    console.log(`  📝 H3 (${result.h3Count}): ${result.h3Tags.slice(0, 3).map(h => JSON.stringify(h.substring(0, 40))).join(', ')}${result.h3Count > 3 ? `, +${result.h3Count - 3} más` : ''}`);
  }

  // ─── Validación de jerarquía de headings ───────────────────────
  const issues: string[] = [];

  // 1. Múltiples H1
  if (result.h1Count === 0) {
    issues.push('No hay H1 en la página');
  } else if (result.h1Count > 1) {
    issues.push(`Múltiples H1 (${result.h1Count} encontrados). Se recomienda solo un H1 por página.`);
  }

  // 2. Salto de jerarquía: H1 presente, H2 ausente, H3 presente
  if (result.h1Count > 0 && result.h2Count === 0 && result.h3Count > 0) {
    issues.push('Salto de jerarquía: hay H1 y H3 pero no H2 intermedio');
  }

  // 3. H1 vacío o muy largo
  for (const h1 of result.h1Tags) {
    if (h1.length > 150) {
      issues.push(`H1 muy largo (${h1.length} caracteres): "${h1.substring(0, 60)}..."`);
    }
  }

  // 4. Más H2 que H1 (puede ser normal, pero sin H1 es problema)
  if (result.h1Count === 0 && result.h2Count > 0) {
    issues.push('Hay H2 pero no hay H1 en la página');
  }

  result.headingIssues = issues;

  // ─── Imágenes ───────────────────────────────────────────────────
  // Primero: clickear carousels para disparar carga de imágenes lazy.
  // Los sliders/carousels esconden las imágenes en slides no visibles;
  // solo se cargan cuando el usuario navega a ese slide.
  await triggerCarousels(page);

  // Luego scrolleamos toda la página para activar lazy loading básico.
  await scrollToBottom(page);

  // IMPORTANTE:
  //  - src: usamos el.src (NO getAttribute) para obtener la URL ABSOLUTA
  //    resuelta por el navegador. getAttribute('src') devuelve rutas
  //    relativas tal cual están en el HTML → 404 al abrirlas.
  //  - alt: usamos el.alt (NO getAttribute) porque los frameworks JS
  //    asignan el alt como propiedad DOM, no como atributo HTML.
  //    getAttribute('alt') devuelve null aunque el alt sea visible.
  const images = await page
    .$$eval('img', (els) =>
      els.map((el) => ({
        src: el.src ?? '',     // ← URL absoluta resuelta por el navegador
        alt: el.alt ?? '',     // ← propiedad DOM (refleja JS + HTML)
      }))
    )
    .catch(() => []);

  result.totalImages = images.length;

  // ─── Detección de imágenes sin alt ─────────────────────────────
  // Limpieza: eliminamos caracteres zero-width, &nbsp; (codificado como \xa0),
  // y cualquier caracter de control antes de determinar si el alt está vacío.
  const hasMeaningfulAlt = (alt: string): boolean => {
    // Remover: espacios, zero-width space (\u200B), zero-width joiner (\u200D),
    // BOM (\uFEFF), non-breaking space (\u00A0), y caracteres de control
    const cleaned = alt.replace(/[\s\u200B-\u200D\uFEFF\u00A0\x00-\x1F\x7F]+/g, '').trim();
    return cleaned.length > 0;
  };

  const withoutAlt = images.filter((img) => !hasMeaningfulAlt(img.alt));
  result.imagesWithoutAlt = withoutAlt.length;
  result.imagesWithoutAltList = withoutAlt
    .map((img) => img.src)
    .filter(Boolean);

  // Debug: mostrar las primeras imágenes sin alt para verificar
  if (withoutAlt.length > 0) {
    for (const img of withoutAlt.slice(0, 5)) {
      const altPreview = img.alt.length > 0
        ? JSON.stringify(img.alt.substring(0, 100))
        : '"" (string vacío — el alt no existe o está vacío en el DOM)';
      console.log(`  🖼️  Sin alt: src="${img.src.substring(0, 55)}" | alt=${altPreview}`);
    }
    if (withoutAlt.length > 5) {
      console.log(`  🖼️  ... y ${withoutAlt.length - 5} más sin alt`);
    }
  }

  // Debug: mostrar las primeras imágenes CON alt como verificación
  const withAlt = images.filter((img) => hasMeaningfulAlt(img.alt));
  if (withAlt.length > 0) {
    const sample = withAlt.slice(0, 3);
    for (const img of sample) {
      const altPreview = JSON.stringify(img.alt.substring(0, 80));
      console.log(`  ✅ Con alt:  src="${img.src.substring(0, 55)}" | alt=${altPreview}`);
    }
  }
}

// ─── Carousels / Sliders ──────────────────────────────────────────

/**
 * Detecta y clickea elementos de navegación de carousels para forzar
 * la carga de imágenes lazy en slides ocultos.
 *
 * Cubre los principales frameworks de slider:
 *   - Slick       → .slick-next, .slick-dots li button
 *   - Swiper      → .swiper-button-next, .swiper-pagination-bullet
 *   - OwlCarousel → .owl-next, .owl-dot
 *   - Bootstrap   → .carousel-control-next, [data-bs-slide-to]
 *   - Genérico    → [aria-label="Next"], button con > › ❯, .next, dots
 */
async function triggerCarousels(page: Page): Promise<void> {
  // ─── 1. Clickear dots / paginación ─────────────────────────────
  // Cada dot representa un slide; clickearlos todos fuerza la carga.
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
        // Si el elemento no es clickeable, seguimos con el próximo
      }
    }
  }

  // ─── 2. Clickear flechas "siguiente" repetidamente ─────────────
  // Algunos carousels cargan slides bajo demanda (infinite scroll).
  // Clickear next varias veces recorre todos los slides.
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

    // Clickear hasta 25 veces para avanzar por todos los slides
    // (los carousels en bucle nunca se quedan sin botón)
    for (let i = 0; i < 25; i++) {
      try {
        if (!(await button.isVisible())) break;
        await button.click();
        await page.waitForTimeout(300);
      } catch {
        break;
      }
    }
  }

  // ─── 3. Clickear flechas de carousel con clase offset ──────────
  // Algunos carousels colocan left/right offsets en lugar de next.
  // Buscamos botones que matcheen patrones de carousel.
  const genericNext = await page.$$(
    'button:has(svg), button:has(span.carousel-control), [class*="carousel"] button, [class*="slick"] button'
  );
  for (const btn of genericNext) {
    try {
      const text = await btn.textContent();
      if (text && /^(>|›|❯|→|next|siguiente|\u276F|\u25B6)$/i.test(text.trim())) {
        for (let i = 0; i < 15; i++) {
          if (!(await btn.isVisible())) break;
          await btn.click();
          await page.waitForTimeout(300);
        }
      }
    } catch {
      // ignorar errores menores (elemento detached, etc.)
    }
  }

  // Pequeña pausa para que terminen de cargar las imágenes disparadas
  await page.waitForTimeout(800);
}

// ─── Scroll para lazy loading ─────────────────────────────────────

/**
 * Scrollea la página completa para activar el lazy loading de imágenes.
 *
 * Los sitios modernos usan:
 *   - loading="lazy" → la imagen no se agrega al DOM hasta que entra al viewport
 *   - IntersectionObserver → igual, necesita scroll para dispararse
 *
 * Esto asegura que capturamos TODAS las imágenes, no solo las del pliegue inicial.
 *
 * @param page - Página de Playwright a scrollear
 */
async function scrollToBottom(page: Page): Promise<void> {
  const scrollStep = 800;   // px por scroll
  const scrollDelay = 150;  // ms entre scrolls
  const maxScrolls = 100;   // safety: no más de 100 scrolls

  let prevHeight = 0;
  let scrolls = 0;
  let stalledCount = 0;

  while (scrolls < maxScrolls) {
    // Usamos strings en evaluate() para que TS no exija tipos DOM
    const newHeight = await page.evaluate('document.body.scrollHeight') as number;

    // Si la altura no cambió por 3 intentos seguidos → asumimos que llegamos al final
    if (newHeight === prevHeight) {
      stalledCount++;
      if (stalledCount >= 3) break;
    } else {
      stalledCount = 0;
    }

    prevHeight = newHeight;
    await page.evaluate(`window.scrollBy(0, ${scrollStep})`);
    await page.waitForTimeout(scrollDelay);
    scrolls++;
  }

  // Volver al inicio para que la próxima extracción vea la página desde arriba
  await page.evaluate('window.scrollTo(0, 0)');
  await page.waitForTimeout(500);
}

// ─── Accesibilidad (axe-core) ──────────────────────────────────────

/**
 * Modo solo accesibilidad: ejecuta axe-core y muestra resultados.
 * NO corre extractMetadata ni handlePagination.
 */
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

// ─── Paginación ───────────────────────────────────────────────────

/**
 * Detecta el patrón de URL para paginación a partir del href del
 * enlace "Siguiente", y navega DIRECTAMENTE a las URLs construidas.
 *
 * Esto es mucho más rápido y confiable que clickear botones porque:
 *   - No depende de que el botón sea visible/clickeable
 *   - No espera animaciones JS de transición entre páginas
 *   - Funciona aunque el botón esté fuera del viewport
 *
 * @param page     - Página actual (ya navegada a página 1)
 * @param result   - Resultado a mergear
 * @param maxPages - Máximo de páginas a recorrer
 */
async function handlePagination(page: Page, result: SeoResult, maxPages: number): Promise<void> {
  if (maxPages <= 1) return;

  // ─── Detectar patrón de URL de paginación ──────────────────────
  const urlPattern = await detectUrlPattern(page, result.url);

  if (!urlPattern) {
    console.log('  📄 Paginación: no se detectó patrón de URL (sin "Siguiente" con href numérico)');
    return;
  }

  console.log(`  📄 Patrón detectado: ${urlPattern.replace('{n}', 'N')}`);

  // Set para evitar duplicar URLs de imágenes sin alt
  const seenImageUrls = new Set(result.imagesWithoutAltList);

  for (let p = 2; p <= maxPages; p++) {
    const pageUrl = urlPattern.replace('{n}', String(p));
    console.log(`  📄 Yendo a página ${p}: ${pageUrl}`);

    try {
      // Navegación directa → mucho más rápido que clickear
      const response = await page.goto(pageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      const statusCode = response?.status() ?? 0;
      if (statusCode === 404) {
        console.log(`  ⚠️  Página ${p} devolvió 404, deteniendo paginación`);
        break;
      }

      // Esperar a que JS renderice el contenido
      await page.waitForTimeout(1_500);

      // Scroll para activar lazy loading
      await scrollToBottom(page);

      // Extraer y mergear
      await extractAdditionalPage(page, result, seenImageUrls);

      console.log(`  ✓ Página ${p} mergeada | H1: ${result.h1Count} | H2: ${result.h2Count} | H3: ${result.h3Count} | Img sin alt: ${result.imagesWithoutAlt}/${result.totalImages}`);
    } catch {
      console.log(`  ⚠️  Error al navegar a página ${p}, deteniendo paginación`);
      break;
    }
  }
}

/**
 * Busca el enlace "Siguiente" en la página, extrae su href, y deduce
 * el patrón de URL para la paginación.
 *
 * Ejemplos de detección:
 *   href="/noticias/page/2"      → "{origin}/noticias/page/{n}"
 *   href="/noticias?page=2"      → "{origin}/noticias?page={n}"
 *   href="https://site.com/p/2"  → "https://site.com/p/{n}"
 *   href="page/2" (relativo)     → "{origin}/page/{n}"
 *
 * @returns Template URL con "{n}" donde va el número de página, o null
 */
async function detectUrlPattern(page: Page, currentUrl: string): Promise<string | null> {
  // ─── Buscar elemento con href que sea "siguiente" ──────────────
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

  let href: string | null = null;

  for (const sel of nextSelectors) {
    const el = await page.$(sel);
    if (el) {
      href = await el.getAttribute('href').catch(() => null);
      if (href) break;
    }
  }

  if (!href || href === '#') return null;

  // ─── Resolver URL relativa a absoluta ──────────────────────────
  let fullUrl: string;
  try {
    fullUrl = new URL(href, currentUrl).href;
  } catch {
    return null;
  }

  // ─── Extraer el patrón con {n} ────────────────────────────────
  // Buscar el último segmento numérico en la URL
  // Ejemplo: "/noticias/page/2" → extraer el "2", reemplazar por {n}
  const urlObj = new URL(fullUrl);

  // Try pathname first: /page/2 → /page/{n}
  const pathMatch = urlObj.pathname.match(/^(.*?)(\d+)([/?#].*)?$/);
  if (pathMatch) {
    const prefix = pathMatch[1];      // "/noticias/page/"
    const suffix = pathMatch[3] || ''; // trailing slash or query
    return urlObj.origin + prefix + '{n}' + suffix;
  }

  // Try search params: ?page=2 → ?page={n}
  for (const [key, val] of urlObj.searchParams.entries()) {
    if (/^\d+$/.test(val)) {
      urlObj.searchParams.set(key, '{n}');
      return urlObj.href;
    }
  }

  return null;
}

/**
 * Extrae headings e imágenes de una página adicional (paginación)
 * y mergea los resultados en el objeto result, evitando duplicados.
 */
async function extractAdditionalPage(
  page: Page,
  result: SeoResult,
  seenImageUrls: Set<string>
): Promise<void> {
  // ─── Headings: mergear arrays sin duplicados ──────────────────
  const h1New = await page.$$eval('h1', (els) =>
    els.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
  ).catch(() => [] as string[]);

  const h2New = await page.$$eval('h2', (els) =>
    els.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
  ).catch(() => [] as string[]);

  const h3New = await page.$$eval('h3', (els) =>
    els.map((el) => el.textContent?.trim() ?? '').filter(Boolean)
  ).catch(() => [] as string[]);

  // Solo agregar headings que no existan ya
  const existingH1 = new Set(result.h1Tags);
  for (const h of h1New) {
    if (!existingH1.has(h)) {
      result.h1Tags.push(h);
      existingH1.add(h);
    }
  }

  const existingH2 = new Set(result.h2Tags);
  for (const h of h2New) {
    if (!existingH2.has(h)) {
      result.h2Tags.push(h);
      existingH2.add(h);
    }
  }

  const existingH3 = new Set(result.h3Tags);
  for (const h of h3New) {
    if (!existingH3.has(h)) {
      result.h3Tags.push(h);
      existingH3.add(h);
    }
  }

  // ─── Imágenes: mergear contando nuevas ───────────────────────
  const images = await page.$$eval('img', (els) =>
    els.map((el) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      src: (el as any).src ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alt: (el as any).alt ?? '',
    }))
  ).catch(() => [] as Array<{ src: string; alt: string }>);

  const hasMeaningfulAlt = (alt: string): boolean => {
    const cleaned = alt.replace(/[\s\u200B-\u200D\uFEFF\u00A0\x00-\x1F\x7F]+/g, '').trim();
    return cleaned.length > 0;
  };

  for (const img of images) {
    if (!img.src) continue;
    result.totalImages++;

    if (!hasMeaningfulAlt(img.alt)) {
      // Solo agregar si no vimos esta URL antes
      if (!seenImageUrls.has(img.src)) {
        seenImageUrls.add(img.src);
        result.imagesWithoutAlt++;
        result.imagesWithoutAltList.push(img.src);
      }
    }
  }

  // ─── Recalcular counts ──────────────────────────────────────
  result.h1Count = result.h1Tags.length;
  result.h2Count = result.h2Tags.length;
  result.h3Count = result.h3Tags.length;
}

// ─── Browser Launcher ──────────────────────────────────────────────

async function launchBrowser(): Promise<Browser> {
  // Intentar usar Chrome del sistema (no expone "HeadlessChrome")
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

// ─── Helpers ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
