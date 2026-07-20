import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { toCsv, toHtml, toMarkdown } from '../formatter.js';
import type { OutputFormat, ScrapeSummary, SeoResult } from '../types.js';

export function createSummary(results: SeoResult[]): ScrapeSummary {
  return {
    timestamp: new Date().toISOString(),
    totalProcessed: results.length,
    totalErrors: results.filter((result) => result.error).length,
    results,
  };
}

/** Persiste los formatos solicitados y devuelve sus rutas absolutas. */
export function writeReports(summary: ScrapeSummary, output: string, format: OutputFormat): string[] {
  const outputPath = resolve(output);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const paths: string[] = [];
  const basePath = outputPath.replace(/\.\w+$/, '');

  if (format === 'json' || format === 'both') {
    const path = format === 'both' ? `${basePath}.json` : outputPath;
    writeFileSync(path, JSON.stringify(summary, null, 2), 'utf-8');
    paths.push(path);
  }
  if (format === 'csv') {
    const path = `${basePath}.csv`;
    writeFileSync(path, toCsv(summary), 'utf-8');
    paths.push(path);
  }
  if (format === 'md') {
    const path = `${basePath}.md`;
    writeFileSync(path, toMarkdown(summary), 'utf-8');
    paths.push(path);
  }
  if (format === 'html' || format === 'both') {
    const path = `${basePath}.html`;
    writeFileSync(path, toHtml(summary), 'utf-8');
    paths.push(path);
  }

  return paths;
}
