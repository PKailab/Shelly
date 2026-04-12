/**
 * ProGate — Wrapper component for Pro-only features.
 *
 * During launch phase, children render normally (all features unlocked).
 * When monetization activates, shows an upsell screen for locked features.
 *
 * Usage:
 *   <ProGate feature="crossPane">
 *     <CrossPaneIntelligence />
 *   </ProGate>
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { isFeatureAvailable, type ProFeature } from '@/lib/feature-gate';

type Props = {
  feature: ProFeature;
  children: React.ReactNode;
  /** Optional custom message for the upsell screen */
  message?: string;
};

export function ProGate({ feature, children, message }: Props) {
  if (isFeatureAvailable(feature)) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <MaterialIcons name="lock-outline" size={48} color="#3B82F6" />
      <Text style={styles.title}>Pro Feature</Text>
      <Text style={styles.message}>
        {message ?? 'Upgrade to Shelly Pro to unlock this feature.'}
      </Text>
      <Pressable style={styles.button} onPress={() => {/* TODO: open purchase flow */}}>
        <Text style={styles.buttonText}>Upgrade — $10</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    color: '#C9D1D9',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    color: '#8B949E',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#1F6FEB',
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
