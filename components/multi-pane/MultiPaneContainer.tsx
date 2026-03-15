import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMultiPaneStore, type PaneNode } from '@/hooks/use-multi-pane';
import { PaneSlot } from './PaneSlot';

/** Recursively render the pane tree */
function PaneTreeNode({ node }: { node: PaneNode }) {
  const { setLeafTab, splitPane, removePane, root, maxPanes } = useMultiPaneStore();

  if (node.type === 'leaf') {
    const leafCount = root ? countLeavesQuick(root) : 1;
    return (
      <PaneSlot
        leafId={node.id}
        tab={node.tab}
        onChangeTab={(tab) => setLeafTab(node.id, tab)}
        onRemove={() => removePane(node.id)}
        onSplitH={(tab) => splitPane(node.id, 'horizontal', tab)}
        onSplitV={(tab) => splitPane(node.id, 'vertical', tab)}
        canSplit={leafCount < maxPanes}
      />
    );
  }

  // Split node
  const isHorizontal = node.direction === 'horizontal';
  return (
    <View style={[styles.split, isHorizontal ? styles.splitH : styles.splitV]}>
      <View style={{ flex: node.ratio }}>
        <PaneTreeNode node={node.children[0]} />
      </View>
      <View style={[isHorizontal ? styles.dividerV : styles.dividerH]} />
      <View style={{ flex: 1 - node.ratio }}>
        <PaneTreeNode node={node.children[1]} />
      </View>
    </View>
  );
}

function countLeavesQuick(node: PaneNode): number {
  if (node.type === 'leaf') return 1;
  return countLeavesQuick(node.children[0]) + countLeavesQuick(node.children[1]);
}

export function MultiPaneContainer() {
  const insets = useSafeAreaInsets();
  const { root } = useMultiPaneStore();

  if (!root) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <PaneTreeNode node={root} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0A',
    zIndex: 50,
  },
  split: {
    flex: 1,
  },
  splitH: {
    flexDirection: 'row',
  },
  splitV: {
    flexDirection: 'column',
  },
  dividerV: {
    width: 1,
    backgroundColor: '#1E1E1E',
  },
  dividerH: {
    height: 1,
    backgroundColor: '#1E1E1E',
  },
});
