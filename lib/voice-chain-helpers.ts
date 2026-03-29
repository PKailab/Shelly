/**
 * lib/voice-chain-helpers.ts — Helpers for VoiceChain (voice ↔ terminal)
 *
 * Summarizes long terminal output for natural speech reading.
 */

import { useTerminalStore } from '@/store/terminal-store';
import { GEMINI_API_BASE } from '@/lib/gemini';

/**
 * Summarize terminal output for voice reading.
 * Short output (<= 200 chars) is returned as-is.
 * Long output is summarized via AI into 1-2 natural spoken sentences.
 */
export async function summarizeForSpeech(output: string): Promise<string> {
  if (!output.trim()) return 'Done.';
  if (output.length <= 200) return output.trim();

  const settings = useTerminalStore.getState().settings;

  // Try Groq first (fastest)
  const groqKey = settings.groqApiKey;
  if (groqKey && groqKey.trim().length >= 10) {
    try {
      const { groqChatStream } = await import('@/lib/groq');
      let result = '';
      const res = await groqChatStream(
        groqKey,
        `Summarize this terminal output for voice reading. Use natural spoken language. 2 sentences max. If it's in a Japanese context, respond in Japanese:\n\n${output.slice(0, 2000)}`,
        (chunk) => { result += chunk; },
        settings.groqModel || 'llama-3.3-70b-versatile',
        [],
      );
      if (res.success && result) return result;
    } catch {}
  }

  // Fallback: Gemini
  const geminiKey = settings.geminiApiKey;
  if (geminiKey && geminiKey.trim().length >= 10) {
    try {
      const url = `${GEMINI_API_BASE}/models/gemini-2.0-flash:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `Summarize this terminal output for voice reading. Natural spoken language, 2 sentences max. If context is Japanese, respond in Japanese:\n\n${output.slice(0, 2000)}` }],
          }],
          generationConfig: { maxOutputTokens: 256, temperature: 0.3 },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      }
    } catch {}
  }

  // Last resort: first and last 2 lines
  const lines = output.trim().split('\n').filter(Boolean);
  if (lines.length <= 4) return output.trim();
  return `${lines[0]}\n${lines[1]}\n... ${lines.length - 4} lines omitted ...\n${lines[lines.length - 2]}\n${lines[lines.length - 1]}`;
}
