/**
 * components/chat/AutoCheckProposalBubble.tsx
 *
 * Proactive proposal after first push to GitHub:
 * "Want to auto-check your code every time you save?"
 * [Turn on]  [Maybe later]
 *
 * No CI/build/workflow jargon — uses natural language only.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';
import { useTranslation } from '@/lib/i18n';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProposalState = 'proposal' | 'setting_up' | 'done' | 'dismissed' | 'error';

interface Props {
  state: ProposalState;
  error?: string;
  onEnable: () => void;
  onDismiss: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AutoCheckProposalBubble({ state, error, onEnable, onDismiss }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const accentColor = '#4ADE80'; // Green — positive, inviting

  // ── Done state ──
  if (state === 'done') {
    return (
      <View style={[styles.container, { backgroundColor: withAlpha(accentColor, 0.06), borderColor: withAlpha(accentColor, 0.2) }]}>
        <View style={styles.iconRow}>
          <MaterialIcons name="check-circle" size={20} color={accentColor} />
          <Text style={[styles.doneText, { color: colors.foregroundDim }]}>
            {t('autocheck.done')}
          </Text>
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (state === 'error') {
    return (
      <View style={[styles.container, { backgroundColor: withAlpha('#F87171', 0.06), borderColor: withAlpha('#F87171', 0.2) }]}>
        <View style={styles.iconRow}>
          <MaterialIcons name="error-outline" size={20} color="#F87171" />
          <Text style={[styles.doneText, { color: colors.foregroundDim }]}>
            {t('autocheck.error', { error: error || 'Unknown' })}
          </Text>
        </View>
      </View>
    );
  }

  // ── Setting up (loading) ──
  if (state === 'setting_up') {
    return (
      <View style={[styles.container, { backgroundColor: withAlpha(accentColor, 0.06), borderColor: withAlpha(accentColor, 0.2) }]}>
        <View style={styles.iconRow}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={[styles.bodyText, { color: colors.foregroundDim }]}>
            {t('autocheck.setting_up')}
          </Text>
        </View>
      </View>
    );
  }

  // ── Dismissed ──
  if (state === 'dismissed') {
    return null;
  }

  // ── Proposal (default) ──
  return (
    <View style={[styles.container, { backgroundColor: withAlpha(accentColor, 0.06), borderColor: withAlpha(accentColor, 0.2) }]}>
      {/* Title */}
      <View style={styles.titleRow}>
        <MaterialIcons name="verified" size={18} color={accentColor} />
        <Text style={[styles.titleText, { color: colors.foreground }]}>
          {t('autocheck.proposal_title')}
        </Text>
      </View>

      {/* Body */}
      <Text style={[styles.bodyText, { color: colors.foregroundDim }]}>
        {t('autocheck.proposal_body')}
      </Text>

      {/* Buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.laterBtn, { borderColor: withAlpha(colors.inactive, 0.3) }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDismiss();
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.laterText, { color: colors.inactive }]}>
            {t('autocheck.btn_later')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.enableBtn, { backgroundColor: accentColor }]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onEnable();
          }}
          activeOpacity={0.7}
        >
          <MaterialIcons name="bolt" size={14} color="#000" />
          <Text style={styles.enableText}>
            {t('autocheck.btn_enable')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginVertical: 4,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  enableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  enableText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  laterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  laterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doneText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
});
