/**
 * CommandKeyBar — Terminal shortcut key bar
 *
 * Compact bar with essential terminal keys: Ctrl+C, Tab, ↑, ↓, Paste
 * Responsive: shrinks labels on narrow panes.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';
import { useTerminalStore } from '@/store/terminal-store';

type Props = {
  /** Inject JS into WebView to send key codes */
  sendKey: (keyCode: string) => void;
  /** Send text string to terminal (for paste) */
  sendText: (text: string) => void;
  /** Whether the pane is narrow (< 400dp) */
  isCompact?: boolean;
};

type KeyDef = {
  label: string;
  compactLabel: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  keyCode: string;
  isSpecial?: boolean;
};

const KEYS: KeyDef[] = [
  { label: 'Ctrl+C', compactLabel: '^C', keyCode: '\x03' },
  { label: 'Tab', compactLabel: 'Tab', keyCode: '\t' },
  { label: '↑', compactLabel: '↑', keyCode: '\x1b[A' },
  { label: '↓', compactLabel: '↓', keyCode: '\x1b[B' },
];

export function CommandKeyBar({ sendKey, sendText, isCompact }: Props) {
  const { colors: c } = useTheme();
  const { settings } = useTerminalStore();

  const handleKeyPress = useCallback((keyCode: string) => {
    if (settings.hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    sendKey(keyCode);
  }, [sendKey, settings.hapticFeedback]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        if (settings.hapticFeedback) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        sendText(text);
      }
    } catch {
      // Clipboard access denied
    }
  }, [sendText, settings.hapticFeedback]);

  return (
    <View style={[styles.bar, { backgroundColor: c.surfaceHigh, borderTopColor: c.border }]}>
      {KEYS.map((key) => (
        <Pressable
          key={key.label}
          style={[styles.key, { backgroundColor: withAlpha(c.foreground, 0.06), borderColor: c.borderLight }]}
          onPress={() => handleKeyPress(key.keyCode)}
          accessibilityRole="button"
          accessibilityLabel={key.label}
        >
          <Text style={[styles.keyText, { color: c.foreground }]}>
            {isCompact ? key.compactLabel : key.label}
          </Text>
        </Pressable>
      ))}
      {/* Paste button */}
      <Pressable
        style={[styles.key, { backgroundColor: withAlpha(c.foreground, 0.06), borderColor: c.borderLight }]}
        onPress={handlePaste}
        accessibilityRole="button"
        accessibilityLabel="Paste"
      >
        <MaterialIcons name="content-paste" size={14} color={c.foreground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
    borderTopWidth: 1,
  },
  key: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
  },
  keyText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});
