import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { AxeViolation } from './types.js';

/**
 * Ejecuta una auditoría de accesibilidad con axe-core sobre la página actual.
 *
 * @param page - Página de Playwright (debe estar navegada a la URL)
 * @returns Array de violaciones de accesibilidad detectadas
 */
export async function runAxeAnalysis(page: Page): Promise<AxeViolation[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();

  const violations: AxeViolation[] = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? 'minor',
    description: v.description ?? '',
    help: v.help ?? '',
    helpUrl: v.helpUrl ?? '',
    nodes: v.nodes?.length ?? 0,
    severity: mapImpact(v.impact ?? null),
    targets: (v.nodes ?? [])
      .slice(0, 5)
      .map((n: any) => n.target?.[0] ?? '')
      .filter(Boolean),
  }));

  return violations;
}

/**
 * Mapea el impacto de axe-core a severidad estandarizada.
 */
function mapImpact(impact: string | null): 'critical' | 'serious' | 'moderate' | 'minor' {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'serious';
    case 'moderate':
      return 'moderate';
    default:
      return 'minor';
  }
}
