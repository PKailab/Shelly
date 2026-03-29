/**
 * components/chat/ErrorSummaryBubble.tsx
 *
 * エラー要約バブル — TranslateOverlay（10秒で消える）をWide時にChat永続バブルに昇格。
 * [修正を提案] → AI dispatch、[@teamに聞く] → @team dispatch。
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';

export type ErrorSummaryData = {
  errorText: string;
  translation: string;
  provider: string;
};

type Props = {
  data: ErrorSummaryData;
  onSuggestFix?: (context: string) => void;
  onAskTeam?: (context: string) => void;
};

export const ErrorSummaryBubble = memo(function ErrorSummaryBubble({ data, onSuggestFix, onAskTeam }: Props) {
  const { colors } = useTheme();

  const handleSuggestFix = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSuggestFix?.(`エラー修正を提案: ${data.errorText}\n翻訳: ${data.translation}`);
  };

  const handleAskTeam = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAskTeam?.(`エラーについて相談: ${data.errorText}\n翻訳: ${data.translation}`);
  };

  return (
    <Animated.View entering={FadeInDown.duration(200).springify().damping(18)}>
      <View style={[styles.container, { backgroundColor: colors.surfaceHigh, borderColor: withAlpha('#EF4444', 0.3) }]}>
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="error-outline" size={16} color="#EF4444" />
          <Text style={[styles.headerText, { color: colors.foreground }]}>
            エラーを検出しました
          </Text>
          <Text style={[styles.providerLabel, { color: colors.muted }]}>
            {data.provider}
          </Text>
        </View>

        {/* Translation */}
        <Text style={[styles.translation, { color: colors.foregroundDim }]}>
          {data.translation}
        </Text>

        {/* Original error (collapsed) */}
        <Text
          style={[styles.errorText, { color: colors.muted, backgroundColor: withAlpha(colors.foreground, 0.05) }]}
          numberOfLines={3}
        >
          {data.errorText}
        </Text>

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          {onSuggestFix && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: withAlpha(colors.accent, 0.15) }]}
              onPress={handleSuggestFix}
              activeOpacity={0.7}
            >
              <MaterialIcons name="auto-fix-high" size={14} color={colors.accent} />
              <Text style={[styles.buttonText, { color: colors.accent }]}>修正を提案</Text>
            </TouchableOpacity>
          )}

          {onAskTeam && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: withAlpha('#EC4899', 0.15) }]}
              onPress={handleAskTeam}
              activeOpacity={0.7}
            >
              <MaterialIcons name="group" size={14} color="#EC4899" />
              <Text style={[styles.buttonText, { color: '#EC4899' }]}>@teamに聞く</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
    flex: 1,
  },
  providerLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  translation: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 19,
  },
  errorText: {
    fontSize: 11,
    fontFamily: 'monospace',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});
