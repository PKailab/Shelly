import { Share } from 'react-native';
import { TabSession } from '@/store/types';

export async function exportSessionLog(sessions: TabSession[]): Promise<void> {
  const lines: string[] = [
    '# Ghosty Terminal Log',
    `# Generated: ${new Date().toLocaleString('ja-JP')}`,
    `# Sessions: ${sessions.length}`,
    '# ════════════════════════════════════════',
    '',
  ];

  for (const session of sessions) {
    if (session.blocks.length === 0) continue;

    lines.push(`## Session: ${session.name}`);
    lines.push(`## Directory: ${session.currentDir}`);
    lines.push('## ────────────────────────────────────────');
    lines.push('');

    for (const block of session.blocks) {
      const ts = new Date(block.timestamp).toLocaleString('ja-JP');
      lines.push(`[${ts}] $ ${block.command}`);
      if (block.output.length > 0) {
        lines.push(...block.output.map((l) => l.text));
      }
      lines.push('');
    }
  }

  const logText = lines.join('\n');

  await Share.share({
    message: logText,
    title: 'Ghosty Terminal Log',
  });
}
