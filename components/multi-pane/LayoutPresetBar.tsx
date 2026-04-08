// components/multi-pane/LayoutPresetBar.tsx
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useMultiPaneStore, makeLeaf, makeSplit } from '@/hooks/use-multi-pane';
import type { PaneNode } from '@/hooks/use-multi-pane';

const ACCENT = '#00D4AA';

export type LayoutPreset = {
  id: string;
  label: string;
  build: () => PaneNode;
};

const PRESETS: LayoutPreset[] = [
  {
    id: '1+2',
    label: '1+2 SPLIT',
    build: () =>
      makeSplit('vertical',
        makeSplit('horizontal', makeLeaf('terminal'), makeLeaf('ai')),
        makeSplit('horizontal', makeLeaf('browser'), makeLeaf('terminal')),
        0.55,
      ),
  },
  {
    id: '2col',
    label: '2 COL',
    build: () => makeSplit('horizontal', makeLeaf('terminal'), makeLeaf('ai')),
  },
  {
    id: '2row',
    label: '2 ROW',
    build: () => makeSplit('vertical', makeLeaf('terminal'), makeLeaf('ai')),
  },
  {
    id: 'single',
    label: 'SINGLE',
    build: () => makeLeaf('terminal'),
  },
  {
    id: '2x2',
    label: '2X2 GRID',
    build: () =>
      makeSplit('vertical',
        makeSplit('horizontal', makeLeaf('terminal'), makeLeaf('ai')),
        makeSplit('horizontal', makeLeaf('browser'), makeLeaf('terminal')),
      ),
  },
  {
    id: '4term',
    label: '4 TERMINAL',
    build: () =>
      makeSplit('vertical',
        makeSplit('horizontal', makeLeaf('terminal'), makeLeaf('terminal')),
        makeSplit('horizontal', makeLeaf('terminal'), makeLeaf('terminal')),
      ),
  },
];

/** Derive current preset id from the tree shape */
function detectPreset(root: PaneNode | null): string | null {
  if (!root) return 'single';
  if (root.type === 'leaf') return 'single';
  // Not worth full matching — return null and let none be highlighted
  return null;
}

export function LayoutPresetBar() {
  const { root } = useMultiPaneStore();
  const currentPreset = detectPreset(root);

  const handleSelect = (preset: LayoutPreset) => {
    const newRoot = preset.build();
    useMultiPaneStore.setState({ root: newRoot, isMultiPane: true });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {PRESETS.map((p) => {
          const isActive = currentPreset === p.id;
          return (
            <Pressable
              key={p.id}
              style={[
                styles.presetBtn,
                isActive && styles.presetBtnActive,
              ]}
              onPress={() => handleSelect(p)}
            >
              <Text
                style={[
                  styles.presetLabel,
                  isActive && styles.presetLabelActive,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 34,
    backgroundColor: '#0D0D0D',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    justifyContent: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 6,
    flexGrow: 1,
  },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#111',
  },
  presetBtnActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  presetLabel: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#6B7280',
  },
  presetLabelActive: {
    color: '#000',
  },
});
