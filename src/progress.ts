/**
 * ProgressBar — Barra de progreso por línea de comandos.
 *
 * Renderiza una barra tipo `[████████░░░░░░░░░░░░] 45% | 16/35`
 * con tiempo estimado restante y tasa de URLs/minuto.
 *
 * Compatible con Windows PowerShell 5.1 (usa \r + padding, sin
 * códigos ANSI de borrado de línea).
 *
 * Uso:
 *   const bar = new ProgressBar(35);
 *   // ... procesar URL ...
 *   bar.tick(); // incrementa y re-renderiza
 *   // ... o con mensaje
 *   bar.tick('✓ OK | ✅ Title | H1: 6');
 *   // ...
 *   bar.done();
 */

export class ProgressBar {
  private startTime: number;
  private current = 0;
  private readonly total: number;
  private readonly barWidth = 20;
  private padWidth = 80;

  constructor(total: number, current = 0) {
    if (total < 1) throw new Error('ProgressBar: total debe ser >= 1');
    this.total = total;
    this.current = Math.max(0, Math.min(current, total));
    this.startTime = Date.now();
    this.render();
  }

  // ─── API pública ────────────────────────────────────────────────

  /** Incrementa el progreso en 1 y re-renderiza la barra */
  tick(resultMessage?: string): void {
    this.current = Math.min(this.current + 1, this.total);

    if (resultMessage) {
      this.clearLine();
      process.stdout.write(resultMessage + '\n');
    }

    this.render();
  }

  /** Finaliza y deja la barra en 100% */
  done(): void {
    this.current = this.total;
    this.render();
    process.stdout.write('\n');
  }

  // ─── Render ──────────────────────────────────────────────────────

  private render(): void {
    const pct = Math.round((this.current / this.total) * 100);
    const filled = Math.round((this.current / this.total) * this.barWidth);
    const empty = this.barWidth - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    let line = `\r[${bar}] ${pct}% | ${this.current}/${this.total}`;

    // Solo mostrar tiempos después de 5s y al menos 1 completado
    if (this.current > 0) {
      const elapsed = Date.now() - this.startTime;

      if (elapsed > 5_000) {
        const rate = this.current / (elapsed / 60_000); // URLs/min
        const remainingMs =
          rate > 0 ? (this.total - this.current) / (rate / 60_000) : 0;

        line += ` | ⏱️  ${fmtDuration(remainingMs)} restantes | ~${rate.toFixed(1)} URLs/min`;
      } else if (elapsed > 200) {
        const rate = this.current / (elapsed / 60_000);
        line += ` | ~${rate.toFixed(1)} URLs/min`;
      }
    }

    this.padWidth = Math.max(this.padWidth, line.length + 1);
    process.stdout.write(line);
  }

  private clearLine(): void {
    process.stdout.write('\r' + ' '.repeat(this.padWidth) + '\r');
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms <= 0 || !isFinite(ms)) return '?m ?s';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
