#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { scrapeUrls } from './scraper.js';
import { toMarkdown, toHtml } from './formatter.js';
import type { CliArgs, OutputFormat, ScrapeSummary } from './types.js';

/**
 * Punto de entrada principal del CLI.
 *
 * Uso:
 *   npm run scrape -- --input urls.txt
 *   npm run scrape -- --input urls.csv --output resultados.json --timeout 45000
 *   npx tsx src/index.ts --input urls.txt --verbose
 */
async function main(): Promise<void> {
  // ─── Parsear argumentos ─────────────────────────────────────────
  const argv = await yargs(hideBin(process.argv))
    .scriptName('seo-ghost')
    .usage('$0 --input <archivo> [opciones]')
    .option('input', {
      alias: 'i',
      type: 'string',
      description: 'Ruta al archivo de URLs (.txt o .csv)',
      demandOption: true,
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      description: 'Ruta al archivo JSON de salida',
      default: 'output/results.json',
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
      description: 'Formato de salida: json, md (Markdown), html, o both (todos)',
      default: 'json',
      choices: ['json', 'md', 'markdown', 'html', 'both'],
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
    .option('max-pages', {
      alias: 'p',
      type: 'number',
      description: 'Páginas a recorrer en listados paginados (2+ sigue "Siguiente")',
      default: 1,
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Modo verbose con más información en consola',
      default: false,
    })
    .help()
    .alias('help', 'h')
    .parseSync() as CliArgs;

  const { input, timeout, delay, waitUntil, googlebot, noCacheBuster, format, verbose, maxPages, a11y } = argv;
  const output = argv.output ?? 'output/results.json';
  const outputFormat = (format === 'markdown' ? 'md' : format) as OutputFormat;

  // ─── Validar archivo de entrada ─────────────────────────────────
  if (!existsSync(input)) {
    console.error(`✗ Archivo no encontrado: ${input}`);
    process.exit(1);
  }

  // ─── Leer URLs ──────────────────────────────────────────────────
  const raw = readFileSync(input, 'utf-8');
  const urls = parseUrlFile(raw, input.endsWith('.csv'));

  if (urls.length === 0) {
    console.error('✗ No se encontraron URLs válidas en el archivo.');
    process.exit(1);
  }

  console.log(`\n👻 seo-ghost - Iniciando extracción de metadata SEO\n`);
  console.log(`📄 Archivo:     ${input}`);
  console.log(`🔗 URLs totales: ${urls.length}`);
  console.log(`⏱  Timeout:     ${timeout}ms`);
  console.log(`⏳ Delay:       ${delay}ms`);
  console.log(`🤖 User-Agent:  ${googlebot ? 'Googlebot Smartphone' : 'Chrome Desktop'}`);
  console.log(`🔓 Cache Buster: ${noCacheBuster ? 'No' : 'Sí'}`);
  console.log(`♿ Accesibilidad: ${a11y ? 'Sí (axe-core)' : 'No'}`);
  console.log(`📄 Máx páginas:  ${maxPages ?? 1}`);
  console.log(`📁 Salida:      ${output}`);
  const formatLabel = format === 'both' ? 'JSON + Markdown + HTML' : format === 'html' ? 'HTML' : format === 'md' || format === 'markdown' ? 'Markdown' : 'JSON';
  console.log(`📋 Formato:     ${formatLabel}`);
  console.log('');

  // ─── Ejecutar scraping ──────────────────────────────────────────
  const results = await scrapeUrls(urls, {
    timeout,
    delay,
    waitUntil: waitUntil as 'domcontentloaded' | 'load' | 'networkidle',
    useGooglebot: googlebot ?? false,
    cacheBuster: !noCacheBuster,
    maxPages: maxPages ?? 1,
    runAxe: a11y ?? false,
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
  const saveMd = outputFormat === 'md' || outputFormat === 'both';
  const saveHtml = outputFormat === 'html' || outputFormat === 'both';

  if (saveJson) {
    const jsonPath = outputFormat === 'both'
      ? outputPath.replace(/\.\w+$/, '') + '.json'
      : outputPath;
    writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\n✓ JSON guardado: ${jsonPath}`);
  }

  if (saveMd) {
    const mdPath = outputFormat === 'both'
      ? outputPath.replace(/\.\w+$/, '') + '.md'
      : outputPath.replace(/\.\w+$/, '') + '.md';
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
