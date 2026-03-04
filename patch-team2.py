#!/usr/bin/env python3
"""Patch index.tsx @team block to match runTeamRoundtable signature."""

path = "/home/ubuntu/ghosty-terminal/app/(tabs)/index.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Find and replace the entire @team block
old_block = """    } else if (target === 'team') {
      // @team \u9996\u8133\u4f1a\u8ac7 \u2014 \u8907\u6570AI\u4e26\u5217\u547c\u3073\u51fa\u3057 + \u30d5\u30a1\u30b7\u30ea\u30b5\u30de\u30ea\u30fc
      const { runTeamRoundtable } = await import('@/lib/team-roundtable');
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
          response: '@team \u306b\u53c2\u52a0\u3067\u304d\u308b\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u304c\u3044\u307e\u305b\u3093\u3002\\n\u8a2d\u5b9a\u753b\u9762 \u2192 @team \u30e1\u30f3\u30d0\u30fc\u8a2d\u5b9a\u3067\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u3092\u6709\u52b9\u5316\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
          isStreaming: false,
          logSummary: '[@team] \u30e1\u30f3\u30d0\u30fc\u672a\u8a2d\u5b9a',
        });
        return;
      }
      const memberNames = members.map(m => m.label).join(' / ');
      let teamAccumulated = `[team] ${memberNames} \u306b\u8cea\u554f\u4e2d...\\n\\n`;
      updateAiBlock(blockId, {
        isStreaming: true,
        streamingText: teamAccumulated,
        tokenCount: 0,
        streamingStartTime: Date.now(),
        logSummary: `[@team] ${parsed.prompt.slice(0, 50)}${parsed.prompt.length > 50 ? '...' : ''}`,
      });
      try {
        const result = await runTeamRoundtable(parsed.prompt, {
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
              setTimeout(() => resolve('(CLI\u5b9f\u884c\u4e2d - Termux\u51fa\u529b\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044)'), 3000);
            } else {
              resolve(`[Disconnected] \u5b9f\u884c\u30b3\u30de\u30f3\u30c9: ${cmd}`);
            }
          }),
          onMemberResult: (_memberId: string, label: string, _color: string, response: string) => {
            teamAccumulated += `\\n\\n--- ${label} ---\\n${response}`;
            updateAiBlock(blockId, { streamingText: teamAccumulated });
          },
          onChunk: (chunk: string) => {
            teamAccumulated += chunk;
            updateAiBlock(blockId, { streamingText: teamAccumulated });
          },
        });
        const facilitatorSection = `\\n\\n=== \u30d5\u30a1\u30b7\u30ea\u30b5\u30de\u30ea\u30fc (${result.facilitatorId}) ===\\n${result.facilitatorSummary}`;
        const finalText = teamAccumulated + facilitatorSection;
        updateAiBlock(blockId, {
          response: finalText,
          streamingText: undefined,
          isStreaming: false,
          tokenCount: Math.round(finalText.length / 4),
          logSummary: `[@team] \u9996\u8133\u4f1a\u8ac7\u5b8c\u4e86 (${result.memberResults.length}\u540d\u53c2\u52a0)`,
        });
      } catch (err) {
        updateAiBlock(blockId, {
          response: `@team\u30a8\u30e9\u30fc: ${err instanceof Error ? err.message : String(err)}`,
          isStreaming: false,
          logSummary: '[@team] \u30a8\u30e9\u30fc',
        });
      }"""

new_block = """    } else if (target === 'team') {
      // @team \u9996\u8133\u4f1a\u8ac7 \u2014 \u8907\u6570AI\u4e26\u5217\u547c\u3073\u51fa\u3057 + \u30d5\u30a1\u30b7\u30ea\u30b5\u30de\u30ea\u30fc
      const { runTeamRoundtable } = await import('@/lib/team-roundtable');
      const teamMembers = settings.teamMembers ?? { claude: true, gemini: true, codex: false, perplexity: true, local: true };
      const teamSettingsObj = {
        claudeEnabled: teamMembers.claude,
        geminiEnabled: teamMembers.gemini,
        codexEnabled: teamMembers.codex,
        perplexityEnabled: teamMembers.perplexity && !!settings.perplexityApiKey,
        localEnabled: teamMembers.local && settings.localLlmEnabled,
        facilitatorPriority: settings.teamFacilitatorPriority ?? ['local', 'claude', 'gemini', 'codex', 'perplexity'],
        codexCmd: settings.codexCmd ?? 'codex',
        claudeCmd: 'claude',
        geminiCmd: 'gemini',
      };
      const enabledCount = [teamSettingsObj.claudeEnabled, teamSettingsObj.geminiEnabled, teamSettingsObj.codexEnabled, teamSettingsObj.perplexityEnabled, teamSettingsObj.localEnabled].filter(Boolean).length;
      if (enabledCount === 0) {
        updateAiBlock(blockId, {
          response: '@team \u306b\u53c2\u52a0\u3067\u304d\u308b\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u304c\u3044\u307e\u305b\u3093\u3002\\n\u8a2d\u5b9a\u753b\u9762 \u2192 @team \u30e1\u30f3\u30d0\u30fc\u8a2d\u5b9a\u3067\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u3092\u6709\u52b9\u5316\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
          isStreaming: false,
          logSummary: '[@team] \u30e1\u30f3\u30d0\u30fc\u672a\u8a2d\u5b9a',
        });
        return;
      }
      let teamAccumulated = `[@team] ${enabledCount}\u540d\u306e\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306b\u8cea\u554f\u4e2d...\\n\\n`;
      updateAiBlock(blockId, {
        isStreaming: true,
        streamingText: teamAccumulated,
        tokenCount: 0,
        streamingStartTime: Date.now(),
        logSummary: `[@team] ${parsed.prompt.slice(0, 50)}${parsed.prompt.length > 50 ? '...' : ''}`,
      });
      try {
        const result = await runTeamRoundtable(
          parsed.prompt,
          teamSettingsObj,
          {
            runCommand: (cmd: string) => new Promise((resolve) => {
              if (connectionMode === 'termux') {
                sendCommand(cmd);
                setTimeout(() => resolve('(CLI\u5b9f\u884c\u4e2d - Termux\u51fa\u529b\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044)'), 3000);
              } else {
                resolve(`[Disconnected] \u5b9f\u884c\u30b3\u30de\u30f3\u30c9: ${cmd}`);
              }
            }),
            perplexityApiKey: settings.perplexityApiKey,
            perplexityModel: settings.perplexityModel,
            geminiApiKey: settings.geminiApiKey,
            geminiModel: settings.geminiModel,
            localLlmUrl: settings.localLlmUrl,
            localLlmModel: settings.localLlmModel,
            onMemberResult: (memberResult) => {
              teamAccumulated += `\\n\\n--- ${memberResult.label} ---\\n${memberResult.response}`;
              updateAiBlock(blockId, { streamingText: teamAccumulated });
            },
            onFacilitatorChunk: (chunk: string) => {
              teamAccumulated += chunk;
              updateAiBlock(blockId, { streamingText: teamAccumulated });
            },
          },
        );
        const facilitatorLabel = result.facilitator?.label ?? '\u30d5\u30a1\u30b7\u30ea';
        const finalText = teamAccumulated + `\\n\\n=== \u30d5\u30a1\u30b7\u30ea\u30b5\u30de\u30ea\u30fc (${facilitatorLabel}) ===\\n${result.facilitatorSummary}`;
        updateAiBlock(blockId, {
          response: finalText,
          streamingText: undefined,
          isStreaming: false,
          tokenCount: Math.round(finalText.length / 4),
          logSummary: `[@team] \u9996\u8133\u4f1a\u8ac7\u5b8c\u4e86 (${result.members.length}\u540d\u53c2\u52a0)`,
        });
      } catch (err) {
        updateAiBlock(blockId, {
          response: `@team\u30a8\u30e9\u30fc: ${err instanceof Error ? err.message : String(err)}`,
          isStreaming: false,
          logSummary: '[@team] \u30a8\u30e9\u30fc',
        });
      }"""

if old_block in content:
    new_content = content.replace(old_block, new_block)
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("SUCCESS: @team block updated with correct signature")
else:
    print("ERROR: old_block not found")
    # debug: find the team block
    idx = content.find("} else if (target === 'team')")
    if idx >= 0:
        print("Found team block at:", idx)
        print(repr(content[idx:idx+200]))
    else:
        print("team block not found at all")
