/**
 * components/creator/CommandLane.tsx
 *
 * The "Command" lane — user types a natural language request here.
 * Styled like a terminal prompt to maintain the pro-tool aesthetic.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ─── Example prompts ──────────────────────────────────────────────────────────

const EXAMPLES = [
  'Photo organizer',
  'Build a portfolio site',
  'Timer app',
  'Visualize CSV data',
  'Build a self-intro page',
  'Python image resize script',
];

// ─── Task templates (1-tap project creation) ──────────────────────────────────

const TEMPLATES = [
  { label: 'Node API', prompt: 'Create an Express REST API server with CORS and health check endpoint', icon: 'dns' as const, color: '#4ADE80' },
  { label: 'Static Site', prompt: 'Create a simple responsive landing page with HTML and CSS', icon: 'web' as const, color: '#60A5FA' },
  { label: 'CLI Tool', prompt: 'Create a Node.js CLI tool with argument parsing, help display, and colored output', icon: 'terminal' as const, color: '#FBBF24' },
  { label: 'Python Script', prompt: 'Create a Python file utility script with batch rename support', icon: 'code' as const, color: '#8B5CF6' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  onSubmit: (input: string) => void;
  isDisabled?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandLane({ onSubmit, isDisabled = false }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isDisabled) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSubmit(trimmed);
    setInput('');
  };

  const handleExample = (example: string) => {
    setInput(example);
    inputRef.current?.focus();
  };

  return (
    <View style={styles.container}>
      {/* Lane header */}
      <View style={styles.laneHeader}>
        <Text style={styles.laneLabel}>COMMAND</Text>
        <View style={styles.dot} />
      </View>

      {/* Prompt line */}
      <View style={styles.promptRow}>
        <Text style={styles.promptSymbol}>❯</Text>
        <TextInput
          ref={inputRef}
          style={[styles.input, isDisabled && styles.inputDisabled]}
          value={input}
          onChangeText={setInput}
          placeholder="What do you want to create?"
          placeholderTextColor="#4B5563"
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          editable={!isDisabled}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Pressable
          onPress={handleSubmit}
          disabled={!input.trim() || isDisabled}
          style={({ pressed }) => [
            styles.sendBtn,
            (!input.trim() || isDisabled) && styles.sendBtnDisabled,
            pressed && styles.sendBtnPressed,
          ]}
        >
          <Text style={styles.sendBtnText}>Run</Text>
        </Pressable>
      </View>

      {/* Example chips */}
      {!isDisabled && (
        <View style={styles.examples}>
          <Text style={styles.examplesLabel}>e.g.:</Text>
          <View style={styles.chips}>
            {EXAMPLES.slice(0, 3).map((ex) => (
              <Pressable
                key={ex}
                onPress={() => handleExample(ex)}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={styles.chipText}>{ex}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Task templates (1-tap) */}
      {!isDisabled && (
        <View style={styles.templates}>
          <Text style={styles.examplesLabel}>Templates:</Text>
          <View style={styles.templateGrid}>
            {TEMPLATES.map((tmpl) => (
              <Pressable
                key={tmpl.label}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSubmit(tmpl.prompt);
                }}
                style={({ pressed }) => [
                  styles.templateCard,
                  { borderColor: tmpl.color + '40' },
                  pressed && { backgroundColor: tmpl.color + '10' },
                ]}
              >
                <MaterialIcons name={tmpl.icon} size={16} color={tmpl.color} />
                <Text style={[styles.templateLabel, { color: tmpl.color }]}>{tmpl.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0D0D0D',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  laneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  laneLabel: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: '#4B5563',
    letterSpacing: 1.5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#00D4AA',
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promptSymbol: {
    fontSize: 14,
    color: '#00D4AA',
    fontFamily: 'monospace',
    width: 16,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#ECEDEE',
    paddingVertical: 6,
    paddingHorizontal: 0,
    minHeight: 32,
  },
  inputDisabled: {
    color: '#4B5563',
  },
  sendBtn: {
    backgroundColor: 'rgba(0, 212, 170, 0.12)',
    borderWidth: 1,
    borderColor: '#00D4AA',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sendBtnDisabled: {
    backgroundColor: 'transparent',
    borderColor: '#2D2D2D',
  },
  sendBtnPressed: {
    backgroundColor: 'rgba(0, 212, 170, 0.25)',
  },
  sendBtnText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#00D4AA',
  },
  examples: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  examplesLabel: {
    fontSize: 10,
    color: '#4B5563',
    fontFamily: 'monospace',
    paddingTop: 3,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  chip: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#272727',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipPressed: {
    backgroundColor: '#1E1E1E',
  },
  chipText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#9BA1A6',
  },
  templates: {
    marginTop: 10,
    gap: 6,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  templateLabel: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
});
