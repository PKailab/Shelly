/**
 * components/panes/PaneInputBar.tsx
 *
 * Shared bottom input bar for all pane types.
 * Layout: [> TextInput] [attach circle] [send circle]
 * Matching mock: > █ + green circular attach + green circular send/voice buttons
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const ACCENT = '#00D4AA';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  placeholder?: string;
  onSubmit: (text: string) => void;
  onAttach?: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaneInputBar({ placeholder, onSubmit, onAttach }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  }, [text, onSubmit]);

  return (
    <View style={styles.container}>
      {/* Prompt glyph + TextInput */}
      <View style={styles.inputRow}>
        <Text style={styles.promptGlyph}>{'>'}</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder ?? ''}
          placeholderTextColor="#444"
          onSubmitEditing={handleSubmit}
          blurOnSubmit={false}
          returnKeyType="send"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Attach circle button */}
      <TouchableOpacity
        onPress={onAttach}
        style={styles.circleBtn}
        accessibilityLabel="Attach file"
        accessibilityRole="button"
      >
        <MaterialIcons name="attach-file" size={16} color="#000" />
      </TouchableOpacity>

      {/* Send circle button */}
      <TouchableOpacity
        onPress={handleSubmit}
        style={styles.circleBtn}
        accessibilityLabel="Send"
        accessibilityRole="button"
      >
        <MaterialIcons name="arrow-upward" size={16} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    height: 44,
    backgroundColor: '#0D0D0D',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  inputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  promptGlyph: {
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: ACCENT,
    marginRight: 6,
  },
  input: {
    flex: 1,
    height: 34,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#E5E7EB',
    paddingVertical: 0,
  },
  circleBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
