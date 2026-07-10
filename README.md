# 👻 seo-ghost

**Scraper de metadata SEO + auditoría de accesibilidad** basado en Playwright.
Extrae información estructural de páginas web con evasión de WAF/Cloudflare,
soporte de paginación, lazy loading, carousels, y auditoría axe-core.

---

## ✨ Funcionalidades

| Característica | Descripción |
|----------------|-------------|
| **Metadata SEO** | Title, Canonical, H1/H2/H3 con validación de jerarquía |
| **Imágenes** | Detección de imágenes sin alt text (con URLs absolutas) |
| **Lazy loading** | Scroll automático al fondo de la página |
| **Carousels** | Click through de sliders (Slick, Swiper, Owl, Bootstrap) |
| **Paginación** | Detecta patrón de URL y navega directo a `page/N` |
| **Accesibilidad** | Auditoría axe-core con reglas WCAG 2.0/2.1 A/AA |
| **Anti-bloqueo** | Evasión de Cloudflare, WAF, Googlebot UA |
| **Cache buster** | Query param `_cb` para evitar respuestas cacheadas |

## 📦 Instalación

```bash
git clone https://github.com/olalmeida/seo-ghost.git
cd seo-ghost
npm install
npx playwright install chromium
```

## 🚀 Uso básico

```bash
# Archivo de entrada: una URL por línea
echo "https://ejemplo.com" > urls.txt

# Extraer metadata SEO
npx tsx src/index.ts --input urls.txt --output reporte

# Con reporte HTML
npx tsx src/index.ts --input urls.txt --output reporte --format html
```

## 📋 Opciones

| Opción | Alias | Default | Descripción |
|--------|-------|---------|-------------|
| `--input` | `-i` | — | Archivo de URLs (`.txt` o `.csv`) |
| `--output` | `-o` | `output/results.json` | Ruta de salida (sin extensión si `--format both`) |
| `--format` | `-f` | `json` | `json`, `md`, `html`, `both` |
| `--timeout` | `-t` | `30000` | Timeout por URL en ms |
| `--delay` | `-d` | `1000` | Pausa entre URLs en ms |
| `--max-pages` | `-p` | `1` | Páginas a recorrer en listados paginados |
| `--a11y` | — | `false` | Auditoría de accesibilidad con axe-core |
| `--googlebot` | `-g` | `false` | User-Agent de Googlebot Smartphone |
| `--no-cache-buster` | — | `false` | Desactivar cache buster |
| `--wait-until` | `-w` | `domcontentloaded` | Estrategia de espera: `domcontentloaded`, `load`, `networkidle` |
| `--verbose` | `-v` | `false` | Más información en consola |

## 🔍 Modos de uso

### Metadata SEO (H tags, imágenes, title, canonical)

```bash
npx tsx src/index.ts --input urls.txt --output reporte-seo --format both
```

### Accesibilidad (solo axe-core)

```bash
npx tsx src/index.ts --input urls.txt --a11y --output reporte-a11y --format both
```

### SEO + paginación (listados de notas)

```bash
npx tsx src/index.ts --input urls.txt --max-pages 5 --output listado
```

### Todo junto (35 URLs con delay)

```bash
npx tsx src/index.ts \
  --input urls.txt \
  --a11y \
  --max-pages 3 \
  --format both \
  --output auditoria-completa \
  --delay 3000 \
  --timeout 120000
```

## 📊 Formatos de salida

### JSON
Estructura completa con todos los datos crudos.

```json
{
  "url": "https://ejemplo.com",
  "statusCode": 200,
  "metaTitle": "Título de la página",
  "canonical": "https://ejemplo.com",
  "h1Count": 1,
  "h2Count": 12,
  "h3Count": 5,
  "totalImages": 45,
  "imagesWithoutAlt": 3,
  "imagesWithoutAltList": ["https://..."],
  "headingIssues": ["Múltiples H1 (3 encontrados)"],
  "axeViolations": [
    { "id": "color-contrast", "severity": "serious", "nodes": 5 }
  ]
}
```

### HTML
Reporte visual autocontenido (sin dependencias externas) con tarjetas de resumen, tabla con badges de colores, detalle por URL, y lista de violaciones de accesibilidad.

### Markdown
Reporte legible, ideal para PDF o documentación.

## 🧠 Estrategias de scraping

| Técnica | Qué resuelve |
|---------|-------------|
| Cache buster | Evita respuestas cacheadas de CDN |
| Fallback de estrategias | `domcontentloaded` → `load` si falla |
| Evasión de headers | Elimina `Sec-Fetch-*` que delatan automatización |
| Cloudflare challenge | Espera + recarga para resolver challenges |
| Scroll to bottom | Activa lazy loading de imágenes |
| Click en carousels | Fuerza carga de slides ocultos |
| Paginación por URL | Navega directo a `page/N` sin clickear botones |

## 🏗️ Estructura del proyecto

```
seo-ghost/
├── src/
│   ├── index.ts      # CLI entry point
│   ├── scraper.ts    # Lógica de scraping y navegación
│   ├── axe.ts        # Integración axe-core
│   ├── formatter.ts  # Generación de JSON/Markdown/HTML
│   ├── evasion.ts    # Estrategias anti-detección
│   └── types.ts      # Tipos e interfaces
├── output/           # Salida por defecto
├── soporte.md        # Mapeo de capacidades
├── soporta.md        # Hallazgos de auditoría
└── package.json
```

## 📄 Licencia

MIT
