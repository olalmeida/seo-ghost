import { describe, expect, it } from 'vitest';
import { createSummary } from './reporting.js';

describe('reporting summary', () => {
  it('cuenta resultados y errores antes de serializar formatos', () => {
    const summary = createSummary([{ error: undefined }, { error: 'timeout' }] as never[]);
    expect(summary.totalProcessed).toBe(2);
    expect(summary.totalErrors).toBe(1);
  });
});
