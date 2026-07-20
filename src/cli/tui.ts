import { stdin as input, stdout as output } from 'node:process';

export interface TuiOption<T> {
  label: string;
  description?: string;
  value: T;
}

export interface TuiScreenOptions {
  /** Contexto breve debajo del título. */
  subtitle?: string;
  /** Progreso legible del asistente, por ejemplo "Paso 2 de 4". */
  step?: string;
  /** Resumen no interactivo mostrado antes de las opciones. */
  summary?: string[];
}

export type TuiKey = 'up' | 'down' | 'enter' | 'escape' | 'ctrl-c' | 'unknown';

/** Acumula secuencias ANSI que pueden llegar partidas o agrupadas en un chunk. */
export class KeyInputBuffer {
  private buffer = '';

  push(chunk: string): TuiKey[] {
    this.buffer += chunk;
    return this.consume(false);
  }

  flush(): TuiKey[] {
    return this.consume(true);
  }

  get pending(): boolean {
    return this.buffer.length > 0;
  }

  private consume(flush: boolean): TuiKey[] {
    const keys: TuiKey[] = [];
    while (this.buffer.length > 0) {
      if (this.buffer.startsWith('\u001b[A')) {
        keys.push('up');
        this.buffer = this.buffer.slice(3);
      } else if (this.buffer.startsWith('\u001b[B')) {
        keys.push('down');
        this.buffer = this.buffer.slice(3);
      } else if (this.buffer === '\u001b' || '\u001b[A'.startsWith(this.buffer) || '\u001b[B'.startsWith(this.buffer)) {
        if (!flush) break;
        keys.push('escape');
        this.buffer = this.buffer.slice(1);
      } else {
        keys.push(parseKey(this.buffer[0]));
        this.buffer = this.buffer.slice(1);
      }
    }
    return keys;
  }
}

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

export function renderMenu<T>(title: string, options: TuiOption<T>[], selectedIndex: number, screen: TuiScreenOptions = {}): string {
  const rows = options.map((option, index) => {
    const active = index === selectedIndex;
    const marker = active ? '❯' : ' ';
    const label = active ? `\x1b[1;97;46m ${option.label} \x1b[0m` : `\x1b[37m${option.label}\x1b[0m`;
    const description = option.description ? `\x1b[2m${active ? ' ·' : ' —'} ${option.description}\x1b[0m` : '';
    return `  ${marker} ${label}${description}`;
  });

  return [
    '\x1b[2J\x1b[H',
    '\x1b[1;36m╭──────────────────────────────────────────────────╮\x1b[0m',
    '\x1b[1;36m│\x1b[0m  \x1b[1;97m👻 SEO GHOST\x1b[0m  \x1b[2mAuditoría web guiada\x1b[0m                \x1b[1;36m│\x1b[0m',
    '\x1b[1;36m╰──────────────────────────────────────────────────╯\x1b[0m',
    '',
    screen.step ? `\x1b[36m${screen.step}\x1b[0m` : '',
    `\x1b[1m${title}\x1b[0m`,
    screen.subtitle ? `\x1b[2m${screen.subtitle}\x1b[0m` : '',
    ...(screen.summary ?? []).map((line) => `  \x1b[2m${line}\x1b[0m`),
    '',
    ...rows,
    '',
    '\x1b[2m↑↓ o j/k mover · Enter continuar · Esc cancelar\x1b[0m',
  ].join('\n');
}

/** Pantalla consistente para solicitar texto sin abandonar la identidad visual de la TUI. */
export function renderTextPrompt(title: string, screen: TuiScreenOptions = {}): string {
  return [
    '\x1b[2J\x1b[H',
    '\x1b[1;36m╭──────────────────────────────────────────────────╮\x1b[0m',
    '\x1b[1;36m│\x1b[0m  \x1b[1;97m👻 SEO GHOST\x1b[0m  \x1b[2mAuditoría web guiada\x1b[0m                \x1b[1;36m│\x1b[0m',
    '\x1b[1;36m╰──────────────────────────────────────────────────╯\x1b[0m',
    '',
    screen.step ? `\x1b[36m${screen.step}\x1b[0m` : '',
    `\x1b[1m${title}\x1b[0m`,
    screen.subtitle ? `\x1b[2m${screen.subtitle}\x1b[0m` : '',
    ...(screen.summary ?? []).map((line) => `  \x1b[2m${line}\x1b[0m`),
    '',
    '\x1b[2mIngresá el valor y presioná Enter.\x1b[0m',
  ].join('\n');
}

/** Selector de terminal sin dependencias externas, navegable con flechas. */
export async function selectOption<T>(title: string, options: TuiOption<T>[], screen: TuiScreenOptions = {}): Promise<T | null> {
  if (!input.isTTY || !output.isTTY || options.length === 0) return null;

  let selectedIndex = 0;
  const restoreRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();

  return new Promise<T | null>((resolve) => {
    const keyBuffer = new KeyInputBuffer();
    let escapeTimer: ReturnType<typeof setTimeout> | undefined;
    const render = () => output.write(renderMenu(title, options, selectedIndex, screen));
    const finish = (value: T | null) => {
      if (escapeTimer) clearTimeout(escapeTimer);
      input.off('data', onData);
      input.setRawMode(restoreRawMode);
      input.pause();
      output.write('\x1b[2J\x1b[H');
      resolve(value);
    };
    const handleKey = (key: TuiKey) => {
      switch (key) {
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
    const onData = (buffer: Buffer) => {
      if (escapeTimer) clearTimeout(escapeTimer);
      for (const key of keyBuffer.push(buffer.toString('utf8'))) handleKey(key);
      if (keyBuffer.pending) {
        escapeTimer = setTimeout(() => {
          for (const key of keyBuffer.flush()) handleKey(key);
        }, 30);
      }
    };

    input.on('data', onData);
    render();
  });
}
