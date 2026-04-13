// components/settings/McpSectionWrapper.tsx
//
// Adapter that lets the existing McpSection (designed for the Termux
// bridge era with isConnected + onRunCommand props) run on Plan B's
// in-process JNI execCommand. Keeps McpSection.tsx untouched.

import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors as C, fonts as F } from '@/theme.config';
import { McpSection } from './McpSection';
import { execCommand } from '@/hooks/use-native-exec';

type Props = {
  onClose: () => void;
};

export function McpSectionWrapper({ onClose }: Props) {
  // onRunCommand mirror that used to route through the Termux bridge.
  // Now it calls execCommand directly and adapts the result shape to
  // whatever McpSection expects: { success, output }.
  const handleRun = useCallback(
    async (command: string, _label: string) => {
      const r = await execCommand(command, 120_000);
      return {
        success: r.exitCode === 0,
        output: (r.stdout ?? '') + (r.stderr ?? ''),
      };
    },
    [],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>MCP SERVERS</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.body}>
        <McpSection isConnected={true} onRunCommand={handleRun} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: {
    fontFamily: F.family,
    fontSize: 11,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 0.5,
  },
  close: {
    fontFamily: F.family,
    fontSize: 9,
    fontWeight: '700',
    color: C.text2,
    letterSpacing: 0.5,
  },
  body: {
    flex: 1,
  },
});
