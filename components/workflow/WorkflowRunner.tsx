import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useWorkflowStore, type Workflow } from '@/store/workflow-store';
import { useTerminalStore } from '@/store/terminal-store';
import { useTermuxBridge } from '@/hooks/use-termux-bridge';

const ACCENT = '#00D4AA';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function WorkflowRunner({ visible, onClose }: Props) {
  const { workflows, execution, startExecution, advanceStep, cancelExecution, getResolvedCommand } = useWorkflowStore();
  const { connectionMode, runCommand } = useTerminalStore();
  const { sendCommand } = useTermuxBridge();
  const [selectedWf, setSelectedWf] = useState<Workflow | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  const handleStartWorkflow = useCallback((wf: Workflow) => {
    if (wf.variables.length === 0) {
      // No variables needed, start immediately
      startExecution(wf.id, {});
      setSelectedWf(null);
    } else {
      setSelectedWf(wf);
      const vars: Record<string, string> = {};
      wf.variables.forEach((v) => { vars[v] = ''; });
      setVariables(vars);
    }
  }, [startExecution]);

  const handleConfirmVars = useCallback(() => {
    if (!selectedWf) return;
    startExecution(selectedWf.id, variables);
    setSelectedWf(null);
  }, [selectedWf, variables, startExecution]);

  const handleExecuteStep = useCallback(() => {
    const cmd = getResolvedCommand();
    if (!cmd) return;
    if (connectionMode === 'termux') {
      sendCommand(cmd);
    } else {
      runCommand(cmd);
    }
    advanceStep();
  }, [getResolvedCommand, connectionMode, sendCommand, runCommand, advanceStep]);

  // Variable input form
  if (selectedWf) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setSelectedWf(null)} statusBarTranslucent>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>{selectedWf.name}</Text>
            <Text style={styles.subtitle}>Variables</Text>
            {selectedWf.variables.map((v) => (
              <View key={v} style={styles.varRow}>
                <Text style={styles.varLabel}>{`{{${v}}}`}</Text>
                <TextInput
                  style={styles.varInput}
                  value={variables[v] || ''}
                  onChangeText={(text) => setVariables((prev) => ({ ...prev, [v]: text }))}
                  placeholder={v}
                  placeholderTextColor="#4B5563"
                  selectionColor={ACCENT}
                  autoCapitalize="none"
                />
              </View>
            ))}
            <View style={styles.btnRow}>
              <Pressable style={styles.btnCancel} onPress={() => setSelectedWf(null)}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.btnRun} onPress={handleConfirmVars}>
                <MaterialIcons name="play-arrow" size={18} color="#FFF" />
                <Text style={styles.btnRunText}>Start</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Active execution UI
  if (execution) {
    const wf = workflows.find((w) => w.id === execution.workflowId);
    const cmd = getResolvedCommand();
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={cancelExecution} statusBarTranslucent>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>{wf?.name ?? 'Workflow'}</Text>
            <Text style={styles.stepCounter}>
              Step {execution.currentStep + 1} / {execution.totalSteps}
            </Text>
            <View style={styles.cmdBox}>
              <Text style={styles.cmdPrompt}>$ </Text>
              <Text style={styles.cmdText}>{cmd}</Text>
            </View>
            {/* Progress bar */}
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${((execution.currentStep + 1) / execution.totalSteps) * 100}%` }]} />
            </View>
            <View style={styles.btnRow}>
              <Pressable style={styles.btnCancel} onPress={cancelExecution}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.btnRun} onPress={handleExecuteStep}>
                <MaterialIcons name="play-arrow" size={18} color="#FFF" />
                <Text style={styles.btnRunText}>Execute</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Workflow list
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { maxHeight: '70%' }]}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Workflows</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={20} color="#6B7280" />
            </Pressable>
          </View>
          {workflows.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialIcons name="account-tree" size={36} color="#333" />
              <Text style={styles.emptyText}>No workflows yet</Text>
              <Text style={styles.emptyHint}>
                Create workflows with multiple steps{'\n'}
                and {'{{variable}}'} placeholders
              </Text>
            </View>
          ) : (
            <FlatList
              data={workflows}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable style={styles.wfItem} onPress={() => handleStartWorkflow(item)}>
                  <View style={styles.wfInfo}>
                    <Text style={styles.wfName}>{item.name}</Text>
                    <Text style={styles.wfMeta}>
                      {item.steps.length} steps
                      {item.variables.length > 0 && ` | ${item.variables.length} vars`}
                      {item.useCount > 0 && ` | used ${item.useCount}x`}
                    </Text>
                  </View>
                  <MaterialIcons name="play-circle-outline" size={22} color={ACCENT} />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 11,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  stepCounter: {
    color: ACCENT,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
    marginBottom: 12,
  },
  cmdBox: {
    flexDirection: 'row',
    backgroundColor: '#0D0D0D',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 12,
  },
  cmdPrompt: {
    color: ACCENT,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  cmdText: {
    color: '#ECEDEE',
    fontFamily: 'monospace',
    fontSize: 13,
    flex: 1,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#1E1E1E',
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 2,
  },
  varRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  varLabel: {
    color: '#FBBF24',
    fontSize: 12,
    fontFamily: 'monospace',
    width: 100,
  },
  varInput: {
    flex: 1,
    color: '#ECEDEE',
    fontSize: 13,
    fontFamily: 'monospace',
    backgroundColor: '#0D0D0D',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
  },
  btnCancelText: {
    color: '#9BA1A6',
    fontSize: 14,
    fontWeight: '600',
  },
  btnRun: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnRunText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  wfItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  wfInfo: {
    flex: 1,
  },
  wfName: {
    color: '#ECEDEE',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  wfMeta: {
    color: '#4B5563',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  emptyHint: {
    color: '#4B5563',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
    lineHeight: 18,
  },
});
