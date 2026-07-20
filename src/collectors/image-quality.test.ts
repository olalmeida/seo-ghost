import { describe, expect, it } from 'vitest';
import type { ImageAnalysis } from '../types.js';
import { assessAltQuality, assessImageAltQuality } from './image-quality.js';

const image = (overrides: Partial<ImageAnalysis> = {}): ImageAnalysis => ({
  src: 'https://assets.example/image.jpg',
  alt: 'Equipo trabajando en la oficina',
  category: 'descriptive',
  ...overrides,
});

describe('assessAltQuality', () => {
  it('reporta missing y bare como errores, confiando en la categoría ya calculada', () => {
    const result = assessAltQuality([
      image({ src: 'https://assets.example/missing.jpg', alt: '', category: 'missing' }),
      image({ src: 'https://assets.example/bare.jpg', alt: '', category: 'bare' }),
    ]);

    expect(result.errorCount).toBe(2);
    expect(result.reviewCount).toBe(0);
    expect(result.issues.map((issue) => issue.kind)).toEqual([
      'missing-or-invalid',
      'missing-or-invalid',
    ]);
  });

  it('no clasifica alt="" como error ni revisión', () => {
    const result = assessAltQuality([
      image({ src: 'https://assets.example/decorative.jpg', alt: '', category: 'empty' }),
    ]);

    expect(result).toEqual({ issues: [], errorCount: 0, reviewCount: 0 });
  });

  it('marca un ALT genérico únicamente como revisión', () => {
    const result = assessAltQuality([
      image({ alt: 'foto', category: 'generic' }),
    ]);

    expect(result.errorCount).toBe(0);
    expect(result.reviewCount).toBe(1);
    expect(result.issues[0]).toMatchObject({ kind: 'generic', severity: 'review' });
  });

  it('marca ALT demasiado largo solo cuando excede el umbral, no en el límite', () => {
    const result = assessAltQuality([
      image({ src: 'https://assets.example/exact.jpg', alt: 'a'.repeat(125) }),
      image({ src: 'https://assets.example/long.jpg', alt: 'a'.repeat(126) }),
    ]);

    expect(result.issues.filter((issue) => issue.kind === 'too-long')).toHaveLength(1);
    expect(result.issues.find((issue) => issue.kind === 'too-long')).toMatchObject({
      image: { src: 'https://assets.example/long.jpg' },
      severity: 'review',
    });
  });

  it('admite un límite configurable para ALT demasiado largo', () => {
    const result = assessAltQuality([image({ alt: 'texto de diez caracteres' })], { maxAltLength: 10 });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('too-long');
  });

  it('rechaza límites de longitud inválidos para evitar auditorías ambiguas', () => {
    expect(() => assessAltQuality([], { maxAltLength: 0 })).toThrow(RangeError);
    expect(() => assessAltQuality([], { maxAltLength: 12.5 })).toThrow(RangeError);
  });

  it('detecta ALT descriptivo repetido en imágenes con src distintos', () => {
    const result = assessAltQuality([
      image({ src: 'https://assets.example/a.jpg', alt: 'Equipo en reunión' }),
      image({ src: 'https://assets.example/b.jpg', alt: '  equipo EN reunión ' }),
    ]);

    const duplicates = result.issues.filter((issue) => issue.kind === 'duplicate-descriptive');
    expect(duplicates).toHaveLength(2);
    expect(duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        image: expect.objectContaining({ src: 'https://assets.example/a.jpg' }),
        duplicateSources: ['https://assets.example/b.jpg'],
      }),
      expect.objectContaining({
        image: expect.objectContaining({ src: 'https://assets.example/b.jpg' }),
        duplicateSources: ['https://assets.example/a.jpg'],
      }),
    ]));
  });

  it('no reporta repetición si es la misma imagen presente más de una vez', () => {
    const repeated = image({ src: 'https://assets.example/same.jpg', alt: 'Producto en primer plano' });
    const result = assessAltQuality([repeated, repeated]);

    expect(result.issues).toEqual([]);
  });

  it('no mezcla ALT genéricos ni vacíos con duplicados descriptivos', () => {
    const result = assessAltQuality([
      image({ src: 'https://assets.example/generic-a.jpg', alt: 'foto', category: 'generic' }),
      image({ src: 'https://assets.example/generic-b.jpg', alt: 'foto', category: 'generic' }),
      image({ src: 'https://assets.example/empty-a.jpg', alt: '', category: 'empty' }),
      image({ src: 'https://assets.example/empty-b.jpg', alt: '', category: 'empty' }),
    ]);

    expect(result.issues.map((issue) => issue.kind)).toEqual(['generic', 'generic']);
  });

  it('expone una entrada de conveniencia compatible con ImageAnalysis', () => {
    const result = assessImageAltQuality([image({ category: 'missing', alt: '' })]);

    expect(result.errorCount).toBe(1);
  });
});
