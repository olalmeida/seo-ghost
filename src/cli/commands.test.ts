import { describe, expect, it } from 'vitest';
import { normalizeCommandArgs, validateCliArgs } from './commands.js';

describe('normalizeCommandArgs', () => {
  it('traduce el comando discover al flag compatible con el motor', () => {
    expect(normalizeCommandArgs(['discover', '--input', 'secciones.txt']).args)
      .toEqual(['--input', 'secciones.txt', '--discover']);
  });

  it('traduce a11y a un análisis sin collectors SEO', () => {
    expect(normalizeCommandArgs(['a11y', '--url', 'https://example.com']).args)
      .toEqual(['--url', 'https://example.com', '--a11y', '--seo=false']);
  });

  it('mantiene los flags heredados sin cambios', () => {
    expect(normalizeCommandArgs(['--input', 'urls.txt', '--discover']).args)
      .toEqual(['--input', 'urls.txt', '--discover']);
  });
});

describe('validateCliArgs', () => {
  it('acepta una URL HTTPS directa con configuración válida', () => {
    expect(validateCliArgs({
      input: '', urls: ['https://example.com'], timeout: 30_000, delay: 0,
      concurrency: 1, maxPages: 1, discoverPages: 1, checkpointEvery: 0,
    })).toEqual([]);
  });

  it('rechaza valores que agotarían recursos o no pueden ejecutarse', () => {
    const errors = validateCliArgs({
      input: '', urls: ['nota-invalida'], timeout: 0, delay: -1,
      concurrency: 9, maxPages: 0, discoverPages: 0, checkpointEvery: -1,
    });

    expect(errors).toHaveLength(7);
  });
});
