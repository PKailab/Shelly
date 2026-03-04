import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { getCompletions } from '@/lib/completions';

const ACCENT = '#00D4AA';

type Props = {
  input: string;
  onSelect: (insertText: string) => void;
};

function AutocompleteDropdownInner({ input, onSelect }: Props) {
  const completions = getCompletions(input);

  if (completions.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.scroll}
      >
        {completions.map((c, i) => (
          <Pressable
            key={`${c.label}-${i}`}
            style={styles.chip}
            onPress={() => onSelect(c.insertText)}
          >
            <Text style={styles.chipLabel}>{c.label}</Text>
            {c.detail && (
              <Text style={styles.chipDetail}>{c.detail}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export const AutocompleteDropdown = memo(AutocompleteDropdownInner);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    paddingVertical: 4,
  },
  scroll: {
    paddingHorizontal: 8,
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLabel: {
    color: ACCENT,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  chipDetail: {
    color: '#4B5563',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
