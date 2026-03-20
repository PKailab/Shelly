/**
 * BridgeRecoveryBanner — ブリッジ切断時の復帰案内
 *
 * 表示条件: connectionMode==='termux' && bridgeStatus is error/disconnected && reconnect exhausted
 * Persona A: 「Termuxで再起動」ボタンで復帰コマンドをコピー+Termux起動
 * Persona B: 「×」で dismiss（自分で対処する人の邪魔にならない）
 */
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from '@/lib/i18n';
import { useTermuxBridge } from '@/hooks/use-termux-bridge';
import { useTerminalStore } from '@/store/terminal-store';

export function BridgeRecoveryBanner() {
  const { t } = useTranslation();
  const { connectionMode, bridgeStatus } = useTerminalStore();
  const { isReconnectExhausted, resetReconnect } = useTermuxBridge();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  const shouldShow =
    connectionMode === 'termux' &&
    (bridgeStatus === 'error' || bridgeStatus === 'disconnected') &&
    isReconnectExhausted &&
    !dismissed;

  if (!shouldShow) return null;

  const handleRestart = async () => {
    const cmd = t('bridge.recovery_command');
    await Clipboard.setStringAsync(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    try {
      await Linking.openURL('com.termux://');
    } catch {
      // Termux not installed — ignore
    }
  };

  const handleReconnect = () => {
    setDismissed(false);
    setCopied(false);
    resetReconnect();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <MaterialIcons name="warning-amber" size={18} color="#FBBF24" />
        <Text style={styles.text}>{t('bridge.disconnected_title')}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={handleRestart}>
          <Text style={styles.btnText}>
            {copied ? t('bridge.copied') : t('bridge.restart_termux')}
          </Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={handleReconnect}>
          <Text style={styles.btnText}>{t('bridge.reconnect')}</Text>
        </Pressable>
        <Pressable style={styles.dismissBtn} onPress={() => setDismissed(true)}>
          <MaterialIcons name="close" size={16} color="#6B7280" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A00',
    borderBottomWidth: 1,
    borderBottomColor: '#FBBF2433',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  text: {
    color: '#FBBF24',
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FBBF2444',
  },
  btnText: {
    color: '#FBBF24',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  dismissBtn: {
    padding: 4,
  },
});
