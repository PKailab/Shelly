import React, { useState, useMemo, createContext } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PANE_REGISTRY } from './pane-registry';
import { PaneSelector } from './PaneSelector';
import type { PaneTab } from '@/hooks/use-multi-pane';

const ACCENT = '#00D4AA';
const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/** Context to let child screens know their pane width */
export const MultiPaneContext = createContext<{ paneWidth: number } | null>(null);

type Props = {
  tab: PaneTab;
  index: number;
  onChangeTab: (index: number, tab: PaneTab) => void;
  onRemove: (index: number) => void;
};

const PaneSlotInner = ({ tab, index, onChangeTab, onRemove }: Props) => {
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [paneWidth, setPaneWidth] = useState(0);
  const entry = PANE_REGISTRY[tab];
  const Component = useMemo(() => entry.getComponent(), [tab]);
  const ctxValue = useMemo(() => ({ paneWidth }), [paneWidth]);

  return (
    <View
      style={[styles.pane, index > 0 && styles.paneBorder]}
      onLayout={(e) => setPaneWidth(e.nativeEvent.layout.width)}
    >
      {/* Pane header */}
      <Pressable
        style={styles.header}
        onPress={() => setSelectorVisible(true)}
      >
        <MaterialIcons name={entry.icon as any} size={14} color={ACCENT} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={16} color="#9BA1A6" />
        <View style={styles.headerSpacer} />
        <Pressable
          style={styles.closeBtn}
          onPress={() => onRemove(index)}
          hitSlop={8}
        >
          <MaterialIcons name="close" size={14} color="#666" />
        </Pressable>
      </Pressable>

      {/* Pane content — override SafeArea to prevent double padding */}
      <View style={styles.content}>
        <SafeAreaInsetsContext.Provider value={ZERO_INSETS}>
          <MultiPaneContext.Provider value={ctxValue}>
            <Component />
          </MultiPaneContext.Provider>
        </SafeAreaInsetsContext.Provider>
      </View>

      {/* Tab selector modal */}
      <PaneSelector
        visible={selectorVisible}
        currentTab={tab}
        onSelect={(newTab) => onChangeTab(index, newTab)}
        onClose={() => setSelectorVisible(false)}
      />
    </View>
  );
};

export const PaneSlot = React.memo(PaneSlotInner);

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  paneBorder: {
    borderLeftWidth: 1,
    borderLeftColor: '#1E1E1E',
  },
  header: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
    gap: 4,
  },
  headerTitle: {
    color: '#ECEDEE',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  headerSpacer: {
    flex: 1,
  },
  closeBtn: {
    padding: 2,
  },
  content: {
    flex: 1,
  },
});
