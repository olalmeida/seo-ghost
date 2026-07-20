import { describe, expect, it } from 'vitest';
import { toCsv, toMarkdown } from './formatter.js';
import type { ScrapeSummary } from './types.js';

const summaryWithAltReview: ScrapeSummary = {
  timestamp: '2026-07-20T00:00:00.000Z',
  totalProcessed: 1,
  totalErrors: 0,
  results: [{
    url: 'https://example.test/article',
    statusCode: 200,
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
    h1Tags: [], h1Count: 0, h2Tags: [], h2Count: 0, h3Tags: [], h3Count: 0, headingIssues: [],
    totalImages: 1,
    imagesWithoutAlt: 0,
    imagesWithoutAltList: [],
    images: [{ src: 'https://assets.test/hero.jpg', alt: 'Una descripción demasiado larga', category: 'descriptive' }],
    altQualityErrorCount: 0,
    altQualityReviewCount: 1,
    altQualityIssues: [{
      kind: 'too-long', severity: 'review',
      image: { src: 'https://assets.test/hero.jpg', alt: 'Una descripción demasiado larga', category: 'descriptive' },
      message: 'El ALT supera el límite recomendado de 20 caracteres (31).',
    }],
    wordCount: 0, paragraphCount: 0,
    structuredData: [], structuredDataCount: 0, structuredDataValid: 0,
  }],
};

describe('formatters', () => {
  it('incluye hallazgos de calidad ALT en Markdown', () => {
    const markdown = toMarkdown(summaryWithAltReview);
    expect(markdown).toContain('Hallazgos de calidad ALT');
    expect(markdown).toContain('supera el límite recomendado');
  });

  it('expone la cantidad de revisiones ALT en CSV', () => {
    const csv = toCsv(summaryWithAltReview);
    expect(csv).toContain('ALT Quality Reviews');
    expect(csv).toMatch(/,0,1$/);
  });
});
