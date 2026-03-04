#!/usr/bin/env python3
"""Patch index.tsx to add @team roundtable handling."""
import re

path = "/home/ubuntu/ghosty-terminal/app/(tabs)/index.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Find the insertion point: just before "} else if (target === 'claude') {"
marker = "    } else if (target === 'claude') {\n      // Claude CLI — build command and send to Termux"

team_block = r"""    } else if (target === 'team') {
      // @team 首脳会談 — 複数AI並列呼び出し + ファシリサマリー
      const { runRoundtable } = await import('@/lib/team-roundtable');
      const teamMembers = settings.teamMembers ?? { claude: true, gemini: true, codex: false, perplexity: true, local: true };
      const members: Array<{ id: 'claude' | 'gemini' | 'codex' | 'perplexity' | 'local'; mode: 'cli' | 'api' | 'local'; label: string; color: string }> = [
        ...(teamMembers.claude ? [{ id: 'claude' as const, mode: 'cli' as const, label: 'Claude', color: '#F59E0B' }] : []),
        ...(teamMembers.gemini ? [{ id: 'gemini' as const, mode: 'cli' as const, label: 'Gemini', color: '#3B82F6' }] : []),
        ...(teamMembers.codex ? [{ id: 'codex' as const, mode: 'cli' as const, label: 'Codex', color: '#10B981' }] : []),
        ...(teamMembers.perplexity && settings.perplexityApiKey ? [{ id: 'perplexity' as const, mode: 'api' as const, label: 'Perplexity', color: '#20B2AA' }] : []),
        ...(teamMembers.local && settings.localLlmEnabled ? [{ id: 'local' as const, mode: 'local' as const, label: 'Local LLM', color: '#8B5CF6' }] : []),
      ];
      if (members.length === 0) {
        updateAiBlock(blockId, {
          response: '@team に参加できるエージェントがいません。\n設定画面 → @team メンバー設定でエージェントを有効化してください。',
          isStreaming: false,
          logSummary: '[@team] メンバー未設定',
        });
        return;
      }
      const memberNames = members.map(m => m.label).join(' / ');
      let teamAccumulated = `[team] ${memberNames} に質問中...\n\n`;
      updateAiBlock(blockId, {
        isStreaming: true,
        streamingText: teamAccumulated,
        tokenCount: 0,
        streamingStartTime: Date.now(),
        logSummary: `[@team] ${parsed.prompt.slice(0, 50)}${parsed.prompt.length > 50 ? '...' : ''}`,
      });
      try {
        const result = await runRoundtable(parsed.prompt, {
          teamSettings: {
            claudeCmd: 'claude',
            geminiCmd: 'gemini',
            codexCmd: settings.codexCmd ?? 'codex',
            members,
          },
          facilitatorPriority: settings.teamFacilitatorPriority ?? ['local', 'claude', 'gemini', 'codex', 'perplexity'],
          perplexityApiKey: settings.perplexityApiKey,
          perplexityModel: settings.perplexityModel,
          localLlmUrl: settings.localLlmUrl,
          localLlmModel: settings.localLlmModel,
          runCommand: (cmd: string) => new Promise((resolve) => {
            if (connectionMode === 'termux') {
              sendCommand(cmd);
              setTimeout(() => resolve('(CLI実行中 - Termux出力を確認してください)'), 3000);
            } else {
              resolve(`[Disconnected] 実行コマンド: ${cmd}`);
            }
          }),
          onMemberResult: (_memberId, label, _color, response) => {
            teamAccumulated += `\n\n--- ${label} ---\n${response}`;
            updateAiBlock(blockId, { streamingText: teamAccumulated });
          },
          onChunk: (chunk) => {
            teamAccumulated += chunk;
            updateAiBlock(blockId, { streamingText: teamAccumulated });
          },
        });
        const facilitatorSection = `\n\n=== ファシリサマリー (${result.facilitatorId}) ===\n${result.facilitatorSummary}`;
        const finalText = teamAccumulated + facilitatorSection;
        updateAiBlock(blockId, {
          response: finalText,
          streamingText: undefined,
          isStreaming: false,
          tokenCount: Math.round(finalText.length / 4),
          logSummary: `[@team] 首脳会談完了 (${result.memberResults.length}名参加)`,
        });
      } catch (err) {
        updateAiBlock(blockId, {
          response: `@teamエラー: ${err instanceof Error ? err.message : String(err)}`,
          isStreaming: false,
          logSummary: '[@team] エラー',
        });
      }
    } else if (target === 'claude') {
      // Claude CLI — build command and send to Termux"""

if marker in content:
    new_content = content.replace(marker, team_block)
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("SUCCESS: @team block inserted")
else:
    print("ERROR: marker not found")
    # Show context around 'claude'
    idx = content.find("} else if (target === 'claude')")
    print(f"Found claude at index: {idx}")
    print(repr(content[max(0,idx-50):idx+80]))
