#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { unlinkSync } from 'node:fs';
import { chromium } from 'playwright';
import { scrapeUrls, loadCheckpoint } from './scraper.js';
import type { CliArgs, OutputFormat, SeoResult } from './types.js';
import { runInteractiveMenu } from './cli/menu.js';
import { normalizeCommandArgs, printHelp, validateCliArgs } from './cli/commands.js';
import { parseUrlFile } from './cli/input.js';
import { createSummary, writeReports } from './application/reporting.js';
import { discoverAuditUrls } from './application/discovery.js';

/**
 * Punto de entrada principal del CLI.
 *
 * Uso:
 *   npm run scrape -- --input urls.txt
 *   npm run scrape -- --input urls.csv --output resultados.json --timeout 45000
 *   npx tsx src/index.ts --input urls.txt --verbose
 */
async function main(): Promise<void> {
  const normalized = normalizeCommandArgs(hideBin(process.argv));
  if (normalized.showHelp) {
    printHelp();
    return;
  }

  // ─── Parsear argumentos ─────────────────────────────────────────
  const argv = await yargs(normalized.args)
    .scriptName('seo-ghost')
    .usage('$0 --input <archivo> [opciones]')
    .option('input', {
      alias: 'i',
      type: 'string',
      description: 'Ruta al archivo de URLs (.txt o .csv)',
      demandOption: false,
    })
    .option('url', {
      alias: 'u',
      type: 'array',
      string: true,
      description: 'URL individual; se puede repetir sin crear un archivo',
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      description: 'Ruta al archivo JSON de salida',
      default: 'output/results.json',
    })
    .option('menu', {
      type: 'boolean',
      description: 'Abrir el asistente interactivo de configuración',
      default: false,
    })
    .option('timeout', {
      alias: 't',
      type: 'number',
      description: 'Timeout por URL en milisegundos',
      default: 30_000,
    })
    .option('delay', {
      alias: 'd',
      type: 'number',
      description: 'Delay entre requests en milisegundos',
      default: 1_000,
    })
    .option('googlebot', {
      alias: 'g',
      type: 'boolean',
      description: 'Usar User-Agent de Googlebot Smartphone (puede activar bloqueos en AWS/CloudFront)',
      default: false,
    })
    .option('no-cache-buster', {
      type: 'boolean',
      description: 'Desactivar cache buster (query param _cb=timestamp)',
      default: false,
    })
    .option('format', {
      alias: 'f',
      type: 'string',
      description: 'Formato de salida: json, csv, html, md (Markdown), o both (json + html)',
      default: 'json',
      choices: ['json', 'csv', 'md', 'markdown', 'html', 'both'],
    })
    .option('wait-until', {
      alias: 'w',
      type: 'string',
      description: 'Estrategia de espera: domcontentloaded (rápido), load, networkidle (estricto)',
      default: 'domcontentloaded',
      choices: ['domcontentloaded', 'load', 'networkidle'],
    })
    .option('a11y', {
      type: 'boolean',
      description: 'Ejecutar auditoría de accesibilidad con axe-core en cada página',
      default: false,
    })
    .option('seo', {
      type: 'boolean',
      description: 'Extraer metadata SEO (title, headings, OG, imágenes). Default: true. Poner false para solo --a11y',
      default: true,
    })
    .option('max-pages', {
      alias: 'p',
      type: 'number',
      description: 'Páginas a recorrer en listados paginados (2+ sigue "Siguiente")',
      default: 1,
    })
    .option('concurrency', {
      alias: 'c',
      type: 'number',
      description: 'Workers en paralelo (default: 1). Advertencia: cada worker consume ~300 MB RAM',
      default: 1,
    })
    .option('max-scrolls', {
      type: 'number',
      description: 'Máximo de scrolls para activar lazy loading (default: 100)',
      default: 100,
    })
    .option('max-carousel-clicks', {
      type: 'number',
      description: 'Máximo de avances por carousel (default: 25)',
      default: 25,
    })
    .option('resume', {
      type: 'boolean',
      description: 'Reanudar desde el último checkpoint guardado',
      default: false,
    })
    .option('checkpoint-every', {
      type: 'number',
      description: 'Guardar checkpoint cada N URLs (default: 10, 0 = desactivado)',
      default: 10,
    })
    .option('discover', {
      type: 'boolean',
      description: 'Descubrir URLs de artículos desde la(s) URL(s) de entrada usando un selector CSS',
      default: false,
    })
    .option('discover-selector', {
      type: 'string',
      description: 'Selector CSS para descubrir URLs de artículos (default: links a .html)',
      default: 'a[href$=".html"]',
    })
    .option('discover-pages', {
      type: 'number',
      description: 'Páginas a recorrer en discover mode para encontrar más notas (sigue "Siguiente")',
      default: 1,
    })
    .option('discover-recursive', {
      type: 'boolean',
      description: 'Modo recursivo: descubre secciones desde la URL principal y luego notas desde cada sección',
      default: false,
    })
    .option('discover-scrape-all', {
      type: 'boolean',
      description: 'Scrapea TODAS las URLs descubiertas (notas + secciones + autores + etc), no solo .html',
      default: false,
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Modo verbose con más información en consola',
      default: false,
    })
    .help()
    .alias('help', 'h')
    .parseSync() as CliArgs & { menu?: boolean; url?: string[] };

  if ((normalized.openMenu || argv.menu) && process.stdin.isTTY && process.stdout.isTTY) {
    const interactiveArgs = await runInteractiveMenu();
    if (!interactiveArgs) return;
    Object.assign(argv, interactiveArgs);
  }

  argv.urls = Array.isArray(argv.url) ? argv.url.filter((value): value is string => typeof value === 'string') : [];
  const validationErrors = validateCliArgs(argv);
  if (validationErrors.length > 0) {
    console.error(`✗ Configuración inválida:\n  - ${validationErrors.join('\n  - ')}`);
    console.error('Usá "seo-ghost --help" para ver ejemplos o "seo-ghost --menu" para el modo guiado.');
    process.exit(1);
  }

  const { input, timeout, delay, waitUntil, googlebot, noCacheBuster, format, verbose, maxPages, a11y, seo, resume, concurrency, maxScrolls, maxCarouselClicks, discover, discoverSelector, discoverPages, discoverRecursive, discoverScrapeAll } = argv;
  const checkpointEvery = argv.checkpointEvery ?? 10;
  const output = argv.output ?? 'output/results.json';
  const outputFormat = (format === 'markdown' ? 'md' : format) as OutputFormat;

  // ─── Calcular ruta de checkpoint ─────────────────────────────────
  const checkpointPath = outputPathToCheckpoint(output);

  // ─── Determinar URLs y estado inicial ───────────────────────────
  let urls: string[];
  let existingResults: SeoResult[] = [];
  let startIndex = 0;

  if (resume) {
    const cp = loadCheckpoint(checkpointPath);
    if (!cp || cp.nextIndex >= cp.urls.length) {
      console.log('\n👻 No hay checkpoint pendiente. Iniciando desde cero.\n');
      // Leer URLs normalmente
      urls = readUrlsFromSources(input, argv.urls);
    } else {
      console.log(`\n👻 seo-ghost - Reanudando desde checkpoint (${cp.nextIndex}/${cp.urls.length})\n`);
      urls = cp.urls;
      existingResults = cp.results.slice(0, cp.nextIndex);
      startIndex = cp.nextIndex;
    }
  } else {
    urls = readUrlsFromSources(input, argv.urls);
  }

  if (urls.length === 0) {
    console.error('✗ No se encontraron URLs válidas.');
    process.exit(1);
  }

  console.log(`📄 Archivo:     ${resume ? '(checkpoint)' : input}`);
  console.log(`🔗 URLs totales: ${urls.length}`);
  if (startIndex > 0) {
    console.log(`♻️  Reanudando:   URL #${startIndex + 1} (${urls.length - startIndex} pendientes)`);
  }
  console.log(`⏱  Timeout:     ${timeout}ms`);
  console.log(`⏳ Delay:       ${delay}ms`);
  console.log(`🤖 User-Agent:  ${googlebot ? 'Googlebot Smartphone' : 'Chrome Desktop'}`);
  console.log(`🔓 Cache Buster: ${noCacheBuster ? 'No' : 'Sí'}`);
  console.log(`♿ Accesibilidad: ${a11y ? 'Sí (axe-core)' : 'No'}`);
  console.log(`🔍 SEO:          ${seo !== false ? 'Sí' : 'No'}`);
  console.log(`📄 Máx páginas:  ${maxPages ?? 1}`);
  console.log(`📁 Salida:      ${output}`);
  const conc = concurrency ?? 1;
  console.log(`💾 Checkpoint:  ${checkpointEvery > 0 ? `Cada ${checkpointEvery} URLs → ${checkpointPath}` : 'No'}`);
  console.log(`⚡ Concurrencia: ${conc > 1 ? `${conc} workers` : 'No (secuencial)'}`);
  console.log(`🖼️  Lazy load:   ${maxScrolls} scrolls, ${maxCarouselClicks} clicks/carousel`);
  const formatLabel = format === 'both' ? 'JSON + HTML' : format === 'html' ? 'HTML' : format === 'csv' ? 'CSV' : format === 'md' || format === 'markdown' ? 'Markdown' : 'JSON';
  console.log(`📋 Formato:     ${formatLabel}`);
  console.log('');

  // ─── Modo Discover ──────────────────────────────────────────────
  if (discover && urls.length > 0) {
    const dp = discoverPages ?? 1;
    const recursive = discoverRecursive ?? false;
    const scrapeAll = discoverScrapeAll ?? false;

    const browser = await chromium.launch({ headless: true });
    try {
      const discovery = await discoverAuditUrls(browser, urls, {
        selector: discoverSelector,
        timeout,
        verbose: !!verbose,
        maxPages: dp,
        recursive,
        scrapeAll,
      });
      const seedCount = urls.length;
      urls = discovery.urls;

      console.log(`🔍 Discover mode activado — selector: "${discovery.selector.substring(0, 60)}..."`);
      if (dp > 1) console.log(`   Barriendo ${dp} páginas de cada sección...`);
      if (recursive) {
        console.log(`   Modo recursivo: ${discovery.sectionUrls.length} secciones y ${discovery.directArticleUrls.length} notas directas`);
      }
      if (scrapeAll) console.log(`   Scrapeando TODAS las URLs descubiertas (no solo .html)`);
      console.log(`🔗 URLs semilla:       ${seedCount}`);
      console.log(`🔗 URLs descubiertas:  ${discovery.discoveredUrls.length}`);
      console.log(`🔗 URLs totales:       ${urls.length}`);
      if (discovery.discoveredUrls.length > 0) {
        console.log(`   Primeras descubiertas:`);
        for (const url of discovery.discoveredUrls.slice(0, 3)) console.log(`    → ${url}`);
        if (discovery.discoveredUrls.length > 3) console.log(`    → ... y ${discovery.discoveredUrls.length - 3} más`);
      }
    } finally {
      await browser.close();
    }

    console.log('');
  }

  // ─── Ejecutar scraping ──────────────────────────────────────────
  const results = await scrapeUrls(urls, {
    timeout,
    delay,
    waitUntil: waitUntil as 'domcontentloaded' | 'load' | 'networkidle',
    useGooglebot: googlebot ?? false,
    cacheBuster: !noCacheBuster,
    maxPages: maxPages ?? 1,
    runAxe: a11y ?? false,
    runSeo: seo !== false,
    checkpointPath: checkpointEvery > 0 ? checkpointPath : undefined,
    checkpointEvery,
    existingResults,
    startIndex,
    concurrency: conc,
    maxScrolls,
    maxCarouselClicks,
  });

  // ─── Armar resumen ──────────────────────────────────────────────
  const summary = createSummary(results);
  const reportPaths = writeReports(summary, output, outputFormat);
  for (const path of reportPaths) console.log(`✓ Reporte guardado: ${path}`);

  // ─── Limpiar checkpoint ─────────────────────────────────────────
  if (checkpointEvery > 0 && existsSync(checkpointPath)) {
    try { unlinkSync(checkpointPath); } catch { /* ignore */ }
  }

  // ─── Mostrar resumen en consola ─────────────────────────────────
  const successCount = summary.totalProcessed - summary.totalErrors;
  console.log(`\n📊 RESUMEN FINAL`);
  console.log(`   ✓ Exitosas:   ${successCount}`);
  console.log(`   ✗ Con error:  ${summary.totalErrors}`);
  console.log(`   Total:        ${summary.totalProcessed}`);

  if (verbose && summary.totalErrors > 0) {
    console.log(`\n⚠️  URLs con error:`);
    for (const r of results) {
      if (r.error) {
        console.log(`   - ${r.url}: ${r.error}`);
      }
    }
  }

  // Exit code: 0 si todo OK, 1 si hubo errores
  process.exit(summary.totalErrors > 0 ? 1 : 0);
}


main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});

// ─── Helpers de checkpoint ────────────────────────────────────────

/**
 * Deriva la ruta del checkpoint a partir de la ruta de salida.
 * Ej: output/results.json → output/.results.checkpoint.json
 */
function outputPathToCheckpoint(outputPath: string): string {
  const dir = dirname(outputPath);
  const base = outputPath.replace(/.*[/\\]/, '');
  return `${dir}/.${base}.checkpoint.json`;
}

/**
 * Lee URLs de un archivo (TXT o CSV).
 * Mismo comportamiento que el código original pero encapsulado.
 */
function readUrlsFromFile(input: string): string[] {
  if (!existsSync(input)) {
    console.error(`✗ Archivo no encontrado: ${input}`);
    process.exit(1);
  }

  const raw = readFileSync(input, 'utf-8');
  const urls = parseUrlFile(raw, input.endsWith('.csv'));

  if (urls.length === 0) {
    console.error('✗ No se encontraron URLs válidas en el archivo.');
    process.exit(1);
  }

  return urls;
}

function readUrlsFromSources(input: string | undefined, directUrls: string[] | undefined): string[] {
  if (directUrls && directUrls.length > 0) return directUrls;
  if (input) return readUrlsFromFile(input);
  console.error('✗ Indicá --input <archivo> o al menos una --url <URL>.');
  process.exit(1);
}
