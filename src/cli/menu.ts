import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { CliArgs } from '../types.js';
import { selectOption } from './tui.js';

type MenuChoice = { label: string; value: number };

/**
 * Ejecuta el flujo guiado para usuarios que no quieren memorizar flags.
 * No contiene lógica de scraping: solo construye los mismos CliArgs que
 * puede recibir la CLI tradicional.
 */
export async function runInteractiveMenu(): Promise<CliArgs | null> {
  if (input.isTTY && output.isTTY) return runKeyboardMenu();
  return runLineMenu();
}

async function runLineMenu(): Promise<CliArgs | null> {
  const rl = createInterface({ input, output });

  try {
    console.log('\n👻 seo-ghost — Asistente de auditoría SEO\n');

    const mode = await choose(rl, '¿Qué querés hacer?', [
      { label: 'Auditar URLs', value: 1 },
      { label: 'Descubrir URLs y auditarlas', value: 2 },
      { label: 'Auditar accesibilidad (axe-core)', value: 3 },
      { label: 'Reanudar una ejecución interrumpida', value: 4 },
      { label: 'Salir', value: 0 },
    ]);

    if (mode === 0) return null;

    const inputPath = await askRequired(rl, 'Archivo de URLs (.txt o .csv): ');
    const outputPath = await askWithDefault(
      rl,
      'Archivo base de salida: ',
      mode === 4 ? 'output/results.json' : 'output/results.json',
    );

    const args: CliArgs = {
      input: inputPath,
      output: outputPath,
      format: await chooseFormat(rl),
      timeout: 30_000,
      delay: 1_000,
      waitUntil: 'domcontentloaded',
      googlebot: false,
      noCacheBuster: false,
      a11y: mode === 3,
      seo: mode !== 3,
      maxPages: 1,
      concurrency: 1,
      resume: mode === 4,
      checkpointEvery: 10,
      discover: mode === 2,
      discoverSelector: 'a[href$=".html"]',
      discoverPages: 1,
      discoverRecursive: false,
      discoverScrapeAll: false,
      verbose: false,
    };

    if (mode === 2) {
      args.discoverSelector = await askWithDefault(
        rl,
        'Selector CSS para descubrir enlaces: ',
        'a[href$=".html"]',
      );
      args.discoverPages = await askPositiveNumber(rl, 'Páginas de discover: ', 1);
      args.discoverRecursive = await confirm(rl, '¿Descubrimiento recursivo?', false);
      args.discoverScrapeAll = await confirm(rl, '¿Auditar todas las URLs descubiertas?', false);
    }

    const advanced = await confirm(rl, '¿Configurar opciones avanzadas?', false);
    if (advanced) {
      args.timeout = await askPositiveNumber(rl, 'Timeout por URL en ms: ', 30_000);
      args.delay = await askNonNegativeNumber(rl, 'Delay entre URLs en ms: ', 1_000);
      args.concurrency = await askPositiveNumber(rl, 'Workers concurrentes: ', 1);
      args.waitUntil = await choose(rl, 'Estrategia de espera:', [
        { label: 'domcontentloaded (rápida)', value: 1 },
        { label: 'load', value: 2 },
        { label: 'networkidle (estricta)', value: 3 },
      ]).then((value) => ['domcontentloaded', 'load', 'networkidle'][value - 1]);
      args.googlebot = await confirm(rl, '¿Usar User-Agent de Googlebot?', false);
      args.noCacheBuster = !(await confirm(rl, '¿Activar cache buster?', true));
      args.checkpointEvery = await askNonNegativeNumber(rl, 'Checkpoint cada N URLs (0 desactiva): ', 10);
      args.verbose = await confirm(rl, '¿Mostrar logs detallados?', false);
    }

    console.log('\nConfiguración seleccionada:');
    console.log(`  Modo:       ${modeLabel(mode)}`);
    console.log(`  Entrada:    ${args.input}`);
    console.log(`  Salida:     ${args.output}`);
    console.log(`  Formato:    ${args.format}`);
    console.log(`  Concurrencia: ${args.concurrency}`);

    const accepted = await confirm(rl, '\n¿Comenzar la ejecución?', true);
    return accepted ? args : null;
  } finally {
    rl.close();
  }
}

type AuditProfile = 'quick' | 'seo' | 'accessibility' | 'full';

async function runKeyboardMenu(): Promise<CliArgs | null> {
  const mode = await selectOption('¿Qué querés auditar?', [
    { label: 'Auditoría SEO', description: 'metadata, headings e imágenes', value: 1 },
    { label: 'Discover + auditoría', description: 'encontrar enlaces y analizarlos', value: 2 },
    { label: 'Accesibilidad', description: 'auditoría axe-core', value: 3 },
    { label: 'Reanudar ejecución', description: 'continuar desde checkpoint', value: 4 },
    { label: 'Salir', value: 0 },
  ]);
  if (!mode) return null;

  const profile = await selectOption('Elegí un perfil de auditoría', [
    { label: 'Rápido', description: 'SEO esencial, menor tiempo', value: 'quick' as AuditProfile },
    { label: 'SEO', description: 'análisis SEO y reportes completos', value: 'seo' as AuditProfile },
    { label: 'Accesibilidad', description: 'reglas WCAG con axe-core', value: 'accessibility' as AuditProfile },
    { label: 'Completo', description: 'SEO + accesibilidad + reportes', value: 'full' as AuditProfile },
  ]);
  if (!profile) return null;

  const inputPath = await promptText('Archivo de URLs (.txt o .csv): ');
  if (!inputPath) return null;
  const outputPath = await promptText('Archivo base de salida [output/results.json]: ') || 'output/results.json';
  const format = await selectOption('Formato de salida', [
    { label: 'JSON', value: 'json' },
    { label: 'HTML', value: 'html' },
    { label: 'Markdown', value: 'md' },
    { label: 'JSON + HTML', value: 'both' },
    { label: 'CSV', value: 'csv' },
  ]);
  if (!format) return null;

  const args = createProfileArgs(mode, profile, inputPath, outputPath, format);
  const accepted = await selectOption('Configuración lista', [
    { label: 'Iniciar auditoría', description: `${profile} · ${format}`, value: true },
    { label: 'Cancelar', value: false },
  ]);
  return accepted ? args : null;
}

export function createProfileArgs(mode: number, profile: AuditProfile, inputPath: string, outputPath: string, format: string): CliArgs {
  const profiles: Record<AuditProfile, Pick<CliArgs, 'timeout' | 'delay' | 'concurrency' | 'a11y' | 'seo' | 'checkpointEvery'>> = {
    quick: { timeout: 15_000, delay: 250, concurrency: 1, a11y: false, seo: true, checkpointEvery: 0 },
    seo: { timeout: 30_000, delay: 750, concurrency: 1, a11y: false, seo: true, checkpointEvery: 10 },
    accessibility: { timeout: 30_000, delay: 750, concurrency: 1, a11y: true, seo: false, checkpointEvery: 10 },
    full: { timeout: 45_000, delay: 1_000, concurrency: 1, a11y: true, seo: true, checkpointEvery: 10 },
  };

  return {
    input: inputPath,
    output: outputPath,
    format,
    waitUntil: 'domcontentloaded',
    googlebot: false,
    noCacheBuster: false,
    maxPages: 1,
    resume: mode === 4,
    discover: mode === 2,
    discoverSelector: 'a[href$=".html"]',
    discoverPages: 1,
    discoverRecursive: false,
    discoverScrapeAll: false,
    verbose: false,
    ...profiles[profile],
    ...(mode === 3 ? { a11y: true, seo: false } : {}),
  };
}

async function promptText(prompt: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

async function choose(rl: ReturnType<typeof createInterface>, prompt: string, choices: MenuChoice[]): Promise<number> {
  console.log(`\n${prompt}`);
  choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice.label}`));

  while (true) {
    const raw = await rl.question('Seleccioná una opción: ');
    const index = Number.parseInt(raw.trim(), 10) - 1;
    if (Number.isInteger(index) && choices[index]) return choices[index].value;
    console.log('Opción inválida. Elegí uno de los números mostrados.');
  }
}

async function chooseFormat(rl: ReturnType<typeof createInterface>): Promise<string> {
  const choice = await choose(rl, 'Formato de salida:', [
    { label: 'JSON', value: 1 },
    { label: 'HTML', value: 2 },
    { label: 'Markdown', value: 3 },
    { label: 'JSON + HTML', value: 4 },
    { label: 'CSV', value: 5 },
  ]);
  return ['json', 'html', 'md', 'both', 'csv'][choice - 1];
}

async function confirm(rl: ReturnType<typeof createInterface>, prompt: string, defaultValue: boolean): Promise<boolean> {
  const suffix = defaultValue ? 'S/n' : 's/N';
  while (true) {
    const answer = (await rl.question(`${prompt} [${suffix}]: `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    if (['s', 'si', 'sí', 'y', 'yes'].includes(answer)) return true;
    if (['n', 'no'].includes(answer)) return false;
    console.log('Respondé s o n.');
  }
}

async function askRequired(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  while (true) {
    const value = (await rl.question(prompt)).trim();
    if (value) return value;
    console.log('Este valor es obligatorio.');
  }
}

async function askWithDefault(rl: ReturnType<typeof createInterface>, prompt: string, defaultValue: string): Promise<string> {
  const value = (await rl.question(`${prompt}[${defaultValue}] `)).trim();
  return value || defaultValue;
}

async function askPositiveNumber(rl: ReturnType<typeof createInterface>, prompt: string, defaultValue: number): Promise<number> {
  return askNumber(rl, prompt, defaultValue, (value) => value > 0);
}

async function askNonNegativeNumber(rl: ReturnType<typeof createInterface>, prompt: string, defaultValue: number): Promise<number> {
  return askNumber(rl, prompt, defaultValue, (value) => value >= 0);
}

async function askNumber(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue: number,
  isValid: (value: number) => boolean,
): Promise<number> {
  while (true) {
    const raw = (await rl.question(`${prompt}[${defaultValue}] `)).trim();
    if (!raw) return defaultValue;
    const value = Number(raw);
    if (Number.isFinite(value) && isValid(value)) return value;
    console.log('Ingresá un número válido.');
  }
}

function modeLabel(mode: number): string {
  return ['Salir', 'Auditar URLs', 'Descubrir y auditar', 'Solo accesibilidad', 'Reanudar'][mode] ?? 'Desconocido';
}
