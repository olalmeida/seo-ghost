import { describe, expect, it } from 'vitest';
import { KeyInputBuffer, moveSelection, parseKey, renderMenu, renderTextPrompt } from './tui.js';

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

  it('ensambla y separa secuencias ANSI fragmentadas o agrupadas', () => {
    const input = new KeyInputBuffer();
    expect(input.push('\u001b')).toEqual([]);
    expect(input.push('[A')).toEqual(['up']);
    expect(input.push('\u001b[B\r')).toEqual(['down', 'enter']);
    expect(input.push('\u001b')).toEqual([]);
    expect(input.flush()).toEqual(['escape']);
  });

  it('muestra una opción destacada y las ayudas de teclado', () => {
    const screen = renderMenu('Elegí un perfil', [
      { label: 'Rápido', value: 'quick' },
      { label: 'Completo', value: 'full' },
    ], 1, { step: 'Paso 2 de 4', subtitle: 'Elegí el alcance de la auditoría.' });

    expect(screen).toContain('❯');
    expect(screen).toContain('Completo');
    expect(screen).toContain('Paso 2 de 4');
    expect(screen).toContain('Enter continuar');
  });

  it('mantiene el contexto visual al pedir datos de texto', () => {
    const screen = renderTextPrompt('Datos de entrada', {
      step: 'Paso 3 de 4', summary: ['Perfil: SEO'],
    });

    expect(screen).toContain('Datos de entrada');
    expect(screen).toContain('Perfil: SEO');
    expect(screen).toContain('Ingresá el valor');
  });
});
