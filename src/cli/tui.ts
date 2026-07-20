import { stdin as input, stdout as output } from 'node:process';

export interface TuiOption<T> {
  label: string;
  description?: string;
  value: T;
}

export type TuiKey = 'up' | 'down' | 'enter' | 'escape' | 'ctrl-c' | 'unknown';

export function moveSelection(current: number, direction: 'up' | 'down', length: number): number {
  if (length <= 0) return 0;
  return direction === 'up'
    ? (current - 1 + length) % length
    : (current + 1) % length;
}

export function parseKey(chunk: string): TuiKey {
  if (chunk === '\u0003') return 'ctrl-c';
  if (chunk === '\u001b') return 'escape';
  if (chunk === '\u001b[A' || chunk === 'k') return 'up';
  if (chunk === '\u001b[B' || chunk === 'j') return 'down';
  if (chunk === '\r' || chunk === '\n') return 'enter';
  return 'unknown';
}

export function renderMenu<T>(title: string, options: TuiOption<T>[], selectedIndex: number): string {
  const rows = options.map((option, index) => {
    const active = index === selectedIndex;
    const marker = active ? '❯' : ' ';
    const label = active ? `\x1b[1;36m${option.label}\x1b[0m` : option.label;
    const description = option.description ? `\x1b[2m — ${option.description}\x1b[0m` : '';
    return `  ${marker} ${label}${description}`;
  });

  return [
    '\x1b[2J\x1b[H',
    '\x1b[1;36m╔══════════════════════════════════════════════════╗\x1b[0m',
    '\x1b[1;36m║                 👻  SEO GHOST                     ║\x1b[0m',
    '\x1b[1;36m╚══════════════════════════════════════════════════╝\x1b[0m',
    '',
    `\x1b[1m${title}\x1b[0m`,
    '',
    ...rows,
    '',
    '\x1b[2m↑↓ o j/k navegar · Enter seleccionar · Esc cancelar\x1b[0m',
  ].join('\n');
}

/** Selector de terminal sin dependencias externas, navegable con flechas. */
export async function selectOption<T>(title: string, options: TuiOption<T>[]): Promise<T | null> {
  if (!input.isTTY || !output.isTTY || options.length === 0) return null;

  let selectedIndex = 0;
  const restoreRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();

  return new Promise<T | null>((resolve) => {
    const render = () => output.write(renderMenu(title, options, selectedIndex));
    const finish = (value: T | null) => {
      input.off('data', onData);
      input.setRawMode(restoreRawMode);
      output.write('\x1b[2J\x1b[H');
      resolve(value);
    };
    const onData = (buffer: Buffer) => {
      switch (parseKey(buffer.toString('utf8'))) {
        case 'up':
          selectedIndex = moveSelection(selectedIndex, 'up', options.length);
          render();
          break;
        case 'down':
          selectedIndex = moveSelection(selectedIndex, 'down', options.length);
          render();
          break;
        case 'enter':
          finish(options[selectedIndex].value);
          break;
        case 'escape':
        case 'ctrl-c':
          finish(null);
          break;
      }
    };

    input.on('data', onData);
    render();
  });
}
