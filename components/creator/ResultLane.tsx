/**
 * components/creator/ResultLane.tsx
 *
 * The "Result" lane — shows the completed project info and next suggestions.
 * Also provides a "Save as Recipe" button to store in Snippets.
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { CreatorProject, CreatorSessionStatus } from '@/store/types';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  status: CreatorSessionStatus;
  project: CreatorProject | null;
  completionMessage: string;
  onSaveRecipe: () => void;
  onNewProject: () => void;
  onRunInTerminal: () => void;
  onOpenFolder?: () => void;
  recipeSaved: boolean;
  termuxConnected?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ResultLane({
  status,
  project,
  completionMessage,
  onSaveRecipe,
  onNewProject,
  onRunInTerminal,
  onOpenFolder,
  recipeSaved,
  termuxConnected = false,
}: Props) {
  const isDone = status === 'done';
  const isError = status === 'error';
  const isActive = isDone || isError;

  const handleSaveRecipe = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSaveRecipe();
  };

  return (
    <View style={styles.container}>
      {/* Lane header */}
      <View style={styles.laneHeader}>
        <Text style={styles.laneLabel}>RESULT</Text>
        {isDone && <View style={[styles.dot, styles.dotDone]} />}
        {isError && <View style={[styles.dot, styles.dotError]} />}
      </View>

      {/* Idle / building */}
      {!isActive && (
        <Text style={styles.placeholder}>
          完成したら、ここに結果と次のアクションが表示されるよ。
        </Text>
      )}

      {/* Error state */}
      {isError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            うまくいかなかった。もう一度試してみてね。
          </Text>
          <Pressable
            onPress={onNewProject}
            style={({ pressed }) => [styles.newBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.newBtnText}>もう一度</Text>
          </Pressable>
        </View>
      )}

      {/* Done state */}
      {isDone && project && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Completion message */}
          <Text style={styles.completionMsg}>{completionMessage}</Text>

          {/* Project info */}
          <View style={styles.infoBox}>
            <InfoRow label="保存場所" value={`~/${project.path}`} />
            <InfoRow label="ファイル数" value={`${project.files.length} ファイル`} />
            <InfoRow label="種類" value={typeLabel(project.projectType)} />
          </View>

          {/* File list */}
          <View style={styles.fileList}>
            {project.files.map((f) => (
              <View key={f.path} style={styles.fileRow}>
                <Text style={styles.fileIcon}>{langIcon(f.language)}</Text>
                <Text style={styles.filePath}>{f.path}</Text>
              </View>
            ))}
          </View>

          {/* Suggestions */}
          {project.suggestions.length > 0 && (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsLabel}>次にできること</Text>
              {project.suggestions.map((s, i) => (
                <View key={i} style={styles.suggestionRow}>
                  <Text style={styles.suggestionNum}>{i + 1}</Text>
                  <Text style={styles.suggestionText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            {onOpenFolder && (
              <Pressable
                onPress={onOpenFolder}
                style={({ pressed }) => [styles.openBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.openBtnText}>
                  {termuxConnected ? '📂 フォルダを開く' : '📂 保存場所'}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={onRunInTerminal}
              style={({ pressed }) => [styles.runBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.runBtnText}>▶ Terminal で実行</Text>
            </Pressable>

            <Pressable
              onPress={handleSaveRecipe}
              disabled={recipeSaved}
              style={({ pressed }) => [
                styles.recipeBtn,
                recipeSaved && styles.recipeBtnSaved,
                pressed && !recipeSaved && styles.btnPressed,
              ]}
            >
              <Text
                style={[
                  styles.recipeBtnText,
                  recipeSaved && styles.recipeBtnTextSaved,
                ]}
              >
                {recipeSaved ? '★ Recipe保存済み' : '☆ Recipeに保存'}
              </Text>
            </Pressable>

            <Pressable
              onPress={onNewProject}
              style={({ pressed }) => [styles.newBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.newBtnText}>新しく作る</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    web: 'Webアプリ',
    script: 'スクリプト',
    document: 'ドキュメント',
    unknown: 'プロジェクト',
  };
  return map[type] ?? type;
}

function langIcon(lang: string): string {
  const map: Record<string, string> = {
    html: '🌐',
    css: '🎨',
    js: '⚡',
    py: '🐍',
    md: '📝',
    json: '{}',
    ts: '🔷',
  };
  return map[lang] ?? '📄';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0D0D0D',
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  laneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  laneLabel: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: '#4B5563',
    letterSpacing: 1.5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotDone: {
    backgroundColor: '#4ADE80',
  },
  dotError: {
    backgroundColor: '#F87171',
  },
  placeholder: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#374151',
    fontStyle: 'italic',
  },
  errorBox: {
    gap: 10,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#F87171',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 16,
  },
  completionMsg: {
    fontSize: 15,
    color: '#ECEDEE',
    fontWeight: '600',
    lineHeight: 22,
  },
  infoBox: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    borderRadius: 6,
    padding: 10,
    gap: 4,
  },
  fileList: {
    gap: 3,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fileIcon: {
    fontSize: 12,
    width: 18,
  },
  filePath: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6B7280',
  },
  suggestions: {
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    paddingTop: 10,
    gap: 6,
  },
  suggestionsLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#4B5563',
    letterSpacing: 1,
    marginBottom: 2,
  },
  suggestionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  suggestionNum: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#00D4AA',
    width: 14,
  },
  suggestionText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#9BA1A6',
    flex: 1,
  },
  actions: {
    gap: 8,
    marginTop: 4,
  },
  runBtn: {
    backgroundColor: 'rgba(0, 212, 170, 0.08)',
    borderWidth: 1,
    borderColor: '#00D4AA',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  runBtnText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#00D4AA',
    fontWeight: '600',
  },
  recipeBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 6,
    paddingVertical: 7,
    alignItems: 'center',
  },
  recipeBtnSaved: {
    borderColor: '#FBBF24',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
  },
  recipeBtnText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6B7280',
  },
  recipeBtnTextSaved: {
    color: '#FBBF24',
  },
  newBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#272727',
    borderRadius: 6,
    paddingVertical: 7,
    alignItems: 'center',
  },
  newBtnText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6B7280',
  },
  btnPressed: {
    opacity: 0.65,
  },
  openBtn: {
    backgroundColor: 'rgba(96, 165, 250, 0.08)',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 6,
    paddingVertical: 7,
    alignItems: 'center',
  },
  openBtnText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#60A5FA',
    fontWeight: '600',
  },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#4B5563',
    width: 60,
  },
  value: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#9BA1A6',
    flex: 1,
    textAlign: 'right',
  },
});
