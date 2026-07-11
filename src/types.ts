/**
 * Categoría de alt text para una imagen.
 * - descriptive: alt descriptivo y válido
 * - generic: alt con texto plano/genérico (foto, IMG_001.jpg, etc.)
 * - empty: alt="" o alt sin valor (decorativa intencional)
 * - missing: no existe atributo alt
 */
export type AltCategory = 'descriptive' | 'generic' | 'empty' | 'bare' | 'missing';

/**
 * Análisis individual de una imagen en la página.
 */
export interface ImageAnalysis {
  /** URL absoluta de la imagen */
  src: string;
  /** Contenido del atributo alt (puede ser "") */
  alt: string;
  /** Categoría de alt detectada */
  category: AltCategory;
}

/**
 * Imagen de fondo CSS (background-image).
 */
export interface BgImageAnalysis {
  /** URL de la imagen de fondo */
  src: string;
  /** Alt asociado (aria-label, title o texto cercano) */
  alt: string;
  /** Selector/elemento que contiene la imagen */
  element: string;
}

/**
 * Fuente alternativa de un <picture> con su media query.
 */
export interface PictureSourceAnalysis {
  /** URL de la imagen en source/srcset */
  src: string;
  /** Media query asociada (ej: "(max-width: 768px)") */
  media: string;
  /** Alt del <img> dentro del <picture> */
  alt: string;
}

/**
 * Resultado SEO extraído por cada URL procesada.
 */
export interface SeoResult {
  /** URL que se procesó */
  url: string;
  /** Código de respuesta HTTP (null si hubo error de conexión) */
  statusCode: number | null;
  /** Contenido de la etiqueta <title> */
  metaTitle: string | null;
  /** Contenido de <meta name="description"> */
  metaDescription: string | null;
  /** Valor del href en <link rel="canonical"> */
  canonical: string | null;
  /** Contenido de <meta name="robots"> (noindex, nofollow, etc.) */
  metaRobots: string | null;

  // ─── Open Graph ────────────────────────────────────────────────
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  ogType: string | null;

  // ─── Twitter Cards ─────────────────────────────────────────────
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;

  // ─── Headings ──────────────────────────────────────────────────
  /** Array con el texto de todas las etiquetas <h1> */
  h1Tags: string[];
  /** Cantidad de etiquetas <h1> encontradas */
  h1Count: number;
  /** Array con el texto de todas las etiquetas <h2> */
  h2Tags: string[];
  /** Cantidad de etiquetas <h2> encontradas */
  h2Count: number;
  /** Array con el texto de todas las etiquetas <h3> */
  h3Tags: string[];
  /** Cantidad de etiquetas <h3> encontradas */
  h3Count: number;
  /** Issues de jerarquía de headings */
  headingIssues: string[];

  // ─── Imágenes ──────────────────────────────────────────────────
  /** Total de etiquetas <img> en el DOM */
  totalImages: number;
  /** Imágenes sin alt o con alt="" */
  imagesWithoutAlt: number;
  /** Lista de URLs (src) de imágenes que no tienen alt */
  imagesWithoutAltList: string[];
  /** Análisis completo de todas las imágenes con categorización */
  images: ImageAnalysis[];
  /** Imágenes de fondo CSS background-image */
  backgroundImages?: BgImageAnalysis[];
  /** Fuentes de <picture> con media queries */
  pictureSources?: PictureSourceAnalysis[];
  /** Total de imágenes de fondo */
  totalBgImages?: number;

  // ─── Contenido ──────────────────────────────────────────────────
  /** Cantidad de palabras del contenido visible */
  wordCount: number;
  /** Cantidad de párrafos (<p>) en el DOM */
  paragraphCount: number;

    // ─── Accesibilidad (axe-core) ─────────────────────────────────
  /** Resultados de auditoría de accesibilidad con axe-core (solo si --a11y) */
  axeViolations?: AxeViolation[];
  /** Cantidad total de violaciones de accesibilidad */
  axeViolationCount?: number;

  // ─── Structured Data (JSON-LD) ────────────────────────────────
  /** Bloques de structured data encontrados */
  structuredData: StructuredDataItem[];
  /** Cantidad total de bloques JSON-LD */
  structuredDataCount: number;
  /** Cantidad de bloques JSON-LD válidos */
  structuredDataValid: number;

  /** Mensaje de error si falló la URL (undefined si OK) */
  error?: string;
}

// ─── Accesibilidad ────────────────────────────────────────────────

/**
 * Una violación individual detectada por axe-core.
 */
export interface AxeViolation {
  /** Identificador único de la regla (ej: "color-contrast") */
  id: string;
  /** Impacto: "critical" | "serious" | "moderate" | "minor" */
  impact: string;
  /** Descripción legible del problema */
  description: string;
  /** Ayuda para resolverlo */
  help: string;
  /** Enlace a la guía de ayuda */
  helpUrl: string;
  /** Número de elementos afectados */
  nodes: number;
  /** Severidad agregada para el reporte */
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  /** Lista de selectores de los elementos afectados (primeros 5) */
  targets: string[];
}

/**
 * Estrategia de espera para la navegación.
 * - 'domcontentloaded': Espera a que el HTML esté parseado (más rápido, ideal para SEO)
 * - 'load': Espera a que todos los recursos carguen (estándar)
 * - 'networkidle': Espera a que no haya conexiones de red por 500ms (más estricto)
 */
export type WaitUntil = 'domcontentloaded' | 'load' | 'networkidle';

/**
 * Opciones de configuración para el scraping.
 */
export interface ScrapeOptions {
  /** Timeout por cada navegación en ms (default: 30000) */
  timeout?: number;
  /** Delay entre requests en ms para evitar rate limiting (default: 1000) */
  delay?: number;
  /** Estrategia de espera inicial (default: 'domcontentloaded') */
  waitUntil?: WaitUntil;
  /** Usar User-Agent de Googlebot Smartphone (default: false) */
  useGooglebot?: boolean;
  /** Cache buster: agregar ?_t=timestamp a cada URL para evitar cache (default: true) */
  cacheBuster?: boolean;
  /** Máximo de páginas a recorrer en listados paginados (default: 1 = sin paginación) */
  maxPages?: number;
  /** Ejecutar extracción SEO (default: true; poner false para solo a11y) */
  runSeo?: boolean;
  /** Ejecutar auditoría de accesibilidad con axe-core en cada página */
  runAxe?: boolean;
  /** Ruta para guardar checkpoints (default: no checkpoint) */
  checkpointPath?: string;
  /** Guardar checkpoint cada N URLs (default: 10) */
  checkpointEvery?: number;
  /** Resultados existentes para reanudar */
  existingResults?: SeoResult[];
  /** Índice desde el cual reanudar (0-based) */
  startIndex?: number;
  /** Número de workers concurrentes (default: 1). Cada worker usa su propio context. */
  concurrency?: number;
  /** HTML original de la respuesta HTTP (antes del parseo del browser) */
  rawHtml?: string;
}

// ─── Structured Data (JSON-LD) ───────────────────────────────────

/**
 * Un bloque individual de JSON-LD encontrado en la página.
 */
export interface StructuredDataItem {
  /** JSON raw (minificado) */
  raw: string;
  /** Tipo(s) detectados (@type) */
  types: string[];
  /** Si el JSON es válido */
  valid: boolean;
  /** Mensaje de error si no se pudo parsear */
  error?: string;
}

// ─── Checkpoint ──────────────────────────────────────────────────

/**
 * Checkpoint guardado durante el scraping para permitir reanudar
 * ejecuciones interrumpidas.
 */
export interface Checkpoint {
  /** Lista original de URLs (completa) */
  urls: string[];
  /** Resultados procesados hasta el momento */
  results: SeoResult[];
  /** Próximo índice a procesar (0-based) */
  nextIndex: number;
  /** Timestamp del último guardado */
  timestamp: string;
}

/**
 * Resumen general de la ejecución.
 */
export interface ScrapeSummary {
  /** Timestamp ISO de la ejecución */
  timestamp: string;
  /** URLs procesadas exitosamente */
  totalProcessed: number;
  /** URLs con error */
  totalErrors: number;
  /** Resultados individuales */
  results: SeoResult[];
}

/**
 * Argumentos del CLI parseados.
 */
export type OutputFormat = 'json' | 'md' | 'html' | 'both';

export interface CliArgs {
  /** Ruta al archivo de entrada (.txt o .csv) */
  input: string;
  /** Ruta al archivo de salida JSON (opcional) */
  output?: string;
  /** Timeout por URL en ms */
  timeout?: number;
  /** Delay entre requests en ms */
  delay?: number;
  /** Estrategia de espera */
  waitUntil?: string;
  /** Usar User-Agent de Googlebot (default: false) */
  googlebot?: boolean;
  /** Desactivar cache buster */
  noCacheBuster?: boolean;
  /** Formato de salida: json, md, csv, both */
  format?: string;
  /** Reanudar desde el último checkpoint */
  resume?: boolean;
  /** Guardar checkpoint cada N URLs */
  checkpointEvery?: number;
  /** Concurrencia: workers en paralelo (default: 1) */
  concurrency?: number;
  /** Modo verbose */
  verbose?: boolean;
  /** Máximo de páginas a recorrer (paginación) */
  maxPages?: number;
  /** Ejecutar auditoría de accesibilidad con axe-core */
  a11y?: boolean;
  /** Ejecutar extracción SEO (default: true; false para solo a11y) */
  seo?: boolean;
  /** Discover mode: extraer URLs de artículos desde seed URLs */
  discover?: boolean;
  /** Selector CSS para discover mode */
  discoverSelector?: string;
  /** Páginas a recorrer en discover mode paginado */
  discoverPages?: number;
  /** Modo recursivo: descubre secciones y luego notas */
  discoverRecursive?: boolean;
  /** Scrapea TODAS las URLs descubiertas, no solo .html */
  discoverScrapeAll?: boolean;
}
