/**
 * components/ProjectTimeline.tsx
 *
 * セーブポイントタイムライン — プロジェクトカード内アコーディオン展開。
 * git log からコミット履歴を取得し、ゲームのセーブデータ一覧として表示。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import {
  getTimeline,
  checkoutSavepoint,
  getDiffFromSavepoint,
  type TimelineEntry,
} from '@/lib/auto-savepoint';
import { DiffViewerModal } from '@/components/DiffViewerModal';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';
import { useTranslation } from '@/lib/i18n';

type RunCommandFn = (cmd: string) => Promise<{ stdout: string; exitCode: number }>;

type Props = {
  projectPath: string;
  runCommand: RunCommandFn;
};

const INITIAL_SHOW = 5;

export function ProjectTimeline({ projectPath, runCommand }: Props) {
  const { colors: c } = useTheme();
  const { t } = useTranslation();

  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [diffText, setDiffText] = useState('');
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTimeline(projectPath, runCommand, 20).then((result) => {
      if (!cancelled) {
        setEntries(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [projectPath, runCommand]);

  const displayEntries = showAll ? entries : entries.slice(0, INITIAL_SHOW);
  const hasMore = entries.length > INITIAL_SHOW && !showAll;

  const handleEntryPress = useCallback((entry: TimelineEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t('timeline.action_title'),
      formatMessage(entry.message),
      [
        {
          text: t('timeline.view_diff'),
          onPress: async () => {
            const diff = await getDiffFromSavepoint(projectPath, entry.hash, runCommand);
            if (diff) {
              setDiffText(diff);
              setShowDiff(true);
            }
          },
        },
        {
          text: t('timeline.revert'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('timeline.revert'),
              t('timeline.revert_confirm'),
              [
                { text: t('projects.cancel'), style: 'cancel' },
                {
                  text: t('timeline.revert'),
                  style: 'destructive',
                  onPress: async () => {
                    const ok = await checkoutSavepoint(projectPath, entry.hash, runCommand);
                    Haptics.notificationAsync(
                      ok
                        ? Haptics.NotificationFeedbackType.Success
                        : Haptics.NotificationFeedbackType.Error,
                    );
                    Alert.alert(ok ? t('timeline.revert_success') : t('timeline.revert_fail'));
                  },
                },
              ],
            );
          },
        },
        { text: t('projects.cancel'), style: 'cancel' },
      ],
    );
  }, [projectPath, runCommand, t]);

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={c.accent} />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.emptyRow}>
        <Text style={[styles.emptyText, { color: c.inactive }]}>
          {t('timeline.empty')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderTopColor: c.border }]}>
      {/* Timeline line */}
      <View style={[styles.timelineLine, { backgroundColor: withAlpha(c.accent, 0.3) }]} />

      {displayEntries.map((entry, i) => (
        <TouchableOpacity
          key={entry.hash}
          style={styles.entryRow}
          onPress={() => handleEntryPress(entry)}
          activeOpacity={0.7}
        >
          {/* Dot */}
          <View style={[
            styles.dot,
            {
              backgroundColor: i === 0 ? c.accent : withAlpha(c.accent, 0.4),
              borderColor: i === 0 ? c.accent : withAlpha(c.accent, 0.2),
            },
          ]} />
          {/* Content */}
          <View style={styles.entryContent}>
            <Text style={[styles.entryMessage, { color: c.foreground }]} numberOfLines={1}>
              {formatMessage(entry.message)}
            </Text>
            <Text style={[styles.entryTime, { color: c.inactive }]}>
              {entry.relativeTime}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={14} color={c.inactive} />
        </TouchableOpacity>
      ))}

      {hasMore && (
        <TouchableOpacity
          style={styles.showMoreRow}
          onPress={() => setShowAll(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.showMoreText, { color: c.accent }]}>
            {t('timeline.show_more')} ({entries.length - INITIAL_SHOW})
          </Text>
        </TouchableOpacity>
      )}

      <DiffViewerModal
        visible={showDiff}
        diff={diffText}
        onClose={() => setShowDiff(false)}
      />
    </View>
  );
}

/** Strip "Auto: " prefix from commit messages for user display */
function formatMessage(message: string): string {
  return message.replace(/^Auto:\s*/i, '');
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 23,
    top: 16,
    bottom: 8,
    width: 2,
    borderRadius: 1,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 4,
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    zIndex: 1,
  },
  entryContent: {
    flex: 1,
  },
  entryMessage: {
    fontSize: 12,
    fontWeight: '500',
  },
  entryTime: {
    fontSize: 10,
    marginTop: 1,
  },
  showMoreRow: {
    paddingVertical: 6,
    paddingLeft: 22,
  },
  showMoreText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loadingRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyRow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#2D2D2D',
  },
  emptyText: {
    fontSize: 11,
    textAlign: 'center',
  },
});
