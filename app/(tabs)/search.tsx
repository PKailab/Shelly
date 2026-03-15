import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTerminalStore } from '@/store/terminal-store';
import { useTranslation } from '@/lib/i18n';
import { CommandBlock } from '@/store/types';

function BlockSearchItem({
  block,
  query,
  onCopy,
  onRerun,
}: {
  block: CommandBlock;
  query: string;
  onCopy: (text: string) => void;
  onRerun: (cmd: string) => void;
}) {
  const outputText = block.output.map((l) => l.text).join(' ').slice(0, 80);
  const timestamp = new Date(block.timestamp).toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const highlightText = (text: string, query: string) => {
    if (!query) return <Text style={styles.itemCommand}>{text}</Text>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <Text style={styles.itemCommand}>{text}</Text>;
    return (
      <Text style={styles.itemCommand}>
        {text.slice(0, idx)}
        <Text style={styles.highlight}>{text.slice(idx, idx + query.length)}</Text>
        {text.slice(idx + query.length)}
      </Text>
    );
  };

  return (
    <View style={styles.searchItem}>
      <View style={styles.searchItemHeader}>
        <Text style={styles.itemTimestamp}>{timestamp}</Text>
        <View style={styles.searchItemActions}>
          <Pressable
            onPress={() => onCopy(`$ ${block.command}\n${block.output.map((l) => l.text).join('\n')}`)}
            style={styles.miniBtn}
          >
            <MaterialIcons name="content-copy" size={14} color="#6B7280" />
          </Pressable>
          <Pressable onPress={() => onRerun(block.command)} style={styles.miniBtn}>
            <MaterialIcons name="replay" size={14} color="#00D4AA" />
          </Pressable>
        </View>
      </View>
      <View style={styles.commandRow}>
        <Text style={styles.promptSymbol}>$ </Text>
        {highlightText(block.command, query)}
      </View>
      {outputText ? (
        <Text style={styles.itemOutput} numberOfLines={2}>
          {outputText}
        </Text>
      ) : null}
    </View>
  );
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { sessions, runCommand, settings } = useTerminalStore();
  const insets = useSafeAreaInsets();

  // Collect all blocks from all sessions
  const allBlocks = useMemo(() => {
    return sessions
      .flatMap((s) => s.blocks)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [sessions]);

  const filteredBlocks = useMemo(() => {
    if (!query.trim()) return allBlocks;
    const q = query.toLowerCase();
    return allBlocks.filter(
      (b) =>
        b.command.toLowerCase().includes(q) ||
        b.output.some((l) => l.text.toLowerCase().includes(q))
    );
  }, [allBlocks, query]);

  const handleCopy = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    if (settings.hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [settings.hapticFeedback]);

  const handleRerun = useCallback((cmd: string) => {
    if (settings.hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    runCommand(cmd);
  }, [runCommand, settings.hapticFeedback]);

  const renderItem = useCallback(({ item }: { item: CommandBlock }) => (
    <BlockSearchItem
      block={item}
      query={query}
      onCopy={handleCopy}
      onRerun={handleRerun}
    />
  ), [query, handleCopy, handleRerun]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#111111" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('search.title')}</Text>
        <Text style={styles.headerCount}>{t('search.items', { count: filteredBlocks.length })}</Text>
      </View>

      {/* Search input */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={18} color="#6B7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor="#4B5563"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} style={styles.clearBtn}>
            <MaterialIcons name="close" size={16} color="#6B7280" />
          </Pressable>
        )}
      </View>

      {/* Results */}
      {filteredBlocks.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="search-off" size={48} color="#2D2D2D" />
          <Text style={styles.emptyText}>
            {allBlocks.length === 0
              ? t('search.no_commands')
              : t('search.no_results')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredBlocks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  headerTitle: {
    color: '#E8E8E8',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  headerCount: {
    color: '#6B7280',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    color: '#E8E8E8',
    fontSize: 14,
    fontFamily: 'monospace',
    paddingVertical: 10,
  },
  clearBtn: {
    padding: 4,
  },
  listContent: {
    paddingBottom: 20,
  },
  searchItem: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 10,
  },
  searchItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTimestamp: {
    color: '#4B5563',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  searchItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  miniBtn: {
    padding: 4,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  promptSymbol: {
    color: '#00D4AA',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
  },
  itemCommand: {
    color: '#93C5FD',
    fontFamily: 'monospace',
    fontSize: 13,
    flex: 1,
    flexWrap: 'wrap',
  },
  highlight: {
    backgroundColor: '#00D4AA30',
    color: '#00D4AA',
  },
  itemOutput: {
    color: '#6B7280',
    fontFamily: 'monospace',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 14,
    fontFamily: 'monospace',
  },
});
