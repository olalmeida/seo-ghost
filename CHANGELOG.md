# Changelog

## 1.1.0 — Análisis Expandido de Imágenes

### ✨ Nuevas funcionalidades

- **Categoría `bare` para imágenes**: Detecta `<img alt>` (atributo `alt` sin valor). Chromium normaliza `<img alt>` a `<img alt="">` en el DOM, así que capturamos el HTML original vía `response.text()` y aplicamos regex para distinguir `bare` de `empty`.
- **Extracción de `background-image` CSS**: Escanea todos los elementos con contenido visual (div, section, article, figure, header, footer, aside, main, span, a, button) y extrae las imágenes de fondo vía `getComputedStyle`.
- **Extracción de `<picture>` / `<source>`**: Captura fuentes alternativas con sus media queries y srcset para análisis responsive.
- **`--discover-pages`**: Controla cuántas páginas recorrer en discover mode siguiendo el botón "Siguiente".
- **`--discover-recursive`**: Modo de 2 fases — primero descubre todas las secciones internas, luego descubre notas desde cada sección descubierta.
- **`--discover-scrape-all`**: Scrapea TODAS las URLs descubiertas (no solo `.html`), ideal para sitios sin extensión en las URLs.

### 🔧 Mejoras

- **HTML rediseñado con más detalle**: Nuevas columnas "BG Img" y "Picture" en la tabla de resultados, cards de resumen para background images y picture sources, secciones de detalle expandibles para cada tipo.
- **Bare matching por filename exacto**: En vez de `includes()` (que daba falsos positivos si dos URLs tenían nombres similares), compara el nombre de archivo exacto entre el DOM y el raw HTML.
- **URL visible en cada línea de resultado**: `shortenUrl()` + `buildResultLine()` muestran la URL acortada junto a los counts de ALT.
- **Badge `.badge-orange`**: Nueva clase CSS para la categoría `bare` en el reporte HTML.
- **Desglose semilla vs descubiertas**: En discover mode se muestra cuántas URLs vienen del archivo semilla y cuántas fueron descubiertas.
- **Options clonado por worker**: Cada worker recibe una copia de `sharedOptions` para evitar race conditions al mutar propiedades internas.

### 🐛 Bug fixes

- **Race condition en scrapeUrl**: Las opciones compartidas se mutaban entre workers causando que `opts.rawHtml` de una URL contaminara a otra. Ahora cada worker clona `sharedOptions` al iniciar.
- **`await` faltante en helpers de scroll**: `triggerCarousels()` y `scrollToBottom()` no tenían `await` en la llamada dentro de `collectPageImages()`, causando que el browser cerrara antes de terminar el scroll (`Target page, context or browser has been closed`).
- **`createEmptyResult()` sin inicializar nuevos campos**: Los campos `backgroundImages`, `totalBgImages` y `pictureSources` no se inicializaban en el resultado por defecto, causando `undefined` en los formatters.

### 🧪 Tests

- 3 tests nuevos para `classifyAlt()` con la categoría `bare`.
- 47 tests totales en helpers.test.ts.
- 0 errores de TypeScript (`tsc --noEmit`).
