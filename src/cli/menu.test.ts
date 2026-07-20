import { describe, expect, it } from 'vitest';
import { createProfileArgs } from './menu.js';

describe('interactive audit profiles', () => {
  it('configura el perfil rápido para una auditoría SEO liviana', () => {
    const args = createProfileArgs(1, 'quick', 'urls.txt', 'output/site.json', 'json');

    expect(args).toMatchObject({
      a11y: false,
      seo: true,
      timeout: 15_000,
      checkpointEvery: 0,
      discover: false,
    });
  });

  it('configura el perfil completo con SEO y accesibilidad', () => {
    const args = createProfileArgs(2, 'full', 'secciones.txt', 'output/full.json', 'both');

    expect(args).toMatchObject({
      a11y: true,
      seo: true,
      timeout: 45_000,
      discover: true,
      format: 'both',
    });
  });

  it('fuerza accesibilidad sin collectors SEO cuando se elige ese modo', () => {
    const args = createProfileArgs(3, 'full', 'urls.txt', 'output/a11y.json', 'csv');

    expect(args).toMatchObject({ a11y: true, seo: false, format: 'csv' });
  });
});
