import { describe, expect, it } from 'vitest';
import { getContiguousPrefixLength } from './scraper.js';

describe('concurrent checkpoint ordering', () => {
  it('solo considera persistible el prefijo contiguo terminado', () => {
    expect(getContiguousPrefixLength([undefined, 'url-2', 'url-3'])).toBe(0);
    expect(getContiguousPrefixLength(['url-1', undefined, 'url-3'])).toBe(1);
    expect(getContiguousPrefixLength(['url-1', 'url-2', 'url-3'])).toBe(3);
  });
});
