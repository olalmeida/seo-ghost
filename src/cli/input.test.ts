import { describe, expect, it } from 'vitest';
import { parseCsvRecords, parseUrlFile } from './input.js';

describe('CSV URL input', () => {
  it('respeta comas y comillas RFC 4180', () => {
    expect(parseCsvRecords('url,title\n"https://example.com/a,b","Título, con coma"\n'))
      .toEqual([['url', 'title'], ['https://example.com/a,b', 'Título, con coma']]);
  });

  it('encuentra la columna URL sin depender de su posición', () => {
    expect(parseUrlFile('title,url\nUno,https://example.com/uno\n', true))
      .toEqual(['https://example.com/uno']);
  });

  it('mantiene el soporte de TXT con comentarios', () => {
    expect(parseUrlFile('# comentario\nhttps://example.com\n', false))
      .toEqual(['https://example.com']);
  });
});
