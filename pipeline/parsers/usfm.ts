/**
 * Minimal USFM verse-text extractor tuned for eBible.org editions.
 * Extracts plain verse text (footnotes/cross-refs/headings stripped),
 * Psalm titles from \d as verse 0, and verse bridges (\v 17-18).
 */

export interface UsfmVerse {
  chapter: number;
  verse: number; // 0 = \d title
  endVerse?: number; // set for bridges
  text: string;
}

/** Markers whose whole line is non-scripture (headings, ids, front matter). */
const SKIP_LINE = /^\\(id|ide|usfm|h|toc\d?|toca\d?|mt\d?|imt\d?|is\d?|ip|ipi|im|io\d?|iot|iex|ie|s\d?|sr|r|rem|ms\d?|mr|sp|cl|cp|cd|periph|restore)\b/;

/** Paragraph-level markers whose content continues the current verse. */
const PARA = /^\\(p|m|po|pr|pc|pi\d?|mi|nb|cls|li\d?|lim\d?|pm[ocr]?|q\d?|qr|qc|qm\d?|qd|b|ph\d?|tr|d?|lh|lf)\s*/;

export function parseUsfm(content: string): { bookId: string; verses: UsfmVerse[] } {
  const lines = content.split(/\r?\n/);
  const idLine = lines.find((l) => l.startsWith('\\id '));
  const bookId = idLine ? idLine.slice(4).trim().split(/\s+/)[0]! : '';

  const verses: UsfmVerse[] = [];
  let chapter = 0;
  let current: UsfmVerse | null = null;

  const flush = () => {
    if (current) {
      current.text = cleanText(current.text);
      if (current.text) verses.push(current);
      current = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('\\c ')) {
      flush();
      chapter = parseInt(line.slice(3).trim(), 10);
      continue;
    }
    if (SKIP_LINE.test(line) && !line.startsWith('\\d')) continue;

    if (line.startsWith('\\d')) {
      // Psalm superscription -> verse 0
      flush();
      current = { chapter, verse: 0, text: line.replace(/^\\d\s*/, '') + ' ' };
      continue;
    }

    // A line may contain multiple \v markers after a paragraph marker.
    let rest = line;
    const paraMatch = rest.match(PARA);
    if (paraMatch && !rest.startsWith('\\v')) {
      rest = rest.slice(paraMatch[0].length);
      if (!rest.includes('\\v')) {
        if (current && rest) current.text += rest + ' ';
        continue;
      }
    }

    // Split on verse markers, keeping delimiters.
    const parts = rest.split(/(\\v\s+[\d,-]+[a-b]?\s*)/);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const vm = part.match(/^\\v\s+(\d+)(?:-(\d+))?[a-b]?\s*$/);
      if (vm) {
        flush();
        const v = parseInt(vm[1]!, 10);
        const endVerse = vm[2] ? parseInt(vm[2]!, 10) : undefined;
        current = { chapter, verse: v, text: '' };
        if (endVerse !== undefined && endVerse !== v) current.endVerse = endVerse;
      } else if (part) {
        if (current) current.text += part + ' ';
      }
    }
  }
  flush();
  return { bookId, verses };
}

export function cleanText(t: string): string {
  let s = t;
  // paragraph markers that slipped into mid-line content
  s = s.replace(/\\(q\d?|qr|qc|m|b|p|pi\d?|mi|nb|li\d?)\b\s*/g, ' ');
  // footnotes and cross references (including nested content)
  s = s.replace(/\\f\s[\s\S]*?\\f\*/g, ' ');
  s = s.replace(/\\fe\s[\s\S]*?\\fe\*/g, ' ');
  s = s.replace(/\\x\s[\s\S]*?\\x\*/g, ' ');
  // word-level markup \w text|attrs\w* -> text
  s = s.replace(/\\\+?w\s+([^|\\]*)(?:\|[^\\]*)?\\\+?w\*/g, '$1');
  // paired character markers: keep inner text
  s = s.replace(/\\\+?(add|nd|wj|qt|sls|tl|em|bd|it|bdit|no|sc|sup|k|ord|png|pn|qs|rq|sig|dc|ndx|pro|wg|wh|wa|lik|liv\d?|litl|jmp)\s*/g, '');
  s = s.replace(/\\\+?[a-z]+\d?\*/g, '');
  // any leftover backslash markers
  s = s.replace(/\\[a-z]+\d?\s*/g, ' ');
  // eBible bracketed alternates stay as-is; collapse whitespace
  s = s.replace(/\s+([,.;:!?’”)\]])/g, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
