import { describe, it, expect } from 'vitest';
import { OGCollector } from './og.collector.js';

describe('OGCollector', () => {
  const collector = new OGCollector();

  it('name es "og"', () => {
    expect(collector.name).toBe('og');
  });

  it('isEnabled retorna true cuando runSeo no está definido', () => {
    expect(collector.isEnabled({})).toBe(true);
  });

  it('isEnabled retorna true cuando runSeo es true', () => {
    expect(collector.isEnabled({ runSeo: true })).toBe(true);
  });

  it('isEnabled retorna false cuando runSeo es false', () => {
    expect(collector.isEnabled({ runSeo: false })).toBe(false);
  });
});
