/**
 * TerminalActionBar — Attach files and voice input for terminal
 *
 * - Attach: pick image/file from device → copy to terminal cwd
 * - Voice: STT → send transcribed text to terminal
 * - Voice Dialog: long-press mic → full voice conversation mode with terminal
 */

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';
import { useTerminalStore } from '@/store/terminal-store';
import { useSpeechInput } from '@/hooks/use-speech-input';

type Props = {
  /** Copy file to terminal cwd via bridge command */
  copyFileToCwd: (sourceUri: string, fileName: string) => Promise<void>;
  /** Send text to terminal (for voice transcription) */
  sendText: (text: string) => void;
  /** Open voice dialog mode */
  onVoiceDialog?: () => void;
};

export function TerminalActionBar({ copyFileToCwd, sendText, onVoiceDialog }: Props) {
  const { colors: c } = useTheme();
  const { settings } = useTerminalStore();
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const { state: speechState, startRecording, stopRecording } = useSpeechInput();

  // Append transcription to terminal when ready
  React.useEffect(() => {
    if (speechState.transcribedText) {
      sendText(speechState.transcribedText);
    }
  }, [speechState.transcribedText, sendText]);

  const handlePickImage = useCallback(async () => {
    setAttachMenuVisible(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileName = asset.fileName || `image-${Date.now()}.jpg`;
        await copyFileToCwd(asset.uri, fileName);
      }
    } catch (e) {
      console.warn('[TerminalActionBar] image pick error:', e);
    }
  }, [copyFileToCwd]);

  const handlePickFile = useCallback(async () => {
    setAttachMenuVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const fileName = asset.name || `file-${Date.now()}`;
        await copyFileToCwd(asset.uri, fileName);
      }
    } catch (e) {
      console.warn('[TerminalActionBar] file pick error:', e);
    }
  }, [copyFileToCwd]);

  const handleMicToggle = useCallback(async () => {
    if (settings.hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (speechState.status === 'recording') {
      stopRecording();
    } else if (speechState.status === 'idle') {
      startRecording();
    }
  }, [speechState.status, startRecording, stopRecording, settings.hapticFeedback]);

  const handleMicLongPress = useCallback(() => {
    if (settings.hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onVoiceDialog?.();
  }, [onVoiceDialog, settings.hapticFeedback]);

  return (
    <View style={[styles.bar, { backgroundColor: c.surfaceHigh, borderTopColor: c.border }]}>
      {/* Attach button */}
      <Pressable
        style={[styles.btn, { backgroundColor: withAlpha(c.foreground, 0.06) }]}
        onPress={() => setAttachMenuVisible(!attachMenuVisible)}
        accessibilityRole="button"
        accessibilityLabel="Attach file"
      >
        <MaterialIcons name="attach-file" size={16} color={c.foreground} />
      </Pressable>

      {/* Attach menu dropdown */}
      {attachMenuVisible && (
        <View style={[styles.attachMenu, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Pressable style={styles.menuItem} onPress={handlePickImage}>
            <MaterialIcons name="image" size={16} color={c.accent} />
            <Text style={[styles.menuText, { color: c.foreground }]}>Image</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={handlePickFile}>
            <MaterialIcons name="insert-drive-file" size={16} color={c.accent} />
            <Text style={[styles.menuText, { color: c.foreground }]}>File</Text>
          </Pressable>
        </View>
      )}

      {/* Voice input button */}
      <Pressable
        style={[
          styles.btn,
          { backgroundColor: withAlpha(c.foreground, 0.06) },
          speechState.status === 'recording' && { backgroundColor: withAlpha(c.error, 0.15) },
        ]}
        onPress={handleMicToggle}
        onLongPress={handleMicLongPress}
        delayLongPress={500}
        accessibilityRole="button"
        accessibilityLabel="Voice input"
      >
        <MaterialIcons
          name={speechState.status === 'recording' ? 'stop' : 'mic'}
          size={16}
          color={speechState.status === 'recording' ? c.error : c.foreground}
        />
      </Pressable>

      {/* Status indicator */}
      {speechState.status === 'transcribing' && (
        <Text style={[styles.statusText, { color: c.muted }]}>Transcribing...</Text>
      )}
      {speechState.status === 'recording' && (
        <Text style={[styles.statusText, { color: c.error }]}>Recording...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 6,
    borderTopWidth: 1,
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachMenu: {
    position: 'absolute',
    bottom: 40,
    left: 6,
    borderRadius: 8,
    borderWidth: 1,
    padding: 4,
    zIndex: 100,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  menuText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 10,
  },
});
