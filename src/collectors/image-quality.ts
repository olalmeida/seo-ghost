import type { AltCategory, ImageAnalysis } from '../types.js';

/**
 * Representación mínima de una imagen para evaluar la calidad de su ALT.
 * Permite usar el evaluador tanto con `ImageAnalysis` como con DTOs equivalentes.
 */
export interface AltQualityImage {
  src: string;
  alt: string;
  category: AltCategory;
}

export type AltQualityIssueKind =
  | 'missing-or-invalid'
  | 'generic'
  | 'too-long'
  | 'duplicate-descriptive';

export type AltQualitySeverity = 'error' | 'review';

export interface AltQualityIssue {
  kind: AltQualityIssueKind;
  severity: AltQualitySeverity;
  image: AltQualityImage;
  message: string;
  /** Otras imágenes con el mismo ALT descriptivo normalizado. */
  duplicateSources?: readonly string[];
}

export interface AltQualityOptions {
  /** Límite de caracteres recomendados para un ALT; por defecto, 125. */
  maxAltLength?: number;
}

export interface AltQualityAssessment {
  issues: readonly AltQualityIssue[];
  errorCount: number;
  reviewCount: number;
}

const DEFAULT_MAX_ALT_LENGTH = 125;

/**
 * Evalúa reglas de calidad sobre categorías ya calculadas por el recolector.
 * No intenta inferir si una imagen decorativa debe tener ALT: `alt=""` (empty)
 * queda fuera de los hallazgos por ser una declaración válida.
 */
export function assessAltQuality(
  images: readonly AltQualityImage[],
  options: AltQualityOptions = {},
): AltQualityAssessment {
  const maxAltLength = options.maxAltLength ?? DEFAULT_MAX_ALT_LENGTH;
  validateMaxAltLength(maxAltLength);

  const issues: AltQualityIssue[] = [];
  const descriptiveGroups = groupDistinctDescriptiveImages(images);

  for (const image of images) {
    if (image.category === 'missing' || image.category === 'bare') {
      issues.push({
        kind: 'missing-or-invalid',
        severity: 'error',
        image,
        message: 'La imagen no tiene un atributo ALT válido.',
      });
      continue;
    }

    // `empty` representa específicamente alt="" y es válido para decoración.
    if (image.category === 'empty') continue;

    if (image.category === 'generic') {
      issues.push({
        kind: 'generic',
        severity: 'review',
        image,
        message: 'El ALT es genérico y requiere revisión humana.',
      });
    }

    if (image.alt.length > maxAltLength) {
      issues.push({
        kind: 'too-long',
        severity: 'review',
        image,
        message: `El ALT supera el límite recomendado de ${maxAltLength} caracteres (${image.alt.length}).`,
      });
    }

    if (image.category === 'descriptive') {
      const duplicates = descriptiveGroups.get(normalizeAlt(image.alt));
      if (duplicates && duplicates.length > 1) {
        issues.push({
          kind: 'duplicate-descriptive',
          severity: 'review',
          image,
          message: 'El ALT descriptivo se repite en imágenes distintas.',
          duplicateSources: duplicates.filter((candidate) => candidate !== image.src),
        });
      }
    }
  }

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    reviewCount: issues.filter((issue) => issue.severity === 'review').length,
  };
}

/** Conveniencia tipada para el resultado actual del recolector. */
export function assessImageAltQuality(images: readonly ImageAnalysis[], options?: AltQualityOptions): AltQualityAssessment {
  return assessAltQuality(images, options);
}

function groupDistinctDescriptiveImages(images: readonly AltQualityImage[]): Map<string, string[]> {
  const groups = new Map<string, Set<string>>();

  for (const image of images) {
    if (image.category !== 'descriptive' || !image.src.trim()) continue;

    const key = normalizeAlt(image.alt);
    if (!key) continue;

    const sources = groups.get(key) ?? new Set<string>();
    sources.add(image.src);
    groups.set(key, sources);
  }

  return new Map([...groups].map(([alt, sources]) => [alt, [...sources]]));
}

function normalizeAlt(alt: string): string {
  return alt.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function validateMaxAltLength(maxAltLength: number): void {
  if (!Number.isSafeInteger(maxAltLength) || maxAltLength < 1) {
    throw new RangeError('maxAltLength debe ser un entero positivo.');
  }
}
