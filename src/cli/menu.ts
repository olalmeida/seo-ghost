import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { CliArgs } from '../types.js';

type MenuChoice = { label: string; value: number };

/**
 * Ejecuta el flujo guiado para usuarios que no quieren memorizar flags.
 * No contiene lógica de scraping: solo construye los mismos CliArgs que
 * puede recibir la CLI tradicional.
 */
export async function runInteractiveMenu(): Promise<CliArgs | null> {
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
