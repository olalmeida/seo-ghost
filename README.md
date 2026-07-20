# 👻 seo-ghost

**Scraper de metadata SEO + análisis de imágenes + auditoría de accesibilidad** basado en Playwright.
Extrae información estructural de páginas web con evasión de WAF/Cloudflare,
soporte de paginación, lazy loading, carousels, y auditoría axe-core.

---

## ✨ Funcionalidades

| Característica | Descripción |
|----------------|-------------|
| **Metadata SEO** | Title, Canonical, H1/H2/H3 con validación de jerarquía |
| **Imágenes** | Categorización completa de ALT: **descriptive**, **generic**, **empty**, **bare**, **missing** |
| **Background CSS** | Extrae imágenes de fondo (`background-image`) de todos los elementos |
| **Picture \<source\>** | Extrae fuentes alternativas con media queries de elementos `<picture>` |
| **Discover Mode** | Descubre automáticamente URLs de artículos desde URL semilla |
| **Discover Recursivo** | 2 fases: descubre secciones → descubre notas desde cada sección |
| **Discover Scrape All** | Scrapea TODAS las URLs descubiertas (notas + secciones + autores) |
| **Paginación en Discover** | Sigue "Siguiente" hasta N páginas para encontrar más notas |
| **Lazy loading** | Scroll automático al fondo de la página + click en carousels |
| **Carousels** | Click through de sliders (Slick, Swiper, Owl, Bootstrap) |
| **Paginación** | Detecta patrón de URL y navega directo a `page/N` |
| **Structured Data** | Extracción de JSON-LD con validación de parseo |
| **Word Count** | Conteo de palabras y párrafos del contenido visible |
| **Accesibilidad** | Auditoría axe-core con reglas WCAG 2.0/2.1 A/AA |
| **Anti-bloqueo** | Evasión de Cloudflare, WAF, Googlebot UA |
| **Cache buster** | Query param `_cb` para evitar respuestas cacheadas |
| **Concurrencia** | Workers en paralelo para acelerar scraping de múltiples URLs |
| **Checkpoint/Resume** | Guarda progreso cada N URLs y permite reanudar si se interrumpe |

## 📦 Instalación

```bash
git clone https://github.com/olalmeida/seo-ghost.git
cd seo-ghost
npm install
npx playwright install chromium
```

## 🚀 Paso a paso con tu archivo `url-total.txt`

### Modo guiado (recomendado para uso manual)

Si ejecutás la herramienta desde una terminal sin argumentos, se abre un menú
interactivo. También podés solicitarlo explícitamente:

```bash
npm run scrape
# o
npm run scrape -- --menu
```

El asistente permite elegir el tipo de auditoría, archivo de URLs, formato de
salida y opciones avanzadas como timeout, concurrencia, discover y checkpoints.
Para automatizaciones, CI o scripts se mantienen disponibles todos los flags
tradicionales.

Asumiendo que tenés un archivo `url-total.txt` en la raíz del proyecto con una URL por línea:

### 1. Scrapeo básico (JSON)

```bash
npx tsx src/index.ts --input url-total.txt --output resultados/basico
```

### 2. Reporte completo (JSON + HTML)

```bash
npx tsx src/index.ts --input url-total.txt --output resultados/auditoria --format both
```

### 3. Con categorización de imágenes

El reporte te muestra por cada URL el desglose completo:

```
📊 Alt: 12✅ 3🟡 1⚪ 1🟠 2🔴
  🟠 [bare]    src="..." alt="<img alt> sin valor"
  🔴 [missing] src="..." (sin atributo alt)
  🟡 [generic] src="..." alt="foto"
  ⚪ [empty]   src="..." alt=""
```

Categorías:

| Icono | Categoría | Significado |
|-------|-----------|-------------|
| ✅ | `descriptive` | Alt descriptivo — bien |
| 🟡 | `generic` | Alt plano: `"foto"`, `"imagen"`, nombre de archivo |
| ⚪ | `empty` | `alt=""` — decorativa intencional |
| 🟠 | `bare` | `<img alt>` sin valor — el desarrollador se olvidó de poner el texto |
| 🔴 | `missing` | `<img>` sin atributo alt — el desarrollador se olvidó por completo |

Además del `<img>`, también se analizan:
- **`<video poster="">`** — pósters de video como imágenes
- **`<iframe>` embebidos** — YouTube, Vimeo, Dailymotion, Facebook
- **`background-image` CSS** — imágenes de fondo en divs, sections, articles, etc.
- **`<picture>` + `<source>`** — fuentes alternativas con media queries responsive

En el reporte **HTML** las imágenes aparecen agrupadas por categoría en acordeones expandibles, y
las **background images** y **picture sources** tienen sus propias secciones.

### 4. Scrapeo concurrente (mucho más rápido)

```bash
npx tsx src/index.ts --input url-total.txt --concurrency 3 --output resultados/rapido
```

> ⚠️ Cada worker consume ~300 MB de RAM. No pongas más de 3-4 a menos que tengas RAM de sobra.

### 5. Discover Mode — descubrí URLs automáticamente

Si tu `url-total.txt` tiene URLs de **secciones** en lugar de notas individuales:

```bash
# url-total.txt contiene algo como:
# https://www.ecuavisa.com/noticias
# https://www.ecuavisa.com/deportes

npx tsx src/index.ts \
  --input url-total.txt \
  --discover \
  --output resultados/descubiertas \
  --format both
```

Esto:
1. Abre cada sección del archivo
2. Extrae automáticamente los links a notas/artículos (los que terminan en `.html`)
3. Scrapea CADA nota con análisis SEO completo de imágenes

### 6. Discover con paginación

Si las secciones tienen paginación ("Siguiente"), barré varias páginas:

```bash
npx tsx src/index.ts \
  --input url-total.txt \
  --discover \
  --discover-pages 5 \
  --concurrency 2 \
  --output resultados/con-paginacion
```

### 7. Discover recursivo (2 fases)

Descubrí primero todas las secciones internas, y desde cada una descubrí notas:

```bash
npx tsx src/index.ts \
  --input url-total.txt \
  --discover \
  --discover-recursive \
  --discover-pages 3 \
  --concurrency 2 \
  --output resultados/recursivo
```

**Fase 1:** Descubre TODAS las URLs internas desde las semillas
**Fase 2:** Desde cada sección descubierta, encuentra más notas

### 8. Discover Scrape All — TODAS las URLs

Por defecto solo se scrapean las notas (`.html`). Para scrapear **todo** (secciones, autores, tags, etc.):

```bash
npx tsx src/index.ts \
  --input url-total.txt \
  --discover \
  --discover-scrape-all \
  --concurrency 2 \
  --output resultados/completos
```

### 9. Scrapeo pesado con checkpoint (para no perder progreso)

```bash
npx tsx src/index.ts \
  --input url-total.txt \
  --a11y \
  --max-pages 3 \
  --format both \
  --output auditoria-completa \
  --delay 3000 \
  --timeout 120000 \
  --checkpoint-every 5 \
  --concurrency 2
```

Si se corta, reanudás con:

```bash
npx tsx src/index.ts --input url-total.txt --resume
```

### 10. Solo accesibilidad (sin SEO)

```bash
npx tsx src/index.ts --input url-total.txt --a11y --seo false --output solo-a11y
```

## 📋 Opciones

| Opción | Alias | Default | Descripción |
|--------|-------|---------|-------------|
| `--input` | `-i` | — | Archivo de URLs (`.txt` o `.csv`) |
| `--output` | `-o` | `output/results.json` | Ruta de salida |
| `--menu` | — | `false` | Abrir el asistente interactivo de configuración |
| `--format` | `-f` | `json` | `json`, `csv`, `html`, `md`, `both` (json + html) |
| `--timeout` | `-t` | `30000` | Timeout por URL en ms |
| `--delay` | `-d` | `1000` | Pausa entre URLs en ms |
| `--max-pages` | `-p` | `1` | Páginas a recorrer en listados paginados (sin discover) |
| `--a11y` | — | `false` | Auditoría de accesibilidad con axe-core |
| `--seo` | — | `true` | Extraer metadata SEO. Poner `false` para solo `--a11y` |
| `--googlebot` | `-g` | `false` | User-Agent de Googlebot Smartphone |
| `--no-cache-buster` | — | `false` | Desactivar cache buster |
| `--wait-until` | `-w` | `domcontentloaded` | `domcontentloaded`, `load`, `networkidle` |
| `--concurrency` | `-c` | `1` | Workers en paralelo (~300 MB RAM c/u) |
| `--verbose` | `-v` | `false` | Más información en consola |
| `--resume` | — | `false` | Reanudar desde checkpoint |
| `--checkpoint-every` | — | `10` | Guardar checkpoint cada N URLs (`0` = desactivado) |
| `--discover` | — | `false` | Descubrir URLs de artículos desde seeds |
| `--discover-selector` | — | `a[href$=".html"]` | Selector CSS para discover mode |
| `--discover-pages` | — | `1` | Páginas a recorrer en discover (sigue "Siguiente") |
| `--discover-recursive` | — | `false` | 2 fases: descubre secciones → notas desde cada sección |
| `--discover-scrape-all` | — | `false` | Scrapea TODAS las URLs descubiertas, no solo `.html` |

## 📊 Formatos de salida

### JSON
Estructura completa con todos los datos crudos, incluyendo el array `images` con cada imagen categorizada:

```json
{
  "url": "https://www.ecuavisa.com/noticias/ejemplo",
  "statusCode": 200,
  "metaTitle": "Título de la nota",
  "totalImages": 16,
  "images": [
    { "src": "https://assets.ecuavisa.com/foto-principal.jpg", "alt": "El presidente firma el decreto", "category": "descriptive" },
    { "src": "https://assets.ecuavisa.com/thumb.jpg", "alt": "foto", "category": "generic" },
    { "src": "https://assets.ecuavisa.com/decorativa.svg", "alt": "", "category": "empty" },
    { "src": "https://assets.ecuavisa.com/banner.jpg", "alt": "", "category": "bare" },
    { "src": "https://assets.ecuavisa.com/sin-alt.jpg", "alt": "", "category": "missing" }
  ],
  "backgroundImages": [
    { "src": "https://assets.ecuavisa.com/bg-hero.jpg", "alt": "", "element": "div.hero-section" }
  ],
  "pictureSources": [
    { "src": "https://assets.ecuavisa.com/foto-mobile.jpg", "media": "(max-width: 768px)", "alt": "Descripción" }
  ],
  "imagesWithoutAlt": 4,
  "imagesWithoutAltList": [...]
}
```

### HTML
Reporte visual profesional con **filtros interactivos** (por estado, imágenes, búsqueda por URL/title),
tabla ordenable con columnas de imágenes, background CSS, picture sources,
acordeones por URL con detalle completo (metadatos, headings, imágenes agrupadas,
background CSS, picture sources, structured data, accesibilidad), y diseño responsive en modo oscuro.

### Markdown
Reporte legible con tablas de categorías de imágenes agrupadas, ideal para PDF o documentación.

## 🔍 Ejemplo práctico para Ecuavisa.com

```bash
# 1. Creá url-total.txt con las secciones que querés analizar:
#    https://www.ecuavisa.com/noticias
#    https://www.ecuavisa.com/deportes
#    https://www.ecuavisa.com/entretenimiento

# 2. Ejecutá con discover mode + paginación + reporte completo:
npx tsx src/index.ts \
  --input url-total.txt \
  --discover \
  --discover-pages 3 \
  --concurrency 2 \
  --delay 2000 \
  --timeout 45000 \
  --format both \
  --output ecuavisa-auditoria

# 3. Revisá los reportes en:
#    ecuavisa-auditoria.json   ← datos crudos con todas las categorías
#    ecuavisa-auditoria.html   ← reporte visual con filtros y acordeones
```

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
| Concurrencia | Workers paralelos con BrowserContext propio |
| Raw HTML capture | Captura HTML original para detectar atributos bare |

## 🏗️ Estructura del proyecto

```
seo-ghost/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── scraper.ts            # Lógica de scraping y navegación
│   ├── discover.ts           # Descubrimiento automático de URLs
│   ├── axe.ts                # Integración axe-core
│   ├── progress.ts           # Barra de progreso visual
│   ├── formatter.ts          # Generación de JSON/HTML/Markdown
│   ├── evasion.ts            # Estrategias anti-detección
│   ├── types.ts              # Tipos e interfaces
│   └── collectors/
│       ├── types.ts          # Interfaz Collector
│       ├── helpers.ts        # Funciones puras (classifyAlt, detectUrlPattern)
│       ├── meta.collector.ts # Title, description, canonical, robots
│       ├── heading.collector.ts # H1/H2/H3
│       ├── image.collector.ts   # Imágenes, background CSS, picture sources
│       ├── og.collector.ts      # Open Graph + Twitter Cards
│       └── pagination.collector.ts # Paginación
├── openspec/                 # Documentación SDD
├── output/                   # Salida por defecto
└── package.json
```

## 📄 Licencia

MIT
