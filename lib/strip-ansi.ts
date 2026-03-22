/**
 * lib/strip-ansi.ts — ANSIエスケープコードをプレーンテキストに変換
 */

// CSI sequences (colors, cursor movement, etc.)
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;

/**
 * Strip ANSI escape codes from terminal output.
 * Handles CSI (colors, cursor), OSC (title), and simple escape sequences.
 */
export function stripAnsi(text: string): string {
  return text
    .replace(ANSI_REGEX, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')  // OSC sequences (title etc.)
    .replace(/\u001b[^[]\S/g, '');               // Simple escape sequences
}
