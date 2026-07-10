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
  /** Valor del href en <link rel="canonical"> */
  canonical: string | null;

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

    // ─── Accesibilidad (axe-core) ─────────────────────────────────
  /** Resultados de auditoría de accesibilidad con axe-core (solo si --a11y) */
  axeViolations?: AxeViolation[];
  /** Cantidad total de violaciones de accesibilidad */
  axeViolationCount?: number;

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
  /** Ejecutar auditoría de accesibilidad con axe-core en cada página */
  runAxe?: boolean;
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
  /** Formato de salida: json, md, both */
  format?: string;
  /** Modo verbose */
  verbose?: boolean;
  /** Máximo de páginas a recorrer (paginación) */
  maxPages?: number;
  /** Ejecutar auditoría de accesibilidad con axe-core */
  a11y?: boolean;
}
