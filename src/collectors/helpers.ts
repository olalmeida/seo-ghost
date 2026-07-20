import type { AltCategory, SeoResult } from '../types.js';

/**
 * Funciones PURAS extraídas de los collectors para poder testearlas
 * de forma aislada sin depender de Playwright.
 *
 * Cada función:
 *   - No tiene side effects
 *   - No depende del DOM ni del navegador
 *   - Es 100% testeable con datos mock
 */

// ─── Heading validation ────────────────────────────────────────────

/**
 * Valida la jerarquía de headings y retorna una lista de issues.
 *
 * Reglas:
 *   1. Sin H1 → error
 *   2. Múltiples H1 → warning
 *   3. Salto H1 → H3 sin H2 → warning
 *   4. H1 muy largo (>150 chars) → advertencia
 *   5. H2 sin H1 → warning
 */
export function validateHeadings(result: Pick<SeoResult, 'h1Tags' | 'h1Count' | 'h2Tags' | 'h2Count' | 'h3Count'>): string[] {
  const issues: string[] = [];

  // 1. Sin H1
  if (result.h1Count === 0) {
    issues.push('No hay H1 en la página');
  }

  // 2. Múltiples H1
  if (result.h1Count > 1) {
    issues.push(`Múltiples H1 (${result.h1Count} encontrados). Se recomienda solo un H1 por página.`);
  }

  // 3. Salto de jerarquía: H1 presente, H2 ausente, H3 presente
  if (result.h1Count > 0 && result.h2Count === 0 && result.h3Count > 0) {
    issues.push('Salto de jerarquía: hay H1 y H3 pero no H2 intermedio');
  }

  // 4. H1 muy largo
  for (const h1 of result.h1Tags) {
    if (h1.length > 150) {
      issues.push(`H1 muy largo (${h1.length} caracteres): "${h1.substring(0, 60)}..."`);
    }
  }

  // 5. H2 sin H1
  if (result.h1Count === 0 && result.h2Count > 0) {
    issues.push('Hay H2 pero no hay H1 en la página');
  }

  return issues;
}

// ─── Alt text classification ───────────────────────────────────────

/**
 * Patrones de alt genérico (case-insensitive).
 * Un alt que matchea cualquiera de estos se clasifica como 'generic'.
 */
export const GENERIC_ALT_PATTERNS = [
  /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i,
  /^(foto|fotografía|fotografia|imagen|image|photo|picture|img|thumb|thumbnail|miniatura|slide|banner)$/i,
  /^(img|image|foto|photo|dsc|scan|screenshot)[\s_-]*\d+[\w-]*$/i,
  /^(untitled|sin título|sin titulo|default|placeholder)$/i,
];

/**
 * Clasifica el alt text de una imagen en una categoría.
 *
 * Orden de chequeo:
 *   1. Si el atributo no existe → 'missing'
 *   2. Si el atributo existe pero no tiene valor (`<img alt>` sin `=`) → 'bare'
 *   3. Si está vacío (incluye cero caracteres visibles después de limpiar) → 'empty'
 *   4. Si matchea patrones genéricos → 'generic'
 *   5. Sino → 'descriptive'
 *
 * @param alt - Contenido del atributo alt (DOM property)
 * @param hasAttribute - Si el atributo alt existe en el HTML
 * @param hasValue - Si el atributo alt tiene valor asignado (`alt="..."` vs `alt` desnudo)
 * @returns La categoría detectada
 *
 * @example
 * classifyAlt('', false, false)       // 'missing'
 * classifyAlt('', true, false)        // 'bare'  — <img alt>
 * classifyAlt('', true, true)         // 'empty' — <img alt="">
 * classifyAlt('  ', true, true)       // 'empty'
 * classifyAlt('foto.jpg', true, true) // 'generic'
 * classifyAlt('foto', true, true)     // 'generic'
 * classifyAlt('Texto real', true, true) // 'descriptive'
 */
export function classifyAlt(alt: string, hasAttribute: boolean, hasValue = true): AltCategory {
  if (!hasAttribute) return 'missing';
  if (!hasValue) return 'bare';

  const cleaned = alt.replace(/[\s\u200B-\u200D\uFEFF\u00A0\x00-\x1F\x7F]+/g, '').trim();
  if (cleaned.length === 0) return 'empty';

  for (const pattern of GENERIC_ALT_PATTERNS) {
    if (pattern.test(cleaned)) return 'generic';
  }

  return 'descriptive';
}

/**
 * Backward-compatible: determina si un alt text tiene contenido visible.
 * Mantiene la firma original (solo `alt`) para no romper imports existentes.
 *
 * @deprecated Usar `classifyAlt()` para análisis más granular.
 * @param alt - Texto alternativo de una imagen
 * @returns true si el alt tiene caracteres visibles después de limpiar
 */
export function hasMeaningfulAlt(alt: string): boolean {
  const cleaned = alt.replace(/[\s\u200B-\u200D\uFEFF\u00A0\x00-\x1F\x7F]+/g, '').trim();
  return cleaned.length > 0;
}

/**
 * Un error de ALT es ausencia real de texto alternativo en un elemento que
 * debería declararlo. `alt=""` es válido para contenido decorativo y los
 * textos genéricos se reportan por separado como calidad a revisar.
 */
export function isAltIssue(category: AltCategory): boolean {
  return category === 'missing' || category === 'bare';
}

/** Un ALT genérico existe, pero no aporta una descripción útil. */
export function needsAltReview(category: AltCategory): boolean {
  return category === 'generic';
}

// ─── URL pattern detection ─────────────────────────────────────────

/**
 * Dado un href de "Siguiente" y la URL actual, deduce el patrón
 * de paginación con {n} como placeholder del número de página.
 *
 * @returns Template URL con "{n}", o null si no se pudo detectar
 *
 * @example
 * detectUrlPattern('/noticias/page/2', 'https://site.com')
 *   → 'https://site.com/noticias/page/{n}'
 *
 * detectUrlPattern('?page=2', 'https://site.com/noticias')
 *   → 'https://site.com/noticias?page={n}'
 */
export function detectUrlPattern(href: string, currentUrl: string): string | null {
  if (!href || href === '#') return null;

  let fullUrl: string;
  try {
    fullUrl = new URL(href, currentUrl).href;
  } catch {
    return null;
  }

  const urlObj = new URL(fullUrl);

  // Intentar con pathname: /page/2 → /page/{n}
  const pathMatch = urlObj.pathname.match(/^(.*?)(\d+)([/?#].*)?$/);
  if (pathMatch) {
    const prefix = pathMatch[1];
    const suffix = pathMatch[3] || '';
    return urlObj.origin + prefix + '{n}' + suffix;
  }

  // Intentar con search params: ?page=2 → ?page={n}
  // NOTA: NO usar urlObj.searchParams.set() porque URL-encodea {n} → %7Bn%7D
  for (const [key, val] of urlObj.searchParams.entries()) {
    if (/^\d+$/.test(val)) {
      // Reconstruir los search params manualmente para evitar encoding
      const params = new URLSearchParams(urlObj.search);
      params.set(key, '{n}');
      const origin = urlObj.origin;
      const path = urlObj.pathname;
      return `${origin}${path}?${params.toString().replace(/%7Bn%7D/g, '{n}')}`;
    }
  }

  return null;
}
