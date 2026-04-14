// components/settings/ModalHeader.tsx
//
// Shared header for Settings wrapper modals (MCP, Local LLM, future
// integrations). Three-column layout — BACK on the left, centered title,
// CLOSE on the right. Both BACK and CLOSE call the same onClose handler;
// the redundancy is deliberate so users can reach back navigation from
// either side of the header regardless of their thumb position or
// Android back-gesture availability.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors as C, fonts as F } from '@/theme.config';

type Props = {
  title: string;
  onClose: () => void;
  /** Optional extra element rendered under the title bar (e.g., endpoint URL). */
  subtitle?: React.ReactNode;
};

export function ModalHeader({ title, onClose, subtitle }: Props) {
  return (
    <View>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.sideButton}
          accessibilityRole="button"
          accessibilityLabel={`Back from ${title}`}
        >
          <MaterialIcons name="arrow-back" size={14} color={C.text2} />
          <Text style={styles.sideText}>BACK</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.sideButton}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        >
          <Text style={styles.sideText}>CLOSE</Text>
        </Pressable>
      </View>
      {subtitle}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 60,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: F.family,
    fontSize: 11,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 0.5,
  },
  sideText: {
    fontFamily: F.family,
    fontSize: 9,
    fontWeight: '700',
    color: C.text2,
    letterSpacing: 0.5,
  },
});
