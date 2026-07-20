import { describe, it, expect } from 'vitest';
import { validateHeadings, hasMeaningfulAlt, classifyAlt, detectUrlPattern, isAltIssue, needsAltReview } from './helpers.js';

// ─── validateHeadings ──────────────────────────────────────────────

describe('validateHeadings', () => {
  it('retorna empty array cuando la jerarquía es correcta', () => {
    const result = validateHeadings({
      h1Tags: ['Bienvenidos'],
      h1Count: 1,
      h2Tags: ['Sección 1', 'Sección 2'],
      h2Count: 2,
      h3Count: 0,
    });
    expect(result).toEqual([]);
  });

  it('detecta falta de H1', () => {
    const result = validateHeadings({
      h1Tags: [],
      h1Count: 0,
      h2Tags: [],
      h2Count: 0,
      h3Count: 0,
    });
    expect(result.some(r => r.includes('No hay H1'))).toBe(true);
  });

  it('detecta múltiples H1', () => {
    const result = validateHeadings({
      h1Tags: ['Título', 'Subtítulo'],
      h1Count: 2,
      h2Tags: [],
      h2Count: 0,
      h3Count: 0,
    });
    expect(result.some(r => r.includes('Múltiples H1'))).toBe(true);
  });

  it('detecta salto de jerarquía H1 → H3 sin H2', () => {
    const result = validateHeadings({
      h1Tags: ['Título'],
      h1Count: 1,
      h2Tags: [],
      h2Count: 0,
      h3Count: 3,
    });
    expect(result.some(r => r.includes('Salto de jerarquía'))).toBe(true);
  });

  it('detecta H1 muy largo (>150 caracteres)', () => {
    const result = validateHeadings({
      h1Tags: ['A'.repeat(160)],
      h1Count: 1,
      h2Tags: [],
      h2Count: 0,
      h3Count: 0,
    });
    expect(result[0]).toContain('H1 muy largo');
    expect(result[0]).toContain('160 caracteres');
  });

  it('detecta H2 sin H1', () => {
    const result = validateHeadings({
      h1Tags: [],
      h1Count: 0,
      h2Tags: ['Sección'],
      h2Count: 1,
      h3Count: 0,
    });
    expect(result.some(r => r.includes('H2 pero no hay H1'))).toBe(true);
  });

  it('H1 de exactamente 150 caracteres NO genera issue', () => {
    const result = validateHeadings({
      h1Tags: ['A'.repeat(150)],
      h1Count: 1,
      h2Tags: [],
      h2Count: 0,
      h3Count: 0,
    });
    expect(result).toEqual([]);
  });

  it('múltiples issues se acumulan', () => {
    const result = validateHeadings({
      h1Tags: ['H1 Largo ' + 'x'.repeat(150), 'Segundo H1'],
      h1Count: 2,
      h2Tags: [],
      h2Count: 0,
      h3Count: 5,
    });
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some(r => r.includes('Múltiples H1'))).toBe(true);
    expect(result.some(r => r.includes('Salto de jerarquía'))).toBe(true);
  });
});

// ─── hasMeaningfulAlt ──────────────────────────────────────────────

describe('hasMeaningfulAlt', () => {
  it('string vacío → false', () => {
    expect(hasMeaningfulAlt('')).toBe(false);
  });

  it('solo espacios → false', () => {
    expect(hasMeaningfulAlt('   ')).toBe(false);
  });

  it('alt normal → true', () => {
    expect(hasMeaningfulAlt('Foto de la playa')).toBe(true);
  });

  it('alt con caracteres zero-width → false', () => {
    expect(hasMeaningfulAlt('\u200B')).toBe(false);
    expect(hasMeaningfulAlt('\u200D')).toBe(false);
    expect(hasMeaningfulAlt('\uFEFF')).toBe(false);
  });

  it('alt con nbsp → false', () => {
    expect(hasMeaningfulAlt('\u00A0')).toBe(false);
  });

  it('alt con caracteres de control → false', () => {
    expect(hasMeaningfulAlt('\x00')).toBe(false);
    expect(hasMeaningfulAlt('\x1F')).toBe(false);
    expect(hasMeaningfulAlt('\x7F')).toBe(false);
  });

  it('alt con texto y zero-width mezclado → true', () => {
    expect(hasMeaningfulAlt('Foto\u200Bde\u200Bla\u200Bplaya')).toBe(true);
  });

  it('solo emoji → true', () => {
    expect(hasMeaningfulAlt('📷')).toBe(true);
  });

  it('números → true', () => {
    expect(hasMeaningfulAlt('12345')).toBe(true);
  });

  it('caracteres especiales → true', () => {
    expect(hasMeaningfulAlt('Foto de la playa - #verano 2024!')).toBe(true);
  });

  it('espacios y tabs mezclados → false', () => {
    expect(hasMeaningfulAlt(' \t \n ')).toBe(false);
  });
});

// ─── classifyAlt ────────────────────────────────────────────────────

describe('classifyAlt', () => {
  it('sin atributo alt → missing', () => {
    expect(classifyAlt('', false)).toBe('missing');
  });

  it('alt vacío → empty', () => {
    expect(classifyAlt('', true)).toBe('empty');
    expect(classifyAlt('  ', true)).toBe('empty');
  });

  it('alt con caracteres zero-width → empty', () => {
    expect(classifyAlt('\u200B', true)).toBe('empty');
    expect(classifyAlt('\u00A0', true)).toBe('empty');
  });

  it('alt con nombre de archivo → generic', () => {
    expect(classifyAlt('foto.jpg', true)).toBe('generic');
    expect(classifyAlt('imagen.PNG', true)).toBe('generic');
    expect(classifyAlt('banner-webp', true)).toBe('descriptive'); // sin punto no es filename
  });

  it('alt con palabra genérica → generic', () => {
    expect(classifyAlt('foto', true)).toBe('generic');
    expect(classifyAlt('imagen', true)).toBe('generic');
    expect(classifyAlt('thumb', true)).toBe('generic');
    expect(classifyAlt('thumbnail', true)).toBe('generic');
    expect(classifyAlt('banner', true)).toBe('generic');
    expect(classifyAlt('FOTO', true)).toBe('generic'); // case insensitive
    expect(classifyAlt('Foto', true)).toBe('generic');
    expect(classifyAlt('IMG_0042', true)).toBe('generic');
    expect(classifyAlt('DSC-2026', true)).toBe('generic');
  });

  it('alt descriptivo → descriptive', () => {
    expect(classifyAlt('El presidente firma el decreto en el palacio', true)).toBe('descriptive');
    expect(classifyAlt('Vista panorámica de Quito desde el Panecillo', true)).toBe('descriptive');
    expect(classifyAlt('Gráfico de resultados electorales 2026', true)).toBe('descriptive');
  });

  it('alt con texto + palabra genérica → descriptive', () => {
    // Si tiene más palabras no es solo la palabra genérica
    expect(classifyAlt('foto del evento', true)).toBe('descriptive');
    expect(classifyAlt('imagen de portada', true)).toBe('descriptive');
  });

  it('alt numérico → descriptive', () => {
    expect(classifyAlt('12345', true)).toBe('descriptive');
  });

  it('alt con cero caracteres invisibles → empty', () => {
    expect(classifyAlt('\u200B\u200D\uFEFF', true)).toBe('empty');
  });

  // ─── bare (<img alt> sin valor) ─────────────────────────────────
  it('alt sin valor (<img alt>) → bare', () => {
    expect(classifyAlt('', true, false)).toBe('bare');
  });

  it('alt con valor vacío (<img alt="">) → empty (NO bare)', () => {
    expect(classifyAlt('', true, true)).toBe('empty');
  });

  it('alt sin atributo → missing (NO bare)', () => {
    expect(classifyAlt('', false, false)).toBe('missing');
    expect(classifyAlt('', false, true)).toBe('missing');
  });
});

describe('severidad de categorías ALT', () => {
  it('solo missing y bare son errores de ALT', () => {
    expect(isAltIssue('missing')).toBe(true);
    expect(isAltIssue('bare')).toBe(true);
    expect(isAltIssue('empty')).toBe(false);
    expect(isAltIssue('generic')).toBe(false);
    expect(isAltIssue('descriptive')).toBe(false);
  });

  it('un ALT genérico se marca para revisión, no como ausencia', () => {
    expect(needsAltReview('generic')).toBe(true);
    expect(needsAltReview('missing')).toBe(false);
    expect(needsAltReview('empty')).toBe(false);
  });
});

// ─── detectUrlPattern ──────────────────────────────────────────────

describe('detectUrlPattern', () => {
  it('pathname con /page/N → patrón con {n}', () => {
    expect(detectUrlPattern('/noticias/page/2', 'https://site.com'))
      .toBe('https://site.com/noticias/page/{n}');
  });

  it('query param con ?page=N → patrón con {n}', () => {
    expect(detectUrlPattern('?page=2', 'https://site.com/noticias'))
      .toBe('https://site.com/noticias?page={n}');
  });

  it('URL absoluta → patrón absoluto', () => {
    expect(detectUrlPattern('https://site.com/p/2', 'https://site.com'))
      .toBe('https://site.com/p/{n}');
  });

  it('href # → null', () => {
    expect(detectUrlPattern('#', 'https://site.com')).toBeNull();
  });

  it('href vacío → null', () => {
    expect(detectUrlPattern('', 'https://site.com')).toBeNull();
  });

  it('href sin número → null', () => {
    expect(detectUrlPattern('/about', 'https://site.com')).toBeNull();
  });

  it('URL con pathname + trailing slash + número', () => {
    expect(detectUrlPattern('/categoria/12/', 'https://site.com'))
      .toBe('https://site.com/categoria/{n}/');
  });

  it('URL con múltiples query params', () => {
    const result = detectUrlPattern('?page=2&order=asc', 'https://site.com');
    expect(result).toContain('{n}');
    expect(result).toContain('order=asc');
  });
});
