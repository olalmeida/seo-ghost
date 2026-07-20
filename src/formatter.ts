import type { AltCategory, ImageAnalysis, ScrapeSummary, SeoResult } from './types.js';

/**
 * Genera un reporte Markdown legible para el cliente final a partir
 * de los resultados del scraping.
 */
export function toMarkdown(summary: ScrapeSummary): string {
  const lines: string[] = [];

  // ─── Header ────────────────────────────────────────────────────
  lines.push('# 👻 seo-ghost — Reporte de Metadata SEO');
  lines.push('');
  lines.push(`**Fecha**: ${new Date(summary.timestamp).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`);
  lines.push('');
  lines.push(`| Métrica | Valor |`);
  lines.push(`|---------|-------|`);
  lines.push(`| URLs procesadas | ${summary.totalProcessed} |`);
  lines.push(`| Exitosas | ${summary.totalProcessed - summary.totalErrors} |`);
  lines.push(`| Con errores | ${summary.totalErrors} |`);
  lines.push('');

  // ─── Tabla resumen ─────────────────────────────────────────────
  lines.push('## 📊 Resumen General');
  lines.push('');
  lines.push('| # | URL | Status | Title | H1 | H2 | H3 | Palabras | Párrafos | Issues | Errores ALT |');
  lines.push('|---|-----|--------|-------|----|----|----|----------|----------|--------|-------------|');

  summary.results.forEach((r, i) => {
    const statusIcon = r.error ? '❌' : r.statusCode === 200 ? '✅' : '⚠️';
    const shortTitle = truncate(r.metaTitle ?? '(sin title)', 50);
    const imgRatio = `${r.imagesWithoutAlt}/${r.totalImages}`;
    const issuesCount = r.headingIssues?.length ?? 0;
    const issuesIcon = issuesCount === 0 ? '✅' : `⚠️ ${issuesCount}`;
    const shortUrl = r.url.replace(/https?:\/\//, '').replace(/\?_cb=\d+/, '').substring(0, 35);
    const words = r.wordCount > 0 ? r.wordCount.toLocaleString() : '—';

    lines.push(`| ${i + 1} | ${shortUrl} | ${statusIcon} ${r.statusCode ?? '—'} | ${shortTitle} | ${r.h1Count} | ${r.h2Count} | ${r.h3Count} | ${words} | ${r.paragraphCount || '—'} | ${issuesIcon} | ${imgRatio} |`);
  });

  lines.push('');

  // ─── Detalle por URL ───────────────────────────────────────────
  lines.push('## 🔍 Resultados Detallados');
  lines.push('');

  for (let i = 0; i < summary.results.length; i++) {
    const r = summary.results[i];
    lines.push(`---`);
    lines.push('');
    lines.push(`### ${i + 1}. ${r.url.replace(/\?_cb=\d+/, '')}`);
    lines.push('');

    // Metadata general
    lines.push('**Metadata general**');
    lines.push('');
    lines.push(`| Campo | Valor |`);
    lines.push(`|-------|-------|`);
    lines.push(`| **Status Code** | ${r.error ? `❌ ${r.statusCode ?? '—'}` : r.statusCode === 200 ? `✅ ${r.statusCode}` : `⚠️ ${r.statusCode}`} |`);
      lines.push(`| **Title** | ${r.metaTitle ?? '*Sin title*'} |`);
      lines.push(`| **Description** | ${r.metaDescription ?? '*Sin meta description*'} |`);
      lines.push(`| **Canonical** | ${r.canonical ?? '*Sin canonical*'} |`);
      lines.push(`| **Robots** | ${r.metaRobots ?? '*Sin meta robots*'} |`);

    // Redes sociales (OG + Twitter)
    const hasOg = r.ogTitle || r.ogImage || r.ogDescription;
    const hasTwitter = r.twitterCard || r.twitterTitle;
    if (hasOg || hasTwitter) {
      lines.push('');
      lines.push('**Redes sociales**');
      lines.push('');
      lines.push('| Etiqueta | Valor |');
      lines.push('|----------|-------|');
      if (r.ogTitle) lines.push(`| **og:title** | ${r.ogTitle} |`);
      if (r.ogDescription) lines.push(`| **og:description** | ${r.ogDescription} |`);
      if (r.ogImage) lines.push(`| **og:image** | ${r.ogImage} |`);
      if (r.ogUrl) lines.push(`| **og:url** | ${r.ogUrl} |`);
      if (r.ogType) lines.push(`| **og:type** | ${r.ogType} |`);
      if (r.twitterCard) lines.push(`| **twitter:card** | ${r.twitterCard} |`);
      if (r.twitterTitle) lines.push(`| **twitter:title** | ${r.twitterTitle} |`);
      if (r.twitterDescription) lines.push(`| **twitter:description** | ${r.twitterDescription} |`);
      if (r.twitterImage) lines.push(`| **twitter:image** | ${r.twitterImage} |`);
      lines.push('');
    }

    if (r.error) {
      lines.push(`| **Error** | ❌ ${r.error} |`);
    }
    lines.push('');

    // Headings
    lines.push('**Jerarquía de headings**');
    lines.push('');
    lines.push('| Nivel | Cantidad |');
    lines.push('|-------|----------|');
    lines.push(`| **H1** | ${r.h1Count} |`);
    lines.push(`| **H2** | ${r.h2Count} |`);
    lines.push(`| **H3** | ${r.h3Count} |`);
    lines.push('');

    if (r.headingIssues && r.headingIssues.length > 0) {
      lines.push('**⚠️ Issues de jerarquía**');
      lines.push('');
      for (const issue of r.headingIssues) {
        lines.push(`- ❌ ${issue}`);
      }
      lines.push('');
    }

    // H1 tags (solo si hay y son pocos)
    if (r.h1Tags.length > 0 && r.h1Tags.length <= 10) {
      lines.push('**H1 Tags**');
      lines.push('');
      r.h1Tags.forEach((h1, idx) => {
        lines.push(`${idx + 1}. ${h1}`);
      });
      lines.push('');
    } else if (r.h1Tags.length > 10) {
      lines.push(`**H1 Tags** (${r.h1Tags.length} en total, mostrando primeros 10)`);
      lines.push('');
      r.h1Tags.slice(0, 10).forEach((h1, idx) => {
        lines.push(`${idx + 1}. ${h1}`);
      });
      lines.push('');
    }

    // Structured Data (JSON-LD)
    if (r.structuredData && r.structuredData.length > 0) {
      lines.push('**Structured Data (JSON-LD)**');
      lines.push('');
      lines.push(`| Métrica | Valor |`);
      lines.push(`|---------|-------|`);
      lines.push(`| **Bloques** | ${r.structuredData.length} |`);
      lines.push(`| **Válidos** | ${r.structuredDataValid} |`);
      lines.push(`| **Inválidos** | ${r.structuredData.length - r.structuredDataValid} |`);
      const allTypes = [...new Set(r.structuredData.flatMap((s) => s.types))].filter(Boolean);
      if (allTypes.length > 0) {
        lines.push(`| **Tipos** | ${allTypes.join(', ')} |`);
      }

      // Mostrar errores de parseo
      const invalid = r.structuredData.filter((s) => !s.valid);
      for (const inv of invalid) {
        lines.push('');
        lines.push(`⚠️ Error: ${inv.error ?? 'Error de parseo'}`);
      }
      lines.push('');
    }

    // Contenido
    if (r.wordCount > 0 || r.paragraphCount > 0) {
      lines.push('**Contenido**');
      lines.push('');
      lines.push(`| Métrica | Valor |`);
      lines.push(`|---------|-------|`);
      lines.push(`| **Palabras** | ${r.wordCount > 0 ? r.wordCount.toLocaleString() : '—'} |`);
      lines.push(`| **Párrafos** | ${r.paragraphCount || '—'} |`);
      lines.push('');
    }

    // ─── Imágenes ────────────────────────────────────────────────
    lines.push('**Imágenes**');
    lines.push('');

    if (r.images && r.images.length > 0) {
      // Resumen de categorías (solo si hay datos categorizados)
      const imgCounts = countByCategory(r.images);
      lines.push(`| Categoría | Cantidad |`);
      lines.push(`|-----------|----------|`);
      lines.push(`| **Total imágenes** | ${r.totalImages} |`);
      lines.push(`| **Descriptive** | ${imgCounts.descriptive} ✅ |`);
      if (imgCounts.generic > 0) lines.push(`| **Generic (plano)** | ${imgCounts.generic} 🟡 |`);
      if (imgCounts.empty > 0) lines.push(`| **Empty (vacío)** | ${imgCounts.empty} ⚪ |`);
      if ((imgCounts.bare ?? 0) > 0) lines.push(`| **Bare (alt sin valor)** | ${imgCounts.bare} 🟠 |`);
      if (imgCounts.missing > 0) lines.push(`| **Missing (sin alt)** | ${imgCounts.missing} 🔴 |`);
      lines.push(`| **Errores ALT (missing/bare)** | ${r.imagesWithoutAlt} 🔴 |`);
      lines.push(`| **Revisiones de calidad ALT** | ${r.altQualityReviewCount ?? imgCounts.generic} 🟡 |`);
      lines.push('');

      const qualityIssues = r.altQualityIssues?.filter((issue) => issue.severity === 'review') ?? [];
      if (qualityIssues.length > 0) {
        lines.push('**Hallazgos de calidad ALT** 🟡');
        lines.push('');
        lines.push('| Imagen | Hallazgo |');
        lines.push('|--------|----------|');
        qualityIssues.forEach((issue) => {
          lines.push(`| [${extractFilename(issue.image.src)}](${issue.image.src}) | ${issue.message} |`);
        });
        lines.push('');
      }

      // Listas agrupadas por categoría
      const groupedImages = groupByCategory(r.images);
      const renderImgGroup = (cat: 'generic' | 'empty' | 'bare' | 'missing', label: string, icon: string) => {
        const list = groupedImages[cat];
        if (!list || list.length === 0) return;
        lines.push(`**${label}** ${icon}`);
        lines.push('');
        lines.push('| # | Imagen | Alt actual |');
        lines.push('|---|--------|------------|');
        list.forEach((img, idx) => {
          const filename = extractFilename(img.src);
          const shortAlt = img.alt ? truncate(img.alt, 50) : '—';
          lines.push(`| ${idx + 1} | [${filename}](${img.src}) | ${shortAlt} |`);
        });
        lines.push('');
      };

      renderImgGroup('missing', 'Sin atributo alt', '🔴');
      renderImgGroup('empty', 'Alt vacío', '⚪');
      renderImgGroup('bare', 'Alt sin valor (<img alt>)', '🟠');
      renderImgGroup('generic', 'Alt genérico/plano', '🟡');
    } else {
      // Fallback para datos sin categorización (backward compat)
      lines.push(`| Métrica | Valor |`);
      lines.push(`|---------|-------|`);
      lines.push(`| **Total imágenes** | ${r.totalImages} |`);
      lines.push(`| **Errores ALT (missing/bare)** | ${r.imagesWithoutAlt} 🔴 |`);
      lines.push('');

      if (r.imagesWithoutAltList && r.imagesWithoutAltList.length > 0) {
        lines.push('**Imágenes que necesitan alt text**');
        lines.push('');
        lines.push('| # | Imagen |');
        lines.push('|---|--------|');
        r.imagesWithoutAltList.forEach((src, idx) => {
          const filename = extractFilename(src);
          lines.push(`| ${idx + 1} | [${filename}](${src}) |`);
        });
        lines.push('');
      }
    }
  }

  // ─── Footer ────────────────────────────────────────────────────
  lines.push(`---`);
  lines.push('');
  lines.push(`*Reporte generado por 👻 seo-ghost el ${new Date(summary.timestamp).toISOString()}*`);

  return lines.join('\n');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
}

/**
 * Extrae el nombre del archivo de una URL, útil para mostrar
 * links compactos en el Markdown (que no rompan el PDF).
 *
 * Ejemplo:
 *   "https://assets.ecuavisa.com/.../portada_2026_-_2026-07-09.jpg"
 *   → "portada_2026_-_2026-07-09.jpg"
 *
 * Si no se puede extraer (URL sin slash), devuelve la URL truncada.
 */
function extractFilename(url: string): string {
  try {
    const segments = url.split('/');
    const last = segments.filter(Boolean).pop() ?? url;
    return last.length > 60 ? last.substring(0, 57) + '...' : last;
  } catch {
    return url.substring(0, 60);
  }
}

// ─── HTML ──────────────────────────────────────────────────────────

interface HtmlMetrics {
  totalImages: number;
  totalIssues: number;
  totalImgProblems: number;
  totalAxeViolations: number;
  totalBgImages: number;
  totalPictureSources: number;
}

/**
 * Genera un reporte HTML profesional con filtros interactivos.
 * Sin dependencias externas, CSS inline, JavaScript embebido.
 */
export function toHtml(summary: ScrapeSummary): string {
  const r: string[] = [];

  // Calcular métricas globales
  const metrics: HtmlMetrics = {
    totalImages: summary.results.reduce((a, r) => a + r.totalImages, 0),
    totalIssues: summary.results.reduce((a, r) => a + (r.headingIssues?.length ?? 0), 0),
    totalImgProblems: summary.results.reduce((a, r) => a + r.imagesWithoutAlt, 0),
    totalAxeViolations: summary.results.reduce((a, r) => a + (r.axeViolationCount ?? 0), 0),
    totalBgImages: summary.results.reduce((a, r) => a + (r.totalBgImages ?? 0), 0),
    totalPictureSources: summary.results.reduce((a, r) => a + (r.pictureSources?.length ?? 0), 0),
  };

  const successCount = summary.totalProcessed - summary.totalErrors;

  // ─── CSS ──────────────────────────────────────────────────────
  r.push(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte SEO - seo-ghost</title>
<style>
  :root {
    --bg: #0f172a; --bg-card: #1e293b; --bg-hover: #334155;
    --text: #e2e8f0; --text-muted: #94a3b8; --border: #334155;
    --green: #22c55e; --yellow: #eab308; --red: #ef4444; --blue: #3b82f6; --cyan: #06b6d4;
    --success-bg: #052e16; --success-text: #86efac;
    --warning-bg: #422006; --warning-text: #fde68a;
    --error-bg: #450a0a; --error-text: #fca5a5;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  .container { max-width: 1400px; margin: 0 auto; padding: 1.5rem; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
  .header h1 { font-size: 1.5rem; font-weight: 700; }
  .header h1 small { font-size: 0.85rem; color: var(--text-muted); font-weight: 400; margin-left: 0.5rem; }
  .header .date { color: var(--text-muted); font-size: 0.85rem; }

  /* Summary cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
  .card { background: var(--bg-card); border-radius: 10px; padding: 1rem 1.25rem; border: 1px solid var(--border); }
  .card .num { font-size: 1.75rem; font-weight: 700; line-height: 1.2; }
  .card .label { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem; }
  .text-green { color: var(--green); } .text-yellow { color: var(--yellow); } .text-red { color: var(--red); } .text-blue { color: var(--blue); }
  .text-cyan { color: var(--cyan); }

  /* Filters */
  .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem; align-items: center; }
  .filters input, .filters select {
    background: var(--bg-card); color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 0.85rem; outline: none;
    transition: border-color 0.15s;
  }
  .filters input:focus, .filters select:focus { border-color: var(--blue); }
  .filters input { flex: 1; min-width: 200px; }
  .filters label { font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.35rem; }
  .filter-count { font-size: 0.8rem; color: var(--text-muted); margin-left: auto; }

  /* Table */
  .table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  thead { position: sticky; top: 0; z-index: 1; }
  th { background: var(--bg-card); color: var(--text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.65rem 0.85rem; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; cursor: pointer; user-select: none; }
  th:hover { color: var(--text); }
  td { padding: 0.55rem 0.85rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tbody tr { transition: background 0.1s; }
  tbody tr:hover { background: var(--bg-hover); }
  tbody tr.hidden { display: none; }
  td.url-cell { max-width: 450px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  td.url-cell a { color: var(--cyan); text-decoration: none; }
  td.url-cell a:hover { text-decoration: underline; }
  td.url-cell .url-domain { color: var(--text-muted); font-size: 0.75rem; display: block; }
  td.url-cell .url-path { color: var(--text); font-size: 0.82rem; }

  /* Badges */
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; white-space: nowrap; }
  .badge-green { background: var(--success-bg); color: var(--success-text); }
  .badge-yellow { background: var(--warning-bg); color: var(--warning-text); }
  .badge-red { background: var(--error-bg); color: var(--error-text); }
  .badge-orange { background: #5c3a1e; color: #fdba74; }
  .badge-blue { background: #1e3a5f; color: #93c5fd; }

  /* Detail accordion */
  .detail { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 1rem; overflow: hidden; }
  .detail-header {
    display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem;
    cursor: pointer; user-select: none; gap: 0.75rem;
  }
  .detail-header:hover { background: var(--bg-hover); }
  .detail-header .url-text { flex: 1; min-width: 0; }
  .detail-header .url-text a { color: var(--cyan); text-decoration: none; font-size: 0.9rem; }
  .detail-header .url-text a:hover { text-decoration: underline; }
  .detail-header .url-text .url-domain-sm { color: var(--text-muted); font-size: 0.75rem; display: block; }
  .detail-header .chevron { color: var(--text-muted); transition: transform 0.2s; font-size: 0.85rem; }
  .detail.open .chevron { transform: rotate(180deg); }
  .detail-body { display: none; padding: 0 1.25rem 1.25rem; border-top: 1px solid var(--border); }
  .detail.open .detail-body { display: block; }

  .detail-body .section { margin-top: 1.25rem; }
  .detail-body .section:first-child { margin-top: 1rem; }
  .detail-body .section-title { font-size: 0.82rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.65rem; }

  /* Detail stats grid */
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem; }
  .stat-item { background: rgba(255,255,255,0.03); border-radius: 6px; padding: 0.5rem 0.75rem; }
  .stat-item .val { font-size: 0.95rem; font-weight: 600; }
  .stat-item .lbl { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.1rem; }

  /* Image tables inside details */
  .img-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.5rem; }
  .img-table th { background: rgba(255,255,255,0.05); color: var(--text-muted); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); text-align: left; }
  .img-table td { padding: 0.35rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
  .img-table tr:last-child td { border-bottom: none; }
  .img-table a { color: var(--cyan); text-decoration: none; word-break: break-all; }
  .img-table a:hover { text-decoration: underline; }
  .img-table .alt-text { color: var(--text-muted); font-style: italic; word-break: break-all; }

  /* Issue list */
  .issue-list { list-style: none; padding: 0; }
  .issue-list li { padding: 0.3rem 0.6rem; margin: 0.2rem 0; border-radius: 4px; font-size: 0.82rem; }
  .issue-list .issue-red { background: var(--error-bg); color: var(--error-text); }
  .issue-list .issue-yellow { background: var(--warning-bg); color: var(--warning-text); }

  /* Heading tags */
  .heading-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .heading-tags .tag { background: rgba(59,130,246,0.15); color: var(--blue); padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.78rem; }

  /* Footer */
  .footer { text-align: center; color: var(--text-muted); font-size: 0.78rem; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); }

  @media (max-width: 768px) {
    .container { padding: 0.75rem; }
    .cards { grid-template-columns: repeat(2, 1fr); }
    .filters { flex-direction: column; }
    .filters input { min-width: auto; width: 100%; }
    .filters .filter-count { margin-left: 0; }
    td.url-cell { max-width: 200px; }
    .stat-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body>
<div class="container">`);

  // ─── Header ──────────────────────────────────────────────────
  r.push(`
  <div class="header">
    <h1>👻 seo-ghost <small>Auditoría SEO</small></h1>
    <span class="date">${new Date(summary.timestamp).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</span>
  </div>`);

  // ─── Summary cards ───────────────────────────────────────────
  r.push(`
  <div class="cards">
    <div class="card"><div class="num text-green">${summary.totalProcessed}</div><div class="label">URLs analizadas</div></div>
    <div class="card"><div class="num text-green">${successCount}</div><div class="label">Exitosas</div></div>
    <div class="card"><div class="num ${summary.totalErrors > 0 ? 'text-red' : 'text-green'}">${summary.totalErrors}</div><div class="label">Con errores</div></div>
    <div class="card"><div class="num text-blue">${metrics.totalImages}</div><div class="label">Imágenes totales</div></div>
    <div class="card"><div class="num ${metrics.totalImgProblems > 0 ? 'text-red' : 'text-green'}">${metrics.totalImgProblems}</div><div class="label">Errores ALT</div></div>
    <div class="card"><div class="num ${metrics.totalIssues > 0 ? 'text-yellow' : 'text-green'}">${metrics.totalIssues}</div><div class="label">Issues headings</div></div>
    <div class="card"><div class="num ${metrics.totalAxeViolations > 0 ? 'text-red' : 'text-green'}">${metrics.totalAxeViolations}</div><div class="label">Violaciones a11y</div></div>
    <div class="card"><div class="num text-blue">${metrics.totalBgImages}</div><div class="label">Background CSS</div></div>
    <div class="card"><div class="num text-blue">${metrics.totalPictureSources}</div><div class="label">Picture &lt;source&gt;</div></div>
  </div>`);

  // ─── Filters ─────────────────────────────────────────────────
  r.push(`
  <div class="filters">
    <input type="text" id="searchInput" placeholder="🔍 Buscar por URL o title..." oninput="filterTable()">
    <select id="statusFilter" onchange="filterTable()">
      <option value="all">Todos los estados</option>
      <option value="ok">✅ Exitosas</option>
      <option value="error">❌ Con error</option>
      <option value="warning">⚠️ Status no-200</option>
    </select>
    <select id="imgFilter" onchange="filterTable()">
      <option value="all">Todas las imágenes</option>
      <option value="ok">✅ Sin problemas</option>
      <option value="warning">🟡 Con genéricos</option>
      <option value="problem">🔴 Con missing/empty</option>
    </select>
    <span class="filter-count" id="filterCount">Mostrando ${summary.results.length} de ${summary.results.length}</span>
  </div>`);

  // ─── Summary table ───────────────────────────────────────────
  r.push(`
  <div class="table-wrap">
  <table id="summaryTable">
    <thead><tr>
      <th onclick="sortTable(0)">#</th>
      <th onclick="sortTable(1)">URL</th>
      <th onclick="sortTable(2)">Status</th>
      <th onclick="sortTable(3)">Title</th>
      <th onclick="sortTable(4)">H1</th>
      <th onclick="sortTable(5)">H2</th>
      <th onclick="sortTable(6)">Imágenes</th>
      <th onclick="sortTable(7)">Alt</th>
      <th onclick="sortTable(8)">BG Img</th>
      <th onclick="sortTable(9)">Picture</th>
      <th onclick="sortTable(10)">Issues</th>
      <th onclick="sortTable(11)">A11y</th>
    </tr></thead>
    <tbody>`);

  for (let i = 0; i < summary.results.length; i++) {
    const r2 = summary.results[i];

    // Determinar categorías para filtros
    const statusCat = r2.error ? 'error' : r2.statusCode === 200 ? 'ok' : 'warning';
    const hasGeneric = r2.images?.some((img) => img.category === 'generic') ?? false;
    const hasCriticalAltIssue = r2.images?.some((img) => img.category === 'missing' || img.category === 'bare') ?? false;
    const imgCat = hasCriticalAltIssue ? 'problem' : hasGeneric ? 'warning' : 'ok';

    // Parse URL para mostrar dominio + path
    let urlDomain = '';
    let urlPath = r2.url;
    try {
      const u = new URL(r2.url.replace(/\?_cb=\d+/, ''));
      urlDomain = u.hostname;
      urlPath = u.pathname + u.search;
    } catch { /* fallback */ }

    const statusBadge = r2.error
      ? `<span class="badge badge-red">ERROR</span>`
      : r2.statusCode === 200
        ? `<span class="badge badge-green">${r2.statusCode}</span>`
        : `<span class="badge badge-yellow">${r2.statusCode}</span>`;
    const issuesBadge = (r2.headingIssues?.length ?? 0) === 0
      ? `<span class="badge badge-green">0</span>`
      : `<span class="badge badge-yellow">${r2.headingIssues.length}</span>`;
    const axeBadge = r2.axeViolations && r2.axeViolations.length > 0
      ? (() => {
          const c = r2.axeViolations!.filter(v => v.severity === 'critical').length;
          return c > 0
            ? `<span class="badge badge-red">${r2.axeViolations!.length}</span>`
            : `<span class="badge badge-yellow">${r2.axeViolations!.length}</span>`;
        })()
      : r2.axeViolationCount !== undefined
        ? `<span class="badge badge-green">0</span>`
        : `<span style="color:var(--text-muted)">—</span>`;
    const imgBadge = r2.imagesWithoutAlt > 0
      ? `<span class="badge badge-red">${r2.imagesWithoutAlt}/${r2.totalImages}</span>`
      : `<span class="badge badge-green">0/${r2.totalImages}</span>`;

    r.push(`
      <tr data-status="${statusCat}" data-img="${imgCat}">
        <td>${i + 1}</td>
        <td class="url-cell"><span class="url-domain">${escapeHtml(urlDomain)}</span><a href="${escapeHtml(r2.url)}" target="_blank" title="${escapeHtml(r2.url)}" class="url-path">${escapeHtml(urlPath)}</a></td>
        <td>${statusBadge}</td>
        <td>${escapeHtml(truncate(r2.metaTitle ?? '(sin title)', 65))}</td>
        <td>${r2.h1Count}</td>
        <td>${r2.h2Count}</td>
        <td>${r2.totalImages}</td>
        <td>${imgBadge}</td>
        <td>${(r2.totalBgImages ?? 0) > 0 ? `<span class="badge badge-blue">${r2.totalBgImages}</span>` : `<span style="color:var(--text-muted)">0</span>`}</td>
        <td>${(r2.pictureSources?.length ?? 0) > 0 ? `<span class="badge badge-blue">${r2.pictureSources!.length}</span>` : `<span style="color:var(--text-muted)">0</span>`}</td>
        <td>${issuesBadge}</td>
        <td>${axeBadge}</td>
      </tr>`);
  }

  r.push(`
    </tbody>
  </table>
  </div>`);

  // ─── Detalle por URL (acordeón) ──────────────────────────────
  r.push(`<h2 style="font-size:1.1rem;margin:1.5rem 0 1rem;color:var(--text-muted)">🔍 Detalle por URL</h2>`);
  r.push(`<p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem">Hacé clic en cada URL para expandir/collapsar los detalles.</p>`);

  for (let i = 0; i < summary.results.length; i++) {
    const r2 = summary.results[i];
    const cleanUrl = r2.url.replace(/\?_cb=\d+/, '');

    let urlDomain = '';
    let urlPath = cleanUrl;
    try {
      const u = new URL(cleanUrl);
      urlDomain = u.hostname;
      urlPath = u.pathname + u.search;
    } catch { /* fallback */ }

    const hasOg = r2.ogTitle || r2.ogImage || r2.ogDescription;
    const hasTwitter = r2.twitterCard || r2.twitterTitle;

    r.push(`
  <div class="detail" data-detail-idx="${i}">
    <div class="detail-header" onclick="this.parentElement.classList.toggle('open')">
      <div class="url-text">
        <span class="url-domain-sm">${escapeHtml(urlDomain)}</span>
        <a href="${escapeHtml(cleanUrl)}" target="_blank">${escapeHtml(urlPath)}</a>
      </div>
      <span class="chevron">▼</span>
    </div>
    <div class="detail-body">`);

    // ─── Metadata section ──────────────────────────────────────
    r.push(`
      <div class="section">
        <div class="section-title">Metadata</div>
        <div class="stat-grid">
          <div class="stat-item"><div class="val">${r2.statusCode ?? '—'}</div><div class="lbl">Status</div></div>
          <div class="stat-item"><div class="val">${escapeHtml(r2.metaTitle ?? '—')}</div><div class="lbl">Title</div></div>
          <div class="stat-item"><div class="val ${!r2.metaDescription ? 'text-yellow' : ''}">${escapeHtml(r2.metaDescription ?? '⚠️ Sin description')}</div><div class="lbl">Meta Description</div></div>
          <div class="stat-item"><div class="val">${escapeHtml(r2.canonical ?? '—')}</div><div class="lbl">Canonical</div></div>
          <div class="stat-item"><div class="val">${escapeHtml(r2.metaRobots ?? '—')}</div><div class="lbl">Robots</div></div>
        </div>
      </div>`);

    // ─── Headings section ──────────────────────────────────────
    r.push(`
      <div class="section">
        <div class="section-title">Headings</div>
        <div class="stat-grid">
          <div class="stat-item"><div class="val">${r2.h1Count}</div><div class="lbl">H1</div></div>
          <div class="stat-item"><div class="val">${r2.h2Count}</div><div class="lbl">H2</div></div>
          <div class="stat-item"><div class="val">${r2.h3Count}</div><div class="lbl">H3</div></div>
          <div class="stat-item"><div class="val">${r2.wordCount > 0 ? r2.wordCount.toLocaleString() : '—'}</div><div class="lbl">Palabras</div></div>
          <div class="stat-item"><div class="val">${r2.paragraphCount || '—'}</div><div class="lbl">Párrafos</div></div>
        </div>`);

    if (r2.headingIssues && r2.headingIssues.length > 0) {
      r.push(`
        <ul class="issue-list" style="margin-top:0.5rem">`);
      for (const issue of r2.headingIssues) {
        const cls = issue.toLowerCase().includes('crítico') || issue.toLowerCase().includes('no hay h1') ? 'issue-red' : 'issue-yellow';
        r.push(`<li class="${cls}">${escapeHtml(issue)}</li>`);
      }
      r.push(`</ul>`);
    }

    if (r2.h1Tags.length > 0 || r2.h2Tags.length > 0) {
      r.push(`
        <div class="heading-tags" style="margin-top:0.5rem">`);
      for (const h of r2.h1Tags.slice(0, 5)) {
        r.push(`<span class="tag"><strong>H1:</strong> ${escapeHtml(truncate(h, 80))}</span>`);
      }
      for (const h of r2.h2Tags.slice(0, 8)) {
        r.push(`<span class="tag"><strong>H2:</strong> ${escapeHtml(truncate(h, 60))}</span>`);
      }
      r.push(`</div>`);
    }
    r.push(`</div>`);

    // ─── Social / Structured Data section ──────────────────────
    if (hasOg || hasTwitter) {
      r.push(`
      <div class="section">
        <div class="section-title">Redes sociales</div>
        <div class="stat-grid">`);
      if (r2.ogTitle) r.push(`<div class="stat-item"><div class="val">${escapeHtml(r2.ogTitle)}</div><div class="lbl">og:title</div></div>`);
      if (r2.ogDescription) r.push(`<div class="stat-item"><div class="val">${escapeHtml(r2.ogDescription)}</div><div class="lbl">og:description</div></div>`);
      if (r2.ogImage) r.push(`<div class="stat-item"><div class="val" style="font-size:0.8rem;word-break:break-all">${escapeHtml(r2.ogImage)}</div><div class="lbl">og:image</div></div>`);
      if (r2.ogUrl) r.push(`<div class="stat-item"><div class="val" style="font-size:0.8rem">${escapeHtml(r2.ogUrl)}</div><div class="lbl">og:url</div></div>`);
      if (r2.ogType) r.push(`<div class="stat-item"><div class="val">${escapeHtml(r2.ogType)}</div><div class="lbl">og:type</div></div>`);
      if (r2.twitterCard) r.push(`<div class="stat-item"><div class="val">${escapeHtml(r2.twitterCard)}</div><div class="lbl">twitter:card</div></div>`);
      if (r2.twitterTitle) r.push(`<div class="stat-item"><div class="val">${escapeHtml(r2.twitterTitle)}</div><div class="lbl">twitter:title</div></div>`);
      if (r2.twitterDescription) r.push(`<div class="stat-item"><div class="val">${escapeHtml(r2.twitterDescription)}</div><div class="lbl">twitter:description</div></div>`);
      if (r2.twitterImage) r.push(`<div class="stat-item"><div class="val" style="font-size:0.8rem;word-break:break-all">${escapeHtml(r2.twitterImage)}</div><div class="lbl">twitter:image</div></div>`);
      r.push(`</div></div>`);
    }

    if (r2.structuredData && r2.structuredData.length > 0) {
      r.push(`
      <div class="section">
        <div class="section-title">Structured Data (JSON-LD)</div>
        <div class="stat-grid">
          <div class="stat-item"><div class="val">${r2.structuredData.length}</div><div class="lbl">Bloques</div></div>
          <div class="stat-item"><div class="val text-green">${r2.structuredDataValid}</div><div class="lbl">Válidos</div></div>
          <div class="stat-item"><div class="val ${r2.structuredData.length - r2.structuredDataValid > 0 ? 'text-red' : 'text-green'}">${r2.structuredData.length - r2.structuredDataValid}</div><div class="lbl">Inválidos</div></div>
        </div>`);
      const allTypes = [...new Set(r2.structuredData.flatMap((s) => s.types))].filter(Boolean);
      if (allTypes.length > 0) {
        r.push(`<div style="margin-top:0.4rem">${allTypes.map((t) => `<span class="badge badge-blue">${escapeHtml(t)}</span>`).join(' ')}</div>`);
      }
      const invalid = r2.structuredData.filter((s) => !s.valid);
      for (const inv of invalid) {
        r.push(`<p class="text-red" style="margin-top:0.4rem;font-size:0.82rem">⚠️ ${escapeHtml(inv.error ?? 'Error de parseo')}</p>`);
      }
      r.push(`</div>`);
    }

    // ─── Images section ────────────────────────────────────────
    if (r2.images && r2.images.length > 0) {
      const imgCounts = countByCategory(r2.images);
      const groupedImages = groupByCategory(r2.images);

      r.push(`
      <div class="section">
        <div class="section-title">Imágenes</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-bottom:0.75rem">
          <span class="badge badge-green">✅ Descriptive: ${imgCounts.descriptive}</span>
          ${(r2.altQualityReviewCount ?? imgCounts.generic) > 0 ? `<span class="badge badge-yellow">🟡 Revisión: ${r2.altQualityReviewCount ?? imgCounts.generic}</span>` : ''}
          ${imgCounts.empty > 0 ? `<span class="badge badge-blue">⚪ Decorativas: ${imgCounts.empty}</span>` : ''}
          ${(imgCounts.bare ?? 0) > 0 ? `<span class="badge badge-orange">🟠 Bare: ${imgCounts.bare}</span>` : ''}
          ${imgCounts.missing > 0 ? `<span class="badge badge-red">🔴 Missing: ${imgCounts.missing}</span>` : ''}
        </div>`);

      const renderGroup = (cat: 'generic' | 'empty' | 'bare' | 'missing', label: string) => {
        const list = groupedImages[cat];
        if (!list || list.length === 0) return '';
        let html = `<p style="font-size:0.82rem;font-weight:600;margin:0.5rem 0 0.25rem">${label}</p>
        <table class="img-table"><thead><tr><th style="width:40px">#</th><th>Imagen</th><th>Alt actual</th></tr></thead><tbody>`;
        list.forEach((img, idx) => {
          const shortAlt = img.alt ? escapeHtml(truncate(img.alt, 60)) : '<span class="alt-text">—</span>';
          html += `<tr><td>${idx + 1}</td><td><a href="${escapeHtml(img.src)}" target="_blank">${escapeHtml(extractFilename(img.src))}</a></td><td class="alt-text">${shortAlt}</td></tr>`;
        });
        html += `</tbody></table>`;
        return html;
      };

      r.push(renderGroup('missing', '🔴 Sin atributo alt'));
      r.push(renderGroup('empty', '⚪ Decorativas (alt vacío válido)'));
      r.push(renderGroup('bare', '🟠 Alt sin valor (<img alt>)'));
      r.push(renderGroup('generic', '🟡 ALT genérico — requiere revisión'));
      const qualityIssues = r2.altQualityIssues?.filter((issue) => issue.severity === 'review') ?? [];
      if (qualityIssues.length > 0) {
        r.push(`<p style="font-size:0.82rem;font-weight:600;margin:0.75rem 0 0.25rem">🟡 Hallazgos de calidad ALT</p><table class="img-table"><thead><tr><th>Imagen</th><th>Hallazgo</th></tr></thead><tbody>`);
        qualityIssues.forEach((issue) => {
          r.push(`<tr><td><a href="${escapeHtml(issue.image.src)}" target="_blank">${escapeHtml(extractFilename(issue.image.src))}</a></td><td>${escapeHtml(issue.message)}</td></tr>`);
        });
        r.push('</tbody></table>');
      }
      r.push(`</div>`);
    }

    // ─── Background Images section ────────────────────────────
    if (r2.backgroundImages && r2.backgroundImages.length > 0) {
      r.push(`
      <div class="section">
        <div class="section-title">Background CSS (${r2.backgroundImages.length})</div>
        <table class="img-table"><thead><tr><th style="width:40px">#</th><th>Imagen</th><th>Elemento</th><th>Alt asociado</th></tr></thead><tbody>`);
      r2.backgroundImages.forEach((bg, idx) => {
        r.push(`<tr><td>${idx + 1}</td><td><a href="${escapeHtml(bg.src)}" target="_blank">${escapeHtml(extractFilename(bg.src))}</a></td><td style="font-size:0.75rem;font-family:monospace">${escapeHtml(bg.element)}</td><td class="alt-text">${bg.alt ? escapeHtml(bg.alt) : '<span class="alt-text">—</span>'}</td></tr>`);
      });
      r.push(`</tbody></table></div>`);
    }

    // ─── Picture Sources section ──────────────────────────────
    if (r2.pictureSources && r2.pictureSources.length > 0) {
      r.push(`
      <div class="section">
        <div class="section-title">Picture &lt;source&gt; (${r2.pictureSources.length})</div>
        <table class="img-table"><thead><tr><th style="width:40px">#</th><th>Imagen</th><th>Media Query</th><th>Alt</th></tr></thead><tbody>`);
      r2.pictureSources.forEach((ps, idx) => {
        r.push(`<tr><td>${idx + 1}</td><td><a href="${escapeHtml(ps.src)}" target="_blank">${escapeHtml(extractFilename(ps.src))}</a></td><td style="font-size:0.75rem;font-family:monospace">${escapeHtml(ps.media)}</td><td class="alt-text">${ps.alt ? escapeHtml(ps.alt) : '<span class="alt-text">—</span>'}</td></tr>`);
      });
      r.push(`</tbody></table></div>`);
    }

    // ─── A11y section ──────────────────────────────────────────
    if (r2.axeViolations && r2.axeViolations.length > 0) {
      r.push(`
      <div class="section">
        <div class="section-title">Accesibilidad (${r2.axeViolations.length} violaciones)</div>
        <ul class="issue-list">`);
      for (const v of r2.axeViolations) {
        const sevClass = v.severity === 'critical' ? 'issue-red' : 'issue-yellow';
        const icon = v.severity === 'critical' ? '🔴' : v.severity === 'serious' ? '🟠' : v.severity === 'moderate' ? '🟡' : '🔵';
        r.push(`<li class="${sevClass}">${icon} <strong>${escapeHtml(v.id)}</strong>: ${escapeHtml(v.help)} (${v.nodes} elementos)${v.targets.length ? ` — <code>${escapeHtml(v.targets[0])}</code>` : ''}</li>`);
      }
      r.push(`</ul></div>`);
    } else if (r2.axeViolationCount !== undefined && r2.axeViolationCount === 0) {
      r.push(`
      <div class="section">
        <div class="section-title">Accesibilidad</div>
        <p style="color:var(--green);font-size:0.85rem">✅ Sin violaciones</p>
      </div>`);
    }

    // ─── Error section ─────────────────────────────────────────
    if (r2.error) {
      r.push(`
      <div class="section">
        <div class="section-title">Error</div>
        <p class="text-red" style="font-size:0.85rem">❌ ${escapeHtml(r2.error)}</p>
      </div>`);
    }

    r.push(`
    </div>
  </div>`);
  }

  // ─── JavaScript para filtros ──────────────────────────────────
  r.push(`
<script>
function filterTable() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const img = document.getElementById('imgFilter').value;
  const rows = document.querySelectorAll('#summaryTable tbody tr');
  let visible = 0;
  rows.forEach(function(row) {
    if (status !== 'all' && row.getAttribute('data-status') !== status) { row.classList.add('hidden'); return; }
    if (img !== 'all' && row.getAttribute('data-img') !== img) { row.classList.add('hidden'); return; }
    if (search) {
      const text = row.textContent.toLowerCase();
      if (text.indexOf(search) === -1) { row.classList.add('hidden'); return; }
    }
    row.classList.remove('hidden');
    visible++;
  });
  // Also filter details
  document.querySelectorAll('.detail').forEach(function(d, i) {
    const row = rows[i];
    if (row && row.classList.contains('hidden')) { d.style.display = 'none'; }
    else { d.style.display = ''; }
  });
  document.getElementById('filterCount').textContent = 'Mostrando ' + visible + ' de ' + rows.length;
}
function sortTable(col) {
  const table = document.getElementById('summaryTable');
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const isNum = [0, 4, 5, 6, 7, 8, 9].includes(col);
  const dir = table.getAttribute('data-sort-dir') === 'asc' ? 'desc' : 'asc';
  table.setAttribute('data-sort-dir', dir);
  rows.sort(function(a, b) {
    const aVal = a.cells[col]?.textContent.trim() || '';
    const bVal = b.cells[col]?.textContent.trim() || '';
    if (isNum) {
      const aNum = parseFloat(aVal) || 0;
      const bNum = parseFloat(bVal) || 0;
      return dir === 'asc' ? aNum - bNum : bNum - aNum;
    }
    return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });
  rows.forEach(function(row) { tbody.appendChild(row); });
}
</script>`);

  // ─── Footer ──────────────────────────────────────────────────
  r.push(`
  <div class="footer">Reporte generado por 👻 seo-ghost el ${new Date(summary.timestamp).toISOString()}</div>
</div>
</body>
</html>`);

  return r.join('\n');
}

/**
 * Cuenta imágenes por categoría de alt.
 */
function countByCategory(images: ImageAnalysis[]): Record<AltCategory, number> {
  const counts: Record<AltCategory, number> = { descriptive: 0, generic: 0, empty: 0, bare: 0, missing: 0 };
  for (const img of images) {
    counts[img.category] = (counts[img.category] ?? 0) + 1;
  }
  return counts;
}

/**
 * Agrupa imágenes por categoría.
 */
function groupByCategory(images: ImageAnalysis[]): Partial<Record<AltCategory, ImageAnalysis[]>> {
  const groups: Partial<Record<AltCategory, ImageAnalysis[]>> = {};
  for (const img of images) {
    if (img.category !== 'descriptive') {
      (groups[img.category] ??= []).push(img);
    }
  }
  return groups;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── CSV ────────────────────────────────────────────────────────────

/**
 * Genera un archivo CSV con BOM (UTF-8) para que Excel abra bien
 * los acentos y caracteres especiales.
 *
 * Columnas base siempre presentes; las columnas de accesibilidad
 * solo aparecen si al menos un resultado tiene datos de axe-core.
 */
export function toCsv(summary: ScrapeSummary): string {
  const hasA11y = summary.results.some((r) => r.axeViolationCount !== undefined);
  const rows: string[] = [];

  // ─── Header ────────────────────────────────────────────────────
  const headers = [
    'URL',
    'Status Code',
    'Error',
    'Meta Title',
    'Meta Description',
    'Canonical',
    'Meta Robots',
    'OG Title',
    'OG Description',
    'OG Image',
    'Twitter Card',
    'H1',
    'H2',
    'H3',
    'Word Count',
    'Paragraphs',
    'Structured Data Count',
    'Structured Data Types',
    'Heading Issues',
    'Total Images',
    'Images Descriptive',
    'Images Generic',
    'Images Empty',
    'Images Bare',
    'Images Missing',
    'ALT Errors (Missing/Bare)',
    'ALT Quality Reviews',
  ];

  if (hasA11y) {
    headers.push('A11y Violations', 'A11y Critical', 'A11y Serious', 'A11y Moderate', 'A11y Minor');
  }

  rows.push(headers.map(csvEscape).join(','));

  // ─── Data ──────────────────────────────────────────────────────
  for (const r of summary.results) {
    const imgCounts = r.images ? countByCategory(r.images) : { descriptive: 0, generic: 0, empty: 0, bare: 0, missing: 0 };
    const row: string[] = [
      r.url,
      String(r.statusCode ?? ''),
      r.error ?? '',
      r.metaTitle ?? '',
      r.metaDescription ?? '',
      r.canonical ?? '',
      r.metaRobots ?? '',
      r.ogTitle ?? '',
      r.ogDescription ?? '',
      r.ogImage ?? '',
      r.twitterCard ?? '',
      String(r.h1Count),
      String(r.h2Count),
      String(r.h3Count),
      String(r.wordCount),
      String(r.paragraphCount),
      String(r.structuredDataCount ?? 0),
      (() => {
        const types = [...new Set((r.structuredData ?? []).flatMap((s) => s.types))].filter(Boolean);
        return types.length > 0 ? types.join('; ') : '';
      })(),
      String(r.headingIssues?.length ?? 0),
      String(r.totalImages),
      String(imgCounts.descriptive),
      String(imgCounts.generic),
      String(imgCounts.empty),
      String(imgCounts.bare ?? 0),
      String(imgCounts.missing),
      String(r.imagesWithoutAlt),
      String(r.altQualityReviewCount ?? imgCounts.generic),
    ];

    if (hasA11y) {
      const violations = r.axeViolations ?? [];
      row.push(
        String(r.axeViolationCount ?? ''),
        String(violations.filter((v) => v.severity === 'critical').length),
        String(violations.filter((v) => v.severity === 'serious').length),
        String(violations.filter((v) => v.severity === 'moderate').length),
        String(violations.filter((v) => v.severity === 'minor').length),
      );
    }

    rows.push(row.map(csvEscape).join(','));
  }

  // BOM UTF-8 para que Excel reconozca la codificación
  return '\uFEFF' + rows.join('\r\n');
}

/** Escapa un valor para CSV RFC 4180 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
