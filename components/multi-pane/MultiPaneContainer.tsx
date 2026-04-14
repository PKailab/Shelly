import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
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

/** Draggable divider between two panes.
 *
 * Positioned absolutely over the split boundary. We can't use a flex-in-line
 * divider with a negative margin for the hit area — Yoga / Android hit-testing
 * uses the layout rect, so a net-zero-width flex slot makes Pan/Tap gestures
 * unreachable even if the visual grip looks correct. That was bug #30.
 *
 * Instead, the parent split gives us the current container pixel size so we
 * can convert `ratio` to an absolute offset and carve out a real 16px strip
 * that owns its own hit region.
 */
function Divider({
  splitNode,
  isHorizontal,
  splitSize,
}: {
  splitNode: PaneSplit;
  isHorizontal: boolean;
  splitSize: number;
}) {
  const { setSplitRatio, resetSplitRatio } = useMultiPaneStore();
  const startRatioRef = useRef(splitNode.ratio);

  // Gesture.Pan() callbacks run on the UI thread as worklets in RNGH 2.x.
  // Calling a plain JS function (Zustand's setSplitRatio) from a worklet
  // throws "Object is not a function" because the JS reference isn't
  // reachable from the UI runtime. We pre-declare tiny JS-thread helpers
  // and wrap them with runOnJS so the UI thread queues the mutation
  // back onto the JS thread.
  const handleBegin = (start: number) => {
    startRatioRef.current = start;
  };
  const handleUpdate = (id: string, delta: number, size: number) => {
    if (size <= 0) return;
    const newRatio = startRatioRef.current + delta / size;
    setSplitRatio(id, newRatio);
  };
  const handleReset = (id: string) => {
    resetSplitRatio(id);
  };

  // Capture props into plain constants so the worklet closure doesn't
  // dereference React refs or hook return values across the UI bridge.
  const splitId = splitNode.id;
  const startRatio = splitNode.ratio;
  const size = splitSize;
  const horizontal = isHorizontal;

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      runOnJS(handleBegin)(startRatio);
    })
    .onUpdate((e) => {
      'worklet';
      const delta = horizontal ? e.translationX : e.translationY;
      runOnJS(handleUpdate)(splitId, delta, size);
    });

  // Double-tap = reset to 50/50
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      runOnJS(handleReset)(splitId);
    });

  const composed = Gesture.Race(pan, doubleTap);

  // Don't render the hit strip until we know the container size — otherwise
  // the first frame would place the divider at offset -8 which looks glitchy.
  if (splitSize <= 0) return null;

  const offset = splitNode.ratio * splitSize - 8;
  const absoluteStyle = isHorizontal
    ? { position: 'absolute' as const, top: 0, bottom: 0, left: offset, width: 16 }
    : { position: 'absolute' as const, left: 0, right: 0, top: offset, height: 16 };

  return (
    <GestureDetector gesture={composed}>
      <View style={[isHorizontal ? styles.dividerV : styles.dividerH, absoluteStyle]}>
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
  // The divider is absolutely positioned, so we need the pixel size of the
  // split container in state (not a ref) to re-render when it changes.
  const [splitSize, setSplitSize] = useState(0);

  const isHorizontal = node.type === 'split' && node.direction === 'horizontal';

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const next = isHorizontal ? width : height;
    setSplitSize((prev) => (prev === next ? prev : next));
  }, [isHorizontal]);

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

  return (
    <View
      style={[styles.split, isHorizontal ? styles.splitH : styles.splitV]}
      onLayout={onLayout}
    >
      <View style={{ flex: node.ratio }}>
        <PaneTreeNode node={node.children[0]} />
      </View>
      <View style={{ flex: 1 - node.ratio }}>
        <PaneTreeNode node={node.children[1]} />
      </View>
      <Divider
        splitNode={node}
        isHorizontal={isHorizontal}
        splitSize={splitSize}
      />
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
    // Divider is absolutely positioned and may extend past the flex row/column
    // boundary by a few pixels when the grip sits at the very edge. Without
    // overflow: 'visible' Android would clip the hit region.
    overflow: 'visible',
  },
  splitH: {
    flexDirection: 'row',
  },
  splitV: {
    flexDirection: 'column',
  },
  // 16px hit strip placed absolutely over the split boundary. The inner
  // accent line + 3-dot grip give the user an obvious place to grab. See
  // the Divider component for why absolute positioning is required.
  dividerV: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  dividerH: {
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
