#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { unlinkSync } from 'node:fs';
import { chromium } from 'playwright';
import { scrapeUrls, loadCheckpoint } from './scraper.js';
import { discoverUrls } from './discover.js';
import { toMarkdown, toHtml, toCsv } from './formatter.js';
import type { CliArgs, OutputFormat, ScrapeSummary, SeoResult } from './types.js';
import { runInteractiveMenu } from './cli/menu.js';
import { normalizeCommandArgs, printHelp, validateCliArgs } from './cli/commands.js';

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

  const { input, timeout, delay, waitUntil, googlebot, noCacheBuster, format, verbose, maxPages, a11y, seo, resume, concurrency, discover, discoverSelector, discoverPages, discoverRecursive, discoverScrapeAll } = argv;
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
      existingResults = cp.results;
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
  const formatLabel = format === 'both' ? 'JSON + HTML' : format === 'html' ? 'HTML' : format === 'csv' ? 'CSV' : format === 'md' || format === 'markdown' ? 'Markdown' : 'JSON';
  console.log(`📋 Formato:     ${formatLabel}`);
  console.log('');

  // ─── Modo Discover ──────────────────────────────────────────────
  if (discover && urls.length > 0) {
    const sel = discoverSelector ?? 'a[href$=".html"]';
    const dp = discoverPages ?? 1;
    const recursive = discoverRecursive ?? false;
    const scrapeAll = discoverScrapeAll ?? false;

    const actualSel = scrapeAll ? (discoverSelector ?? 'a') : sel;
    console.log(`🔍 Discover mode activado — selector: "${actualSel.substring(0, 60)}..."`);
    if (dp > 1) console.log(`   Barriendo ${dp} páginas de cada sección...`);
    if (recursive) console.log(`   Modo recursivo: descubriendo secciones y luego notas desde cada una`);
    if (scrapeAll) console.log(`   Scrapeando TODAS las URLs descubiertas (no solo .html)`);
    console.log(`   Descubriendo URLs desde ${urls.length} página(s) semilla...`);

    const browser = await chromium.launch({ headless: true });
    try {
      if (recursive) {
        // ─── Modo Recursivo ───────────────────────────────────────
        // Paso 1: descubrir TODOS los links internos desde las semillas
        console.log(`   Fase 1: descubriendo todas las URLs internas desde semillas...`);
        const allLinks: string[] = [];
        for (const seedUrl of urls) {
          const found = await discoverUrls(browser, seedUrl, 'a', { timeout, verbose: !!verbose, maxPages: dp });
          allLinks.push(...found);
        }

        // Obtener el origen
        let origin = '';
        try { origin = new URL(urls[0]).origin; } catch { /* skip */ }

        // Separar: .html → notas, lo demás → secciones
        const articles = allLinks.filter((u) => u.endsWith('.html'));
        const sections = allLinks.filter((u) => !u.endsWith('.html') && u.startsWith(origin));

        const uniqueSections = [...new Set(sections)];
        console.log(`   Fase 1: ${uniqueSections.length} secciones encontradas, ${articles.length} notas directas`);

        // Paso 2: desde cada sección descubrir más URLs
        console.log(`   Fase 2: descubriendo URLs desde ${uniqueSections.length} secciones...`);
        const moreUrls: string[] = [];
        for (let i = 0; i < uniqueSections.length; i++) {
          const sectionUrl = uniqueSections[i];
          if (verbose) console.log(`   [${i + 1}/${uniqueSections.length}] ${sectionUrl}`);
          const found = await discoverUrls(browser, sectionUrl, scrapeAll ? 'a' : 'a[href$=".html"]', {
            timeout,
            verbose: false,
            maxPages: dp,
          });
          moreUrls.push(...found);
        }

        if (scrapeAll) {
          // Scrapear TODO: semillas + todas las URLs descubiertas (incluye secciones, autores, etc)
          const allUnique = [...new Set([...allLinks, ...moreUrls])];
          const seedCount = urls.length;
          urls = [...urls, ...allUnique];
          console.log(`🔗 URLs semilla:        ${seedCount}`);
          console.log(`🔗 URLs descubiertas:   ${allUnique.length} URLs totales`);
          console.log(`🔗 URLs totales:        ${urls.length}`);
          if (allUnique.length > 0) {
            console.log(`   Primeras URLs descubiertas:`);
            for (const u of allUnique.slice(0, 3)) {
              console.log(`    → ${u}`);
            }
            if (allUnique.length > 3) console.log(`    → ... y ${allUnique.length - 3} más`);
          }
        } else {
          // Solo .html (comportamiento actual)
          const allArticles = [...new Set([...articles, ...moreUrls])];
          const seedCount = urls.length;
          urls = [...urls, ...allArticles];
          console.log(`🔗 URLs semilla:        ${seedCount}`);
          console.log(`🔗 URLs descubiertas:   ${allArticles.length} notas`);
          console.log(`🔗 URLs totales:        ${urls.length}`);
          if (allArticles.length > 0) {
            console.log(`   Primeras notas descubiertas:`);
            for (const u of allArticles.slice(0, 3)) {
              console.log(`    → ${u}`);
            }
            if (allArticles.length > 3) console.log(`    → ... y ${allArticles.length - 3} más`);
          }
        }
      } else {
        // ─── Modo Normal (no recursivo) ────────────────────────────
        const allDiscovered: string[] = [];
        for (const seedUrl of urls) {
          const found = await discoverUrls(browser, seedUrl, actualSel, { timeout, verbose: !!verbose, maxPages: dp });
          allDiscovered.push(...found);
        }
        const unique = allDiscovered.filter((v, i, a) => a.indexOf(v) === i);
        console.log(`🔍 Descubiertas ${unique.length} URLs únicas`);

        const seedCount = urls.length;
        urls = [...urls, ...unique];
        console.log(`🔗 URLs semilla:       ${seedCount}`);
        console.log(`🔗 URLs descubiertas:  ${unique.length}`);
        console.log(`🔗 URLs totales:       ${urls.length}`);
        if (unique.length > 0) {
          console.log(`   Primeras descubiertas:`);
          for (const u of unique.slice(0, 3)) {
            console.log(`    → ${u}`);
          }
          if (unique.length > 3) console.log(`    → ... y ${unique.length - 3} más`);
        }
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
  });

  // ─── Armar resumen ──────────────────────────────────────────────
  const summary: ScrapeSummary = {
    timestamp: new Date().toISOString(),
    totalProcessed: results.length,
    totalErrors: results.filter((r) => r.error).length,
    results,
  };

  // ─── Guardar resultados ─────────────────────────────────────────
  const outputPath = resolve(output);
  const outputDir = dirname(outputPath);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const saveJson = outputFormat === 'json' || outputFormat === 'both';
  const saveCsv = outputFormat === 'csv';
  const saveMd = outputFormat === 'md';
  const saveHtml = outputFormat === 'html' || outputFormat === 'both';

  if (saveJson) {
    const jsonPath = outputFormat === 'both'
      ? outputPath.replace(/\.\w+$/, '') + '.json'
      : outputPath;
    writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\n✓ JSON guardado: ${jsonPath}`);
  }

  if (saveCsv) {
    const csvPath = outputPath.replace(/\.\w+$/, '') + '.csv';
    writeFileSync(csvPath, toCsv(summary), 'utf-8');
    console.log(`✓ CSV guardado: ${csvPath}`);
  }

  if (saveMd) {
    const mdPath = outputPath.replace(/\.\w+$/, '') + '.md';
    const markdown = toMarkdown(summary);
    writeFileSync(mdPath, markdown, 'utf-8');
    console.log(`✓ Markdown guardado: ${mdPath}`);
  }

  if (saveHtml) {
    const htmlPath = outputFormat === 'both'
      ? outputPath.replace(/\.\w+$/, '') + '.html'
      : outputPath.replace(/\.\w+$/, '') + '.html';
    const html = toHtml(summary);
    writeFileSync(htmlPath, html, 'utf-8');
    console.log(`✓ HTML guardado: ${htmlPath}`);
  }

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

/**
 * Parsea un archivo de texto o CSV y extrae las URLs.
 *
 * - TXT: una URL por línea
 * - CSV: busca la primera columna o columna "url"
 */
function parseUrlFile(content: string, isCsv: boolean): string[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (!isCsv) {
    return lines;
  }

  // Es CSV: buscar columna "url" en el header
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase().split(',');
  const urlIdx = header.indexOf('url');

  if (urlIdx === -1) {
    // Si no hay columna "url", asumir que la primera columna es la URL
    return lines.slice(1).map((l) => l.split(',')[0].trim()).filter(Boolean);
  }

  return lines
    .slice(1)
    .map((l) => l.split(',')[urlIdx]?.trim() ?? '')
    .filter(Boolean);
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
