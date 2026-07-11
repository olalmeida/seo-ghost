import type { Page } from 'playwright';
import type { SeoResult, ScrapeOptions } from '../types.js';

/**
 * Interfaz común para todos los extractores de datos.
 *
 * Cada Collector es responsable de extraer UN dominio de información
 * de la página y escribirlo en el objeto SeoResult.
 *
 * Beneficios:
 *   - Single Responsibility: cada collector hace una sola cosa
 *   - Open/Closed: se agregan nuevos collectors sin modificar los existentes
 *   - Testeable: cada collector se testea de forma aislada
 *   - Orquestable: el scraper los ejecuta según los flags activos
 */
export interface Collector {
  /** Nombre legible del collector (para debugging) */
  readonly name: string;

  /** Determina si este collector debe ejecutarse según las opciones */
  isEnabled(options: ScrapeOptions): boolean;

  /**
   * Extrae datos de la página y los escribe en result.
   * @param page   - Página de Playwright (ya navegada)
   * @param result - Objeto resultado a mutar con los datos extraídos
   * @param options - Opciones de scraping (para configuración adicional)
   */
  extract(page: Page, result: SeoResult, options: ScrapeOptions): Promise<void>;
}
