// components/settings/LlamaCppSectionWrapper.tsx
//
// Adapter that lets the existing LlamaCppSection (designed for the
// Termux bridge era with isConnected + onRunCommand props) run on
// Plan B's in-process JNI execCommand. Keeps LlamaCppSection.tsx
// untouched so the rich setup/download/start/stop UI can ship today.
//
// Responsibilities:
// - resolve isConnected = true (JNI exec is always available on Plan B)
// - route onRunCommand through execCommand
// - resolve installedModelIds by listing $HOME/models/*.gguf
// - resolve activeModelId from settings-store.localLlmUrl mapping
// - persist onSelectModel as settings-store.localLlmUrl + active id
// - persist onUpdateLocalLlmUrl as settings-store update

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors as C, fonts as F } from '@/theme.config';
import { LlamaCppSection } from './LlamaCppSection';
import {
  buildListModelsCommand,
  getLlamaCppLocalLlmConfig,
  MODEL_CATALOG,
  type LlamaCppModel,
} from '@/lib/llamacpp-setup';
import { execCommand } from '@/hooks/use-native-exec';
import { useSettingsStore } from '@/store/settings-store';

type Props = {
  onClose: () => void;
};

export function LlamaCppSectionWrapper({ onClose }: Props) {
  const localLlmUrl = useSettingsStore((s) => s.settings.localLlmUrl);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [installedModelIds, setInstalledModelIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  // Refresh installed model list by listing $HOME/models/*.gguf
  const refreshInstalled = useCallback(async () => {
    const r = await execCommand(buildListModelsCommand(), 10_000);
    const out = r.stdout ?? '';
    const found = new Set<string>();
    for (const model of MODEL_CATALOG) {
      if (out.includes(model.filename)) found.add(model.id);
    }
    setInstalledModelIds(found);
  }, []);

  useEffect(() => {
    refreshInstalled();
  }, [refreshInstalled]);

  // Pick activeModelId as the first installed that matches; otherwise null.
  // (The model itself is served by llama-server, which knows its own weights;
  // Shelly only tracks which catalog entry the user last picked.)
  useEffect(() => {
    if (installedModelIds.size === 0) {
      setActiveModelId(null);
      return;
    }
    setActiveModelId((prev) =>
      prev && installedModelIds.has(prev) ? prev : installedModelIds.values().next().value ?? null,
    );
  }, [installedModelIds]);

  const handleRun = useCallback(
    async (command: string, _label: string) => {
      // llama.cpp setup commands can be long — bump timeout to 10 min.
      const r = await execCommand(command, 600_000);
      const ok = r.exitCode === 0;
      if (ok) {
        // Any successful command may have mutated $HOME/models, refresh.
        refreshInstalled();
      }
      return { success: ok, output: (r.stdout ?? '') + (r.stderr ?? '') };
    },
    [refreshInstalled],
  );

  const handleSelectModel = useCallback(
    (model: LlamaCppModel) => {
      setActiveModelId(model.id);
      const cfg = getLlamaCppLocalLlmConfig(model);
      updateSettings({ localLlmUrl: cfg.baseUrl });
    },
    [updateSettings],
  );

  const handleUpdateLocalLlmUrl = useCallback(
    (url: string) => {
      updateSettings({ localLlmUrl: url });
    },
    [updateSettings],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>LOCAL LLM · llama.cpp</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>
      <Text style={styles.endpoint} numberOfLines={1}>
        {localLlmUrl}
      </Text>
      <ScrollView style={styles.body}>
        <LlamaCppSection
          isConnected={true}
          activeModelId={activeModelId}
          installedModelIds={installedModelIds}
          onSelectModel={handleSelectModel}
          onRunCommand={handleRun}
          onUpdateLocalLlmUrl={handleUpdateLocalLlmUrl}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: {
    fontFamily: F.family,
    fontSize: 11,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 0.5,
  },
  close: {
    fontFamily: F.family,
    fontSize: 9,
    fontWeight: '700',
    color: C.text2,
    letterSpacing: 0.5,
  },
  endpoint: {
    fontFamily: F.family,
    fontSize: 9,
    color: C.text3,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
  },
  body: {
    flex: 1,
  },
});
