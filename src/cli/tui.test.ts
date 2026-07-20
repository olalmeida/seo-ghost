import { describe, expect, it } from 'vitest';
import { moveSelection, parseKey, renderMenu } from './tui.js';

describe('TUI navigation', () => {
  it('navega de forma circular con flechas', () => {
    expect(moveSelection(0, 'up', 4)).toBe(3);
    expect(moveSelection(3, 'down', 4)).toBe(0);
    expect(moveSelection(1, 'down', 4)).toBe(2);
  });

  it('interpreta flechas, enter y escape', () => {
    expect(parseKey('\u001b[A')).toBe('up');
    expect(parseKey('\u001b[B')).toBe('down');
    expect(parseKey('\r')).toBe('enter');
    expect(parseKey('\u001b')).toBe('escape');
  });

  it('muestra una opción destacada y las ayudas de teclado', () => {
    const screen = renderMenu('Elegí un perfil', [
      { label: 'Rápido', value: 'quick' },
      { label: 'Completo', value: 'full' },
    ], 1);

    expect(screen).toContain('❯');
    expect(screen).toContain('Completo');
    expect(screen).toContain('Enter seleccionar');
  });
});
