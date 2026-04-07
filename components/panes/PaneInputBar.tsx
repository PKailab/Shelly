/**
 * components/panes/PaneInputBar.tsx
 *
 * Shared bottom input bar for all pane types.
 * Layout: [clip icon] [> TextInput] [send arrow]
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
      {/* Attach/clip icon */}
      <TouchableOpacity
        onPress={onAttach}
        style={styles.iconButton}
        accessibilityLabel="Attach file"
        accessibilityRole="button"
      >
        <MaterialIcons name="attach-file" size={18} color="#555555" />
      </TouchableOpacity>

      {/* Prompt glyph + TextInput */}
      <View style={styles.inputRow}>
        <MaterialIcons name="chevron-right" size={14} color="#555555" style={styles.promptIcon} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder ?? ''}
          placeholderTextColor="#444444"
          onSubmitEditing={handleSubmit}
          blurOnSubmit={false}
          returnKeyType="send"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Send arrow */}
      <TouchableOpacity
        onPress={handleSubmit}
        style={styles.iconButton}
        accessibilityLabel="Send"
        accessibilityRole="button"
      >
        <MaterialIcons name="send" size={18} color="#555555" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    height: 40,
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  iconButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  promptIcon: {
    marginRight: 2,
  },
  input: {
    flex: 1,
    height: 32,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#CCCCCC',
    paddingVertical: 0,
  },
});
