#!/usr/bin/env python3
"""Patch settings.tsx to add @team member settings section."""

path = "/home/ubuntu/ghosty-terminal/app/(tabs)/settings.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Insert @team section just before the Obsidian section
marker = '        {/* \u2500\u2500 Obsidian \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}\n        <SectionHeader title="Obsidian"'

team_section = '''        {/* \u2500\u2500 @team \u9996\u8133\u4f1a\u8ac7 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <SectionHeader title="@team \u9996\u8133\u4f1a\u8ac7" subtitle="\u8907\u6570AI\u306b\u540c\u3058\u8cea\u554f\u3092\u6295\u3052\u3066\u30ed\u30fc\u30ab\u30ebLLM\u304c\u7d50\u679c\u3092\u7d71\u5408" />
        <View style={styles.settingRow}>
          <View style={{ gap: 12 }}>
            {([
              { key: 'claude', label: 'Claude CLI', desc: 'Claude Pro/Max\u30d7\u30e9\u30f3\u5fc5\u9808', color: '#F59E0B' },
              { key: 'gemini', label: 'Gemini CLI', desc: 'Gemini Advanced\u63a8\u5968', color: '#3B82F6' },
              { key: 'codex', label: 'Codex CLI', desc: 'ChatGPT Plus/Pro\u5fc5\u9808', color: '#10B981' },
              { key: 'perplexity', label: 'Perplexity API', desc: '\u6700\u65b0\u60c5\u5831\u30fb\u30bd\u30fc\u30b9\u4ed8\u304d\u56de\u7b54', color: '#20B2AA' },
              { key: 'local', label: 'Local LLM (\u30d5\u30a1\u30b7\u30ea)', desc: '\u8d77\u52d5\u4e2d\u306e\u5834\u5408\u81ea\u52d5\u3067\u30d5\u30a1\u30b7\u30ea\u5f79', color: '#8B5CF6' },
            ] as const).map(({ key, label, desc, color }) => {
              const members = settings.teamMembers ?? { claude: true, gemini: true, codex: false, perplexity: true, local: true };
              const isOn = members[key] ?? false;
              return (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingLabel, { color }]}>{label}</Text>
                    <Text style={styles.wsUrlHint}>{desc}</Text>
                  </View>
                  <Switch
                    value={isOn}
                    onValueChange={(v) => updateSettings({ teamMembers: { ...members, [key]: v } })}
                    trackColor={{ false: '#374151', true: color + '80' }}
                    thumbColor={isOn ? color : '#6B7280'}
                  />
                </View>
              );
            })}
          </View>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Codex CLI\u30b3\u30de\u30f3\u30c9\u540d</Text>
          <View style={styles.wsUrlInputRow}>
            <TextInput
              style={styles.wsUrlInput}
              value={settings.codexCmd ?? 'codex'}
              onChangeText={(v) => updateSettings({ codexCmd: v.trim() || 'codex' })}
              placeholder="codex"
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />
          </View>
          <Text style={styles.wsUrlHint}>Termux\u3067\u306e codex \u30b3\u30de\u30f3\u30c9\u540d\uff08\u901a\u5e38\u306f "codex" \u306e\u307e\u307e\uff09</Text>
        </View>
        {/* \u2500\u2500 Obsidian \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <SectionHeader title="Obsidian"'''

if marker in content:
    new_content = content.replace(marker, team_section)
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("SUCCESS: @team settings section inserted")
else:
    print("ERROR: marker not found")
    idx = content.find("Obsidian")
    print(f"'Obsidian' found at index: {idx}")
    print(repr(content[max(0,idx-100):idx+50]))
