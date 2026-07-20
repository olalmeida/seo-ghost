import type { CliArgs } from '../types.js';

export interface NormalizedCommand {
  args: string[];
  openMenu: boolean;
  showHelp: boolean;
}

const COMMANDS = new Set<string>(['audit', 'discover', 'a11y', 'resume']);

/**
 * Permite una CLI orientada a tareas sin cambiar el contrato del motor
 * actual, que todavía recibe flags planos.
 */
export function normalizeCommandArgs(rawArgs: string[]): NormalizedCommand {
  const first = rawArgs[0];
  if (first === 'help' || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    return { args: [], openMenu: false, showHelp: true };
  }

  if (!COMMANDS.has(first)) {
    return { args: rawArgs, openMenu: rawArgs.length === 0, showHelp: false };
  }

  const args = rawArgs.slice(1);
  if (first === 'discover') args.push('--discover');
  if (first === 'a11y') args.push('--a11y', '--seo=false');
  if (first === 'resume') args.push('--resume');
  return { args, openMenu: false, showHelp: false };
}

export function validateCliArgs(args: CliArgs): string[] {
  const errors: string[] = [];
  if (!args.input && (!args.urls || args.urls.length === 0)) errors.push('Indicá --input <archivo> o al menos una --url <URL>.');
  if (!isPositive(args.timeout)) errors.push('--timeout debe ser mayor a 0.');
  if (!isNonNegative(args.delay)) errors.push('--delay no puede ser negativo.');
  if (!isPositive(args.concurrency) || (args.concurrency ?? 1) > 8) errors.push('--concurrency debe estar entre 1 y 8.');
  if (!isPositive(args.maxScrolls ?? 100)) errors.push('--max-scrolls debe ser mayor a 0.');
  if (!isPositive(args.maxCarouselClicks ?? 25)) errors.push('--max-carousel-clicks debe ser mayor a 0.');
  if (!isPositive(args.maxPages)) errors.push('--max-pages debe ser mayor a 0.');
  if (!isPositive(args.discoverPages)) errors.push('--discover-pages debe ser mayor a 0.');
  if (!isNonNegative(args.checkpointEvery)) errors.push('--checkpoint-every no puede ser negativo.');
  for (const url of args.urls ?? []) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) errors.push(`URL no soportada: ${url}`);
    } catch {
      errors.push(`URL inválida: ${url}`);
    }
  }
  return errors;
}

export function printHelp(): void {
  console.log([
    '',
    'SEO GHOST · Auditoría SEO para sitios reales',
    '',
    'Uso: seo-ghost <comando> [opciones]',
    '',
    'Comandos:',
    '  audit       Audita URLs desde un archivo o --url (comando por defecto)',
    '  discover    Descubre enlaces desde semillas y luego los audita',
    '  a11y        Ejecuta solo accesibilidad con axe-core',
    '  resume      Reanuda una auditoría desde su checkpoint',
    '',
    'Ejemplos:',
    '  seo-ghost audit --input urls.txt --format both',
    '  seo-ghost audit --url https://example.com --format html',
    '  seo-ghost discover --input secciones.txt --discover-pages 3',
    '  seo-ghost a11y --input urls.txt --format csv',
    '  seo-ghost resume --input urls.txt --output output/results.json',
    '',
    'Experiencia guiada: seo-ghost --menu',
    '',
  ].join('\n'));
}

function isPositive(value: number | undefined): boolean {
  return Number.isFinite(value) && (value ?? 0) > 0;
}

function isNonNegative(value: number | undefined): boolean {
  return Number.isFinite(value) && (value ?? -1) >= 0;
}
