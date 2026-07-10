import type { ScrapeSummary, SeoResult } from './types.js';

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
  lines.push('| # | URL | Status | Title | H1 | H2 | H3 | Issues | Img w/o alt |');
  lines.push('|---|-----|--------|-------|----|----|----|--------|-------------|');

  summary.results.forEach((r, i) => {
    const statusIcon = r.error ? '❌' : r.statusCode === 200 ? '✅' : '⚠️';
    const shortTitle = truncate(r.metaTitle ?? '(sin title)', 50);
    const imgRatio = `${r.imagesWithoutAlt}/${r.totalImages}`;
    const issuesCount = r.headingIssues?.length ?? 0;
    const issuesIcon = issuesCount === 0 ? '✅' : `⚠️ ${issuesCount}`;
    const shortUrl = r.url.replace(/https?:\/\//, '').replace(/\?_cb=\d+/, '').substring(0, 35);

    lines.push(`| ${i + 1} | ${shortUrl} | ${statusIcon} ${r.statusCode ?? '—'} | ${shortTitle} | ${r.h1Count} | ${r.h2Count} | ${r.h3Count} | ${issuesIcon} | ${imgRatio} |`);
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
    lines.push(`| **Canonical** | ${r.canonical ?? '*Sin canonical*'} |`);

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

    // Imágenes
    lines.push('**Imágenes**');
    lines.push('');
    lines.push(`| Métrica | Valor |`);
    lines.push(`|---------|-------|`);
    lines.push(`| **Total imágenes** | ${r.totalImages} |`);
    lines.push(`| **Sin alt text** | ${r.imagesWithoutAlt} ⚠️ |`);
    lines.push('');

    if (r.imagesWithoutAltList && r.imagesWithoutAltList.length > 0) {
      lines.push('**Imágenes que necesitan alt text**');
      lines.push('');
      lines.push('| # | Imagen |');
      lines.push('|---|--------|');
      r.imagesWithoutAltList.forEach((src, idx) => {
        const filename = extractFilename(src);
        // Link markdown: [nombre_archivo](url_completa)
        // → mucho más compacto que \`url\` para exportar a PDF
        lines.push(`| ${idx + 1} | [${filename}](${src}) |`);
      });
      lines.push('');
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

/**
 * Genera un reporte HTML visual y autocontenido (sin dependencias
 * externas) con los resultados del scraping.
 *
 * Incluye:
 *   - Resumen general con indicadores visuales
 *   - Detalle por URL: metadata, headings, imágenes
 *   - Colores para issues (rojo = crítico, amarillo = warning)
 */
export function toHtml(summary: ScrapeSummary): string {
  const rows: string[] = [];

  // ─── CSS inline ────────────────────────────────────────────────
  rows.push(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte SEO - seo-ghost</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #1a1a2e; padding: 2rem; line-height: 1.6; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
  h1 small { font-size: 1rem; color: #666; font-weight: 400; }
  .subtitle { color: #666; margin-bottom: 2rem; }
  h2 { font-size: 1.3rem; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e0e0e0; }
  .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
  .card .num { font-size: 2rem; font-weight: 700; }
  .card .label { font-size: 0.85rem; color: #666; margin-top: 0.25rem; }
  .ok { color: #22c55e; }
  .warn { color: #f59e0b; }
  .err { color: #ef4444; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 1.5rem; }
  th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #f0f0f0; }
  th { background: #f8fafc; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; color: #475569; }
  td { font-size: 0.9rem; }
  tr:hover td { background: #f8fafc; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
  .badge-success { background: #dcfce7; color: #15803d; }
  .badge-warning { background: #fef3c7; color: #b45309; }
  .badge-error { background: #fee2e2; color: #b91c1c; }
  .detail { background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 1.5rem; margin-bottom: 1.5rem; }
  .detail h3 { font-size: 1.1rem; margin-bottom: 1rem; }
  .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
  .detail-grid .item { }
  .detail-grid .item .val { font-size: 1.1rem; font-weight: 600; }
  .detail-grid .item .lbl { font-size: 0.8rem; color: #666; }
  .img-list { list-style: none; padding: 0; }
  .img-list li { padding: 0.35rem 0; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem; word-break: break-all; }
  .img-list li:last-child { border: none; }
  .img-list a { color: #2563eb; text-decoration: none; }
  .img-list a:hover { text-decoration: underline; }
  .issue-list { list-style: none; padding: 0; }
  .issue-list li { padding: 0.35rem 0.75rem; margin: 0.25rem 0; border-radius: 6px; font-size: 0.85rem; }
  .issue-list .issue-error { background: #fee2e2; color: #b91c1c; }
  .issue-list .issue-warn { background: #fef3c7; color: #b45309; }
  .heading-list { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .heading-list .tag { background: #eef2ff; color: #4338ca; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; }
  .footer { text-align: center; color: #94a3b8; font-size: 0.8rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; }
  @media (max-width: 768px) { body { padding: 1rem; } .summary-cards { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="container">`);

  // ─── Header ───────────────────────────────────────────────────
  rows.push(`
  <h1>👻 seo-ghost <small>Reporte de Metadata SEO</small></h1>
  <p class="subtitle">${new Date(summary.timestamp).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</p>`);

  // ─── Summary cards ────────────────────────────────────────────
  const successCount = summary.totalProcessed - summary.totalErrors;
  rows.push(`
  <div class="summary-cards">
    <div class="card"><div class="num ok">${summary.totalProcessed}</div><div class="label">URLs procesadas</div></div>
    <div class="card"><div class="num ok">${successCount}</div><div class="label">Exitosas</div></div>
    <div class="card"><div class="num ${summary.totalErrors > 0 ? 'err' : 'ok'}">${summary.totalErrors}</div><div class="label">Con errores</div></div>
  </div>`);

  // ─── Tabla resumen ────────────────────────────────────────────
  rows.push(`
  <h2>📊 Resumen General</h2>
  <table>
    <thead><tr>
      <th>#</th><th>URL</th><th>Status</th><th>Title</th><th>H1</th><th>H2</th><th>H3</th><th>Img</th><th>Sin Alt</th><th>Issues</th><th>A11y</th>
    </tr></thead>
    <tbody>`);

  for (let i = 0; i < summary.results.length; i++) {
    const r = summary.results[i];
    const shortUrl = r.url.replace(/https?:\/\//, '').replace(/\?_cb=\d+/, '').substring(0, 40);
    const statusBadge = r.error
      ? `<span class="badge badge-error">ERROR</span>`
      : r.statusCode === 200
        ? `<span class="badge badge-success">${r.statusCode}</span>`
        : `<span class="badge badge-warning">${r.statusCode}</span>`;
    const issuesBadge = (r.headingIssues?.length ?? 0) === 0
      ? `<span class="badge badge-success">0</span>`
      : `<span class="badge badge-warning">${r.headingIssues.length}</span>`;
    const axeBadge = r.axeViolations && r.axeViolations.length > 0
      ? (() => {
          const c = r.axeViolations!.filter(v => v.severity === 'critical').length;
          return c > 0
            ? `<span class="badge badge-error">${r.axeViolations!.length}</span>`
            : `<span class="badge badge-warning">${r.axeViolations!.length}</span>`;
        })()
      : r.axeViolationCount !== undefined
        ? `<span class="badge badge-success">0</span>`
        : `<span style="color:#ccc">—</span>`;
    const imgBadge = r.imagesWithoutAlt > 0
      ? `<span class="badge badge-warning">${r.imagesWithoutAlt}/${r.totalImages}</span>`
      : `${r.imagesWithoutAlt}/${r.totalImages}`;

    rows.push(`
      <tr>
        <td>${i + 1}</td>
        <td><a href="${escapeHtml(r.url)}" target="_blank" title="${escapeHtml(r.url)}">${escapeHtml(shortUrl)}</a></td>
        <td>${statusBadge}</td>
        <td>${escapeHtml(truncate(r.metaTitle ?? '(sin title)', 60))}</td>
        <td>${r.h1Count}</td>
        <td>${r.h2Count}</td>
        <td>${r.h3Count}</td>
        <td>${imgBadge}</td>
        <td>${r.imagesWithoutAlt}</td>
        <td>${issuesBadge}</td>
        <td>${axeBadge}</td>
      </tr>`);
  }

  rows.push(`
    </tbody>
  </table>`);

  // ─── Detalle por URL ──────────────────────────────────────────
  rows.push(`
  <h2>🔍 Resultados Detallados</h2>`);

  for (let i = 0; i < summary.results.length; i++) {
    const r = summary.results[i];
    const cleanUrl = r.url.replace(/\?_cb=\d+/, '');
    const hasIssues = (r.headingIssues?.length ?? 0) > 0;
    const hasImgIssues = r.imagesWithoutAlt > 0;
    const hasError = !!r.error;

    rows.push(`
  <div class="detail">
    <h3>${i + 1}. <a href="${escapeHtml(cleanUrl)}" target="_blank">${escapeHtml(cleanUrl)}</a></h3>
    <div class="detail-grid">
      <div class="item"><div class="val">${r.statusCode ?? '—'}</div><div class="lbl">Status Code</div></div>
      <div class="item"><div class="val">${escapeHtml(r.metaTitle ?? '—')}</div><div class="lbl">Meta Title</div></div>
      <div class="item"><div class="val">${escapeHtml(r.canonical ?? '—')}</div><div class="lbl">Canonical</div></div>
      <div class="item"><div class="val">${r.h1Count}</div><div class="lbl">H1</div></div>
      <div class="item"><div class="val">${r.h2Count}</div><div class="lbl">H2</div></div>
      <div class="item"><div class="val">${r.h3Count}</div><div class="lbl">H3</div></div>
      <div class="item"><div class="val">${r.totalImages}</div><div class="lbl">Total imágenes</div></div>
      <div class="item"><div class="val ${r.imagesWithoutAlt > 0 ? 'warn' : 'ok'}">${r.imagesWithoutAlt}</div><div class="lbl">Sin alt text</div></div>
    </div>`);

    // Issues
    if (hasIssues) {
      rows.push(`
    <p><strong>⚠️ Issues</strong></p>
    <ul class="issue-list">`);
      for (const issue of r.headingIssues) {
        const cls = issue.toLowerCase().includes('crítico') || issue.toLowerCase().includes('no hay h1') ? 'issue-error' : 'issue-warn';
        rows.push(`<li class="${cls}">${escapeHtml(issue)}</li>`);
      }
      rows.push(`</ul>`);
    }

    // Headings
    if (r.h1Tags.length > 0 || r.h2Tags.length > 0) {
      rows.push(`<p style="margin-top:1rem"><strong>Headings destacados</strong></p>
    <div class="heading-list">`);
      for (const h of r.h1Tags.slice(0, 5)) {
        rows.push(`<span class="tag"><strong>H1:</strong> ${escapeHtml(truncate(h, 80))}</span>`);
      }
      for (const h of r.h2Tags.slice(0, 8)) {
        rows.push(`<span class="tag"><strong>H2:</strong> ${escapeHtml(truncate(h, 60))}</span>`);
      }
      rows.push(`</div>`);
    }

    // Imágenes sin alt
    if (hasImgIssues && r.imagesWithoutAltList) {
      rows.push(`
    <p style="margin-top:1rem"><strong>🖼️ Imágenes sin alt text (${r.imagesWithoutAlt})</strong></p>
    <ol class="img-list">`);
      for (const src of r.imagesWithoutAltList) {
        const filename = extractFilename(src);
        rows.push(`<li><a href="${escapeHtml(src)}" target="_blank">${escapeHtml(filename)}</a></li>`);
      }
      rows.push(`</ol>`);
    }

    // Accesibilidad (axe-core)
    if (r.axeViolations && r.axeViolations.length > 0) {
      rows.push(`
    <p style="margin-top:1rem"><strong>♿ Accesibilidad (${r.axeViolations.length} violaciones)</strong></p>
    <ul class="issue-list">`);
      for (const v of r.axeViolations) {
        const sevClass = v.severity === 'critical' ? 'issue-error' : 'issue-warn';
        const icon = v.severity === 'critical' ? '🔴' : v.severity === 'serious' ? '🟠' : v.severity === 'moderate' ? '🟡' : '🔵';
        rows.push(`<li class="${sevClass}">${icon} <strong>${escapeHtml(v.id)}</strong>: ${escapeHtml(v.help)} (${v.nodes} elementos)${v.targets.length ? ` — <code>${escapeHtml(v.targets[0])}</code>` : ''}</li>`);
      }
      rows.push(`</ul>`);
    } else if (r.axeViolationCount !== undefined && r.axeViolationCount === 0) {
      rows.push(`
    <p style="margin-top:1rem"><strong>♿ Accesibilidad:</strong> ✅ Sin violaciones</p>`);
    }

    // Error
    if (hasError) {
      rows.push(`
    <p style="margin-top:1rem"><strong class="err">❌ Error:</strong> ${escapeHtml(r.error ?? '')}</p>`);
    }

    rows.push(`
  </div>`);
  }

  // ─── Footer ───────────────────────────────────────────────────
  rows.push(`
  <div class="footer">Reporte generado por 👻 seo-ghost el ${new Date(summary.timestamp).toISOString()}</div>
</div>
</body>
</html>`);

  return rows.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
