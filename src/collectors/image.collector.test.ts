import { describe, expect, it } from 'vitest';
import { ImageCollector } from './image.collector.js';

type BareSourceInspector = {
  findBareSources(rawHtml: string, baseUrl: string): Set<string>;
};

describe('ImageCollector bare ALT detection', () => {
  const inspector = new ImageCollector() as unknown as BareSourceInspector;

  it('distingue <img alt> de alt vacío y ausente', () => {
    const sources = inspector.findBareSources(`
      <img src="/assets/bare.jpg" alt>
      <img src="/assets/empty.jpg" alt="">
      <img src="/assets/missing.jpg">
    `, 'https://site.test/noticias');

    expect([...sources]).toEqual(['https://site.test/assets/bare.jpg']);
  });

  it('usa URL absoluta, no solo filename, para evitar colisiones', () => {
    const sources = inspector.findBareSources(
      '<img data-src="/primer/logo.jpg" alt>',
      'https://site.test/',
    );

    expect(sources.has('https://site.test/primer/logo.jpg')).toBe(true);
    expect(sources.has('https://site.test/segundo/logo.jpg')).toBe(false);
  });

  it('incluye candidatos responsive de srcset en imágenes bare', () => {
    const sources = inspector.findBareSources(
      '<img srcset="/img/hero-640.jpg 640w, /img/hero-1280.jpg 1280w" alt>',
      'https://site.test/',
    );

    expect(sources).toEqual(new Set([
      'https://site.test/img/hero-640.jpg',
      'https://site.test/img/hero-1280.jpg',
    ]));
  });
});
