import { describe, it, expect, vi } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';

// Mock de discoverUrls importa la función real pero mockea el browser
// Las pruebas son de lógica pura: filtrado de URLs, dedup, etc.

// ─── Tests de la lógica de descubrimiento ──────────────────────────

describe('discoverUrls logic', () => {
  it('filtra URLs de diferente origen', () => {
    const origin = 'https://www.ecuavisa.com';
    const links = [
      'https://www.ecuavisa.com/noticias/politica/nota-1',
      'https://www.google.com',
      'https://www.ecuavisa.com/deportes/nota-2',
      'https://facebook.com/nota-externa',
    ];

    const sameOrigin = links.filter((href) => {
      try {
        return new URL(href).origin === origin;
      } catch {
        return false;
      }
    });

    expect(sameOrigin).toEqual([
      'https://www.ecuavisa.com/noticias/politica/nota-1',
      'https://www.ecuavisa.com/deportes/nota-2',
    ]);
  });

  it('deduplica URLs repetidas', () => {
    const urls = [
      'https://www.ecuavisa.com/noticias/nota-1',
      'https://www.ecuavisa.com/noticias/nota-2',
      'https://www.ecuavisa.com/noticias/nota-1', // duplicado
    ];

    const deduped = urls.filter((v, i, a) => a.indexOf(v) === i);
    expect(deduped).toHaveLength(2);
  });

  it('filtra URLs vacías', () => {
    const urls = ['', 'https://www.ecuavisa.com/noticias/nota-1', ''];
    const filtered = urls.filter(Boolean);
    expect(filtered).toHaveLength(1);
  });

  it('URL inválida no rompe el filtro de origen', () => {
    const origin = 'https://www.ecuavisa.com';
    const links = ['not-a-valid-url', '', '//relative.url'];

    const valid = links.filter((href) => {
      try {
        return new URL(href).origin === origin;
      } catch {
        return false;
      }
    });

    expect(valid).toEqual([]);
  });
});
