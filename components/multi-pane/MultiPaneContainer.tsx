import React from 'react';
import { View, Pressable, Text, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMultiPaneStore } from '@/hooks/use-multi-pane';
import { PaneSlot } from './PaneSlot';

const ACCENT = '#00D4AA';

export function MultiPaneContainer() {
  const insets = useSafeAreaInsets();
  const { panes, maxPanes, setPane, addPane, removePane } = useMultiPaneStore();

  const canAdd = panes.length < maxPanes;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.panesRow}>
        {panes.map((tab, i) => (
          <PaneSlot
            key={`${i}-${tab}`}
            tab={tab}
            index={i}
            onChangeTab={setPane}
            onRemove={removePane}
          />
        ))}
        {canAdd && (
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              // Pick a tab not already shown, default to 'snippets'
              const used = new Set(panes);
              const available = (
                ['snippets', 'creator', 'browser', 'obsidian', 'search', 'settings', 'index', 'tty'] as const
              ).find((t) => !used.has(t));
              addPane(available ?? 'snippets');
            }}
          >
            <MaterialIcons name="add" size={28} color={ACCENT} />
            <Text style={styles.addLabel}>Add</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0A',
    zIndex: 50,
  },
  panesRow: {
    flex: 1,
    flexDirection: 'row',
  },
  addBtn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    borderLeftWidth: 1,
    borderLeftColor: '#1E1E1E',
  },
  addLabel: {
    color: ACCENT,
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 2,
  },
});
