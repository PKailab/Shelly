/**
 * components/snippets/SnippetEditModal.tsx
 *
 * Bottom-sheet style modal for editing a Snippet.
 * Allows editing: title, command (multi-line), tags (comma-separated), scope.
 * Also provides a Delete button with confirmation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Snippet, SnippetScope } from '@/store/types';
import { useSnippetStore, parseTags } from '@/store/snippet-store';

type Props = {
  snippet: Snippet | null;
  visible: boolean;
  onClose: () => void;
};

export function SnippetEditModal({ snippet, visible, onClose }: Props) {
  const { updateSnippet, deleteSnippet } = useSnippetStore();

  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [scope, setScope] = useState<SnippetScope>('global');

  // Sync fields when snippet changes
  useEffect(() => {
    if (snippet) {
      setTitle(snippet.title);
      setCommand(snippet.command);
      setTagsRaw(snippet.tags.join(', '));
      setScope(snippet.scope);
    }
  }, [snippet]);

  const handleSave = useCallback(() => {
    if (!snippet) return;
    if (!command.trim()) {
      Alert.alert('エラー', 'コマンドは必須です');
      return;
    }
    updateSnippet(snippet.id, {
      title: title.trim() || command.trim().slice(0, 30),
      command: command.trim(),
      tags: parseTags(tagsRaw),
      scope,
    });
    onClose();
  }, [snippet, title, command, tagsRaw, scope, updateSnippet, onClose]);

  const handleDelete = useCallback(() => {
    if (!snippet) return;
    Alert.alert(
      'スニペットを削除',
      `"${snippet.title}" を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            deleteSnippet(snippet.id);
            onClose();
          },
        },
      ]
    );
  }, [snippet, deleteSnippet, onClose]);

  if (!snippet) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.sheet}>
                {/* Header */}
                <View style={styles.header}>
                  <Text style={styles.headerTitle}>スニペット編集</Text>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
                  {/* Title */}
                  <Text style={styles.label}>タイトル</Text>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="スニペット名"
                    placeholderTextColor="#4B5563"
                    returnKeyType="next"
                    autoCorrect={false}
                  />

                  {/* Command */}
                  <Text style={styles.label}>コマンド <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={[styles.input, styles.commandInput]}
                    value={command}
                    onChangeText={setCommand}
                    placeholder="コマンドを入力"
                    placeholderTextColor="#4B5563"
                    multiline
                    autoCorrect={false}
                    autoCapitalize="none"
                    spellCheck={false}
                  />

                  {/* Tags */}
                  <Text style={styles.label}>タグ <Text style={styles.hint}>（カンマ区切り）</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={tagsRaw}
                    onChangeText={setTagsRaw}
                    placeholder="git, docker, ssh"
                    placeholderTextColor="#4B5563"
                    returnKeyType="done"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />

                  {/* Scope */}
                  <Text style={styles.label}>スコープ</Text>
                  <View style={styles.scopeRow}>
                    {(['global', 'session'] as SnippetScope[]).map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.scopeBtn, scope === s && styles.scopeBtnActive]}
                        onPress={() => setScope(s)}
                      >
                        <Text style={[styles.scopeText, scope === s && styles.scopeTextActive]}>
                          {s === 'global' ? 'Global' : 'Session'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Delete */}
                  <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                    <Text style={styles.deleteBtnText}>🗑 スニペットを削除</Text>
                  </TouchableOpacity>
                </ScrollView>

                {/* Save button */}
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>保存</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
  },
  headerTitle: {
    color: '#ECEDEE',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: '#6B7280',
    fontSize: 16,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  label: {
    color: '#9BA1A6',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: {
    color: '#F87171',
  },
  hint: {
    color: '#4B5563',
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 8,
    color: '#ECEDEE',
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  commandInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    backgroundColor: '#111111',
    alignItems: 'center',
  },
  scopeBtnActive: {
    borderColor: '#00D4AA',
    backgroundColor: '#00D4AA18',
  },
  scopeText: {
    color: '#6B7280',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  scopeTextActive: {
    color: '#00D4AA',
    fontWeight: '600',
  },
  deleteBtn: {
    marginTop: 20,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F8717130',
    backgroundColor: '#F8717110',
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#F87171',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  saveBtn: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#00D4AA',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#0A0A0A',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
});
