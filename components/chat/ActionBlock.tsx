/**
 * components/chat/ActionBlock.tsx — 実行可能コマンドブロック
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/hooks/use-theme';
import { checkCommandSafety, needsConfirmation } from '@/lib/command-safety';
import { useTranslation } from '@/lib/i18n';

interface ActionBlockProps {
  code: string;
  language?: string;
  isWide: boolean;
  onExecuteInTerminal?: (command: string) => void;
  onExecuteInBackground?: (command: string) => Promise<{ stdout: string; exitCode: number | null }>;
}

export function ActionBlock({ code, language, isWide, onExecuteInTerminal, onExecuteInBackground }: ActionBlockProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ output: string; exitCode: number | null } | null>(null);

  const isExecutable = !language || ['bash', 'sh', 'shell', 'zsh', ''].includes(language);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const executeCommand = useCallback(async () => {
    setExecuting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isWide && onExecuteInTerminal) {
      onExecuteInTerminal(code + '\n');
      setExecuting(false);
    } else if (onExecuteInBackground) {
      try {
        const res = await onExecuteInBackground(code);
        setResult({ output: res.stdout, exitCode: res.exitCode });
      } catch (err) {
        setResult({ output: String(err), exitCode: 1 });
      }
      setExecuting(false);
    }
  }, [code, isWide, onExecuteInTerminal, onExecuteInBackground]);

  const handleExecute = useCallback(async () => {
    if (!isExecutable || executing) return;

    const safety = checkCommandSafety(code);
    if (needsConfirmation(safety)) {
      Alert.alert(
        t('action.safety_title'),
        `${safety.message}\n\n$ ${code}`,
        [
          { text: t('chat.cancel'), style: 'cancel' },
          {
            text: t('action.execute_anyway'),
            style: 'destructive',
            onPress: () => executeCommand(),
          },
        ],
      );
      return;
    }

    executeCommand();
  }, [code, isExecutable, executing, executeCommand, t]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface ?? '#111', borderLeftColor: colors.accent }]}>
      {language ? (
        <Text style={[styles.langLabel, { color: colors.muted }]}>{language}</Text>
      ) : null}

      <Text style={[styles.code, { color: '#E8E8E8' }]} selectable>
        {code}
      </Text>

      <View style={styles.actions}>
        {isExecutable && (onExecuteInTerminal || onExecuteInBackground) && (
          <TouchableOpacity
            onPress={handleExecute}
            style={[styles.actionBtn, { opacity: executing ? 0.5 : 1 }]}
            disabled={executing}
          >
            <MaterialIcons name="play-arrow" size={14} color={colors.accent} />
            <Text style={[styles.actionText, { color: colors.accent }]}>
              {executing ? t('action.executing') : t('action.execute')}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleCopy} style={styles.actionBtn}>
          <MaterialIcons name={copied ? 'check' : 'content-copy'} size={14} color={copied ? '#4ADE80' : colors.muted} />
          <Text style={[styles.actionText, { color: copied ? '#4ADE80' : colors.muted }]}>
            {copied ? t('ai.copied') : t('ai.copy')}
          </Text>
        </TouchableOpacity>
      </View>

      {result && (
        <View style={[styles.resultContainer, { borderTopColor: colors.border }]}>
          <View style={styles.resultHeader}>
            <MaterialIcons
              name={result.exitCode === 0 ? 'check-circle' : 'error'}
              size={12}
              color={result.exitCode === 0 ? '#4ADE80' : '#F87171'}
            />
            <Text style={[styles.resultLabel, { color: result.exitCode === 0 ? '#4ADE80' : '#F87171' }]}>
              exit {result.exitCode ?? '?'}
            </Text>
          </View>
          {result.output ? (
            <Text style={[styles.resultText, { color: colors.muted }]} numberOfLines={10}>
              {result.output.slice(0, 500)}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 2,
    borderRadius: 6,
    padding: 10,
    marginVertical: 4,
  },
  langLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  code: {
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  resultContainer: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 8,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  resultLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  resultText: {
    fontSize: 11,
    lineHeight: 16,
  },
});
