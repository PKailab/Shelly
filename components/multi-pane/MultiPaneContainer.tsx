import React, { useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMultiPaneStore, type PaneNode, type PaneSplit, type PaneLeaf } from '@/hooks/use-multi-pane';
import { PaneSlot } from './PaneSlot';
import { colors as C, fonts as F } from '@/theme.config';

/** Fallback when the user somehow closes every pane — shouldn't normally
 *  happen because removePane now refuses to close the last leaf, but we
 *  keep this for corrupted stores / migrations / manual clear. */
function EmptyState() {
  const addPane = useMultiPaneStore((s) => s.addPane);
  const options = [
    { tab: 'terminal' as const, label: 'Terminal', icon: 'terminal' },
    { tab: 'ai' as const,       label: 'AI Chat',  icon: 'auto-awesome' },
    { tab: 'browser' as const,  label: 'Browser',  icon: 'language' },
  ];
  return (
    <View style={emptyStyles.root}>
      <Text style={emptyStyles.title}>NO PANES OPEN</Text>
      <Text style={emptyStyles.subtitle}>Add a pane to get started</Text>
      <View style={emptyStyles.row}>
        {options.map((opt) => (
          <Pressable
            key={opt.tab}
            style={emptyStyles.btn}
            onPress={() => addPane(opt.tab)}
          >
            <MaterialIcons name={opt.icon as any} size={18} color={C.accent} />
            <Text style={emptyStyles.btnLabel}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bgDeep,
    gap: 12,
  },
  title: {
    color: C.accent,
    fontFamily: F.family,
    fontSize: 10,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,212,170,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: C.text2,
    fontFamily: F.family,
    fontSize: 7,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.45)',
    backgroundColor: 'rgba(0,212,170,0.08)',
  },
  btnLabel: {
    color: C.accent,
    fontFamily: F.family,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

/** Draggable divider between two panes (12px invisible hit area) */
function Divider({
  splitNode,
  isHorizontal,
  containerSize,
}: {
  splitNode: PaneSplit;
  isHorizontal: boolean;
  containerSize: React.MutableRefObject<number>;
}) {
  const { setSplitRatio, resetSplitRatio } = useMultiPaneStore();
  const startRatio = useRef(splitNode.ratio);

  const pan = Gesture.Pan()
    .onBegin(() => {
      startRatio.current = splitNode.ratio;
    })
    .onUpdate((e) => {
      const size = containerSize.current;
      if (size <= 0) return;
      const delta = isHorizontal ? e.translationX : e.translationY;
      const newRatio = startRatio.current + delta / size;
      setSplitRatio(splitNode.id, newRatio);
    });

  // Double-tap = reset to 50/50
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      resetSplitRatio(splitNode.id);
    });

  const composed = Gesture.Race(pan, doubleTap);

  return (
    <GestureDetector gesture={composed}>
      <View style={isHorizontal ? styles.dividerV : styles.dividerH}>
        {/* Accent line + 3-dot handle so the user can see where to grab */}
        <View style={isHorizontal ? styles.dividerVLine : styles.dividerHLine} />
        <View style={isHorizontal ? styles.dividerGripV : styles.dividerGripH}>
          <View style={styles.dividerDot} />
          <View style={styles.dividerDot} />
          <View style={styles.dividerDot} />
        </View>
      </View>
    </GestureDetector>
  );
}

/** Recursively render the pane tree */
function PaneTreeNode({ node }: { node: PaneNode }) {
  const { setLeafTab, splitPane, removePane, root, maxPanes } = useMultiPaneStore();
  const containerSize = useRef(0);

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

  const isHorizontal = node.direction === 'horizontal';

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    containerSize.current = isHorizontal ? width : height;
  }, [isHorizontal]);

  return (
    <View
      style={[styles.split, isHorizontal ? styles.splitH : styles.splitV]}
      onLayout={onLayout}
    >
      <View style={{ flex: node.ratio }}>
        <PaneTreeNode node={node.children[0]} />
      </View>
      <Divider
        splitNode={node}
        isHorizontal={isHorizontal}
        containerSize={containerSize}
      />
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

/** Find a leaf by id in the tree */
function findLeafById(node: PaneNode, id: string): PaneLeaf | null {
  if (node.type === 'leaf') return node.id === id ? node : null;
  return findLeafById(node.children[0], id) ?? findLeafById(node.children[1], id);
}

export function MultiPaneContainer() {
  const { root, maximizedPaneId } = useMultiPaneStore();

  if (!root) {
    return (
      <View style={styles.root}>
        <EmptyState />
      </View>
    );
  }

  // Fullscreen mode: render only the maximized leaf
  if (maximizedPaneId) {
    const leaf = findLeafById(root, maximizedPaneId);
    if (leaf) {
      return (
        <View style={styles.root}>
          <PaneTreeNode node={leaf} />
        </View>
      );
    }
  }

  return (
    <View style={styles.root}>
      <PaneTreeNode node={root} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bgDeep,
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
  // 16px hit area with a 2px accent line + 3-dot grip centered so the
  // user can actually find and drag it. Previously a 1px border-color
  // line in a 12px hitbox, both invisible on a dark background.
  dividerV: {
    width: 16,
    marginHorizontal: -8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  dividerH: {
    height: 16,
    marginVertical: -8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  dividerVLine: {
    position: 'absolute',
    width: 2,
    height: '100%',
    backgroundColor: 'rgba(0,212,170,0.45)',
  },
  dividerHLine: {
    position: 'absolute',
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(0,212,170,0.45)',
  },
  dividerGripV: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 10,
    height: 28,
    borderRadius: 3,
    backgroundColor: C.bgSurface,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.55)',
    gap: 2,
  },
  dividerGripH: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 10,
    borderRadius: 3,
    backgroundColor: C.bgSurface,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.55)',
    gap: 2,
  },
  dividerDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.accent,
  },
});
