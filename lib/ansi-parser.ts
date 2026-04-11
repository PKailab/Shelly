/**
 * lib/ansi-parser.ts — Parse ANSI escape codes into styled segments
 *
 * Converts terminal output with ANSI color codes into an array of
 * { text, color, bold, italic, underline } segments for rendering.
 */

export type AnsiSegment = {
  text: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
};

// Standard ANSI 16-color palette (bright variants)
const ANSI_COLORS: Record<number, string> = {
  30: '#4B5563', // black (dark gray for visibility)
  31: '#EF4444', // red
  32: '#4ADE80', // green
  33: '#FBBF24', // yellow
  34: '#60A5FA', // blue
  35: '#C084FC', // magenta
  36: '#22D3EE', // cyan
  37: '#E5E7EB', // white
  // Bright variants
  90: '#6B7280', // bright black (gray)
  91: '#F87171', // bright red
  92: '#86EFAC', // bright green
  93: '#FDE047', // bright yellow
  94: '#93C5FD', // bright blue
  95: '#D8B4FE', // bright magenta
  96: '#67E8F9', // bright cyan
  97: '#F9FAFB', // bright white
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#1F2937',
  41: 'rgba(239,68,68,0.2)',
  42: 'rgba(74,222,128,0.15)',
  43: 'rgba(251,191,36,0.15)',
  44: 'rgba(96,165,250,0.15)',
  45: 'rgba(192,132,252,0.15)',
  46: 'rgba(34,211,238,0.15)',
  47: 'rgba(229,231,235,0.1)',
};

// CSI sequence regex: ESC[ followed by params and a letter
const CSI_REGEX = /\x1b\[([0-9;]*)m/g;
// Also strip OSC and other non-CSI escapes
const OTHER_ESC = /\x1b\][^\x07]*\x07|\x1b[^[\x1b]\S?/g;

/**
 * Parse a string containing ANSI escape codes into styled segments.
 */
export function parseAnsi(input: string): AnsiSegment[] {
  // Fast path: no escape codes
  if (!input.includes('\x1b')) {
    return input ? [{ text: input }] : [];
  }

  const segments: AnsiSegment[] = [];
  let currentColor: string | undefined;
  let currentBg: string | undefined;
  let bold = false;
  let italic = false;
  let underline = false;
  let dim = false;
  let lastIndex = 0;

  // Strip non-color escapes first
  const cleaned = input.replace(OTHER_ESC, '');

  CSI_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CSI_REGEX.exec(cleaned)) !== null) {
    // Text before this escape
    if (match.index > lastIndex) {
      const text = cleaned.slice(lastIndex, match.index);
      if (text) {
        segments.push({ text, color: currentColor, bgColor: currentBg, bold, italic, underline, dim });
      }
    }
    lastIndex = match.index + match[0].length;

    // Parse SGR params
    const params = match[1] ? match[1].split(';').map(Number) : [0];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (p === 0) {
        // Reset
        currentColor = undefined;
        currentBg = undefined;
        bold = false;
        italic = false;
        underline = false;
        dim = false;
      } else if (p === 1) {
        bold = true;
      } else if (p === 2) {
        dim = true;
      } else if (p === 3) {
        italic = true;
      } else if (p === 4) {
        underline = true;
      } else if (p === 22) {
        bold = false;
        dim = false;
      } else if (p === 23) {
        italic = false;
      } else if (p === 24) {
        underline = false;
      } else if (p >= 30 && p <= 37) {
        currentColor = ANSI_COLORS[p];
      } else if (p >= 40 && p <= 47) {
        currentBg = ANSI_BG_COLORS[p];
      } else if (p === 39) {
        currentColor = undefined; // default fg
      } else if (p === 49) {
        currentBg = undefined; // default bg
      } else if (p >= 90 && p <= 97) {
        currentColor = ANSI_COLORS[p];
      } else if (p === 38 && i + 1 < params.length) {
        // 256-color or truecolor
        if (params[i + 1] === 5 && i + 2 < params.length) {
          // 256-color: approximate
          currentColor = ansi256ToHex(params[i + 2]);
          i += 2;
        } else if (params[i + 1] === 2 && i + 4 < params.length) {
          // Truecolor
          currentColor = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
          i += 4;
        }
      } else if (p === 48 && i + 1 < params.length) {
        if (params[i + 1] === 5 && i + 2 < params.length) {
          currentBg = ansi256ToHex(params[i + 2]);
          i += 2;
        } else if (params[i + 1] === 2 && i + 4 < params.length) {
          currentBg = `rgba(${params[i + 2]},${params[i + 3]},${params[i + 4]},0.2)`;
          i += 4;
        }
      }
    }
  }

  // Remaining text
  if (lastIndex < cleaned.length) {
    const text = cleaned.slice(lastIndex);
    if (text) {
      segments.push({ text, color: currentColor, bgColor: currentBg, bold, italic, underline, dim });
    }
  }

  return segments;
}

/**
 * Check if text contains ANSI escape codes.
 */
export function hasAnsiCodes(text: string): boolean {
  return text.includes('\x1b');
}

// Simple 256-color approximation (first 16 use the standard palette)
function ansi256ToHex(n: number): string {
  if (n < 8) return ANSI_COLORS[30 + n] ?? '#E5E7EB';
  if (n < 16) return ANSI_COLORS[90 + (n - 8)] ?? '#E5E7EB';
  if (n >= 232) {
    // Grayscale
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  // 216-color cube
  const idx = n - 16;
  const r = Math.floor(idx / 36);
  const g = Math.floor((idx % 36) / 6);
  const b = idx % 6;
  const toVal = (c: number) => c === 0 ? 0 : 55 + c * 40;
  return `rgb(${toVal(r)},${toVal(g)},${toVal(b)})`;
}
