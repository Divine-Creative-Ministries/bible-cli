/** Output + error conventions shared by every command. */

export interface OutputOpts {
  json?: boolean;
}

export function emit(opts: OutputOpts, data: unknown, text: () => string): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    process.stdout.write(text() + '\n');
  }
}

export function fail(opts: OutputOpts, message: string, extra?: Record<string, unknown>): never {
  if (opts.json) {
    process.stderr.write(JSON.stringify({ error: message, ...extra }) + '\n');
  } else {
    process.stderr.write(`error: ${message}\n`);
  }
  process.exit(1);
}

/** Render rows as aligned plain-text columns. */
export function table(rows: string[][], gap = 2): string {
  if (rows.length === 0) return '';
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!)))
        .join(' '.repeat(gap))
        .trimEnd(),
    )
    .join('\n');
}
