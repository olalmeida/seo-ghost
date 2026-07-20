import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('CLI executable', () => {
  it('muestra la ayuda personalizada sin requerir un archivo de entrada', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts', '--help'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SEO GHOST · Auditoría SEO para sitios reales');
    expect(result.stdout).toContain('seo-ghost audit --url https://example.com');
  });
});
