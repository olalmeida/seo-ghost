import { describe, expect, it } from 'vitest';
import { createProfileArgs, formatConfigurationSummary } from './menu.js';

describe('interactive audit profiles', () => {
  it('configura el perfil rápido para una auditoría SEO liviana', () => {
    const args = createProfileArgs(1, 'quick', 'urls.txt', 'output/site.json', 'json');

    expect(args).toMatchObject({
      a11y: false,
      seo: true,
      timeout: 15_000,
      checkpointEvery: 0,
      maxScrolls: 30,
      maxCarouselClicks: 6,
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
      maxScrolls: 100,
    });
  });

  it('fuerza accesibilidad sin collectors SEO cuando se elige ese modo', () => {
    const args = createProfileArgs(3, 'full', 'urls.txt', 'output/a11y.json', 'csv');

    expect(args).toMatchObject({ a11y: true, seo: false, format: 'csv' });
  });

  it('resume la configuración final antes de iniciar la auditoría', () => {
    const args = createProfileArgs(1, 'seo', 'urls.txt', 'output/site.json', 'html');

    expect(formatConfigurationSummary(args, 'seo')).toEqual(expect.arrayContaining([
      'Perfil: SEO · Formato: HTML',
      'Entrada: urls.txt',
      'SEO: sí · Accesibilidad: no',
    ]));
  });
});
