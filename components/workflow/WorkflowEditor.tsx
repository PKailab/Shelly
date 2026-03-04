import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useWorkflowStore, type WorkflowStep } from '@/store/workflow-store';

const ACCENT = '#00D4AA';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function WorkflowEditor({ visible, onClose }: Props) {
  const { addWorkflow } = useWorkflowStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: 's-1', command: '' },
  ]);

  const handleAddStep = useCallback(() => {
    setSteps((prev) => [...prev, { id: `s-${Date.now()}`, command: '' }]);
  }, []);

  const handleRemoveStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleStepChange = useCallback((id: string, command: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, command } : s)),
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim() || steps.length === 0) return;
    const validSteps = steps.filter((s) => s.command.trim());
    if (validSteps.length === 0) return;
    addWorkflow({
      name: name.trim(),
      description: description.trim() || undefined,
      steps: validSteps,
    });
    // Reset
    setName('');
    setDescription('');
    setSteps([{ id: 's-1', command: '' }]);
    onClose();
  }, [name, description, steps, addWorkflow, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>New Workflow</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={20} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Docker Deploy"
              placeholderTextColor="#4B5563"
              selectionColor={ACCENT}
            />

            {/* Description */}
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="What this workflow does"
              placeholderTextColor="#4B5563"
              selectionColor={ACCENT}
            />

            {/* Steps */}
            <Text style={styles.label}>Steps</Text>
            <Text style={styles.hint}>
              Use {'{{varName}}'} for variable placeholders
            </Text>

            {steps.map((step, i) => (
              <View key={step.id} style={styles.stepRow}>
                <Text style={styles.stepNum}>{i + 1}</Text>
                <TextInput
                  style={styles.stepInput}
                  value={step.command}
                  onChangeText={(t) => handleStepChange(step.id, t)}
                  placeholder={`e.g. docker build -t {{name}} .`}
                  placeholderTextColor="#4B5563"
                  selectionColor={ACCENT}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {steps.length > 1 && (
                  <Pressable onPress={() => handleRemoveStep(step.id)} hitSlop={6}>
                    <MaterialIcons name="remove-circle-outline" size={18} color="#F87171" />
                  </Pressable>
                )}
              </View>
            ))}

            <Pressable style={styles.addStepBtn} onPress={handleAddStep}>
              <MaterialIcons name="add" size={16} color={ACCENT} />
              <Text style={styles.addStepText}>Add Step</Text>
            </Pressable>
          </ScrollView>

          {/* Save */}
          <Pressable
            style={[styles.saveBtn, (!name.trim() || steps.every((s) => !s.command.trim())) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!name.trim() || steps.every((s) => !s.command.trim())}
          >
            <MaterialIcons name="save" size={18} color="#FFF" />
            <Text style={styles.saveBtnText}>Save Workflow</Text>
          </Pressable>
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
    maxWidth: 460,
    maxHeight: '80%',
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
  scroll: {
    maxHeight: 350,
  },
  label: {
    color: '#9BA1A6',
    fontSize: 11,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  hint: {
    color: '#4B5563',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  input: {
    color: '#ECEDEE',
    fontSize: 13,
    fontFamily: 'monospace',
    backgroundColor: '#0D0D0D',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  stepNum: {
    color: '#4B5563',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  stepInput: {
    flex: 1,
    color: '#ECEDEE',
    fontSize: 13,
    fontFamily: 'monospace',
    backgroundColor: '#0D0D0D',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  addStepText: {
    color: ACCENT,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 14,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
