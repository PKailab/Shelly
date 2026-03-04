import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'shelly-workflows';

export type WorkflowStep = {
  id: string;
  command: string; // May contain {{varName}} placeholders
  label?: string;
};

export type Workflow = {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  variables: string[]; // Extracted placeholder names
  createdAt: number;
  lastUsedAt?: number;
  useCount: number;
};

type WorkflowExecution = {
  workflowId: string;
  currentStep: number;
  totalSteps: number;
  variables: Record<string, string>;
  isRunning: boolean;
};

type WorkflowState = {
  workflows: Workflow[];
  execution: WorkflowExecution | null;
};

type WorkflowActions = {
  addWorkflow: (wf: Omit<Workflow, 'id' | 'createdAt' | 'useCount' | 'variables'>) => void;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void;
  deleteWorkflow: (id: string) => void;
  loadWorkflows: () => Promise<void>;
  startExecution: (workflowId: string, variables: Record<string, string>) => void;
  advanceStep: () => void;
  cancelExecution: () => void;
  getResolvedCommand: () => string | null;
};

/** Extract {{varName}} placeholders from all steps */
function extractVariables(steps: WorkflowStep[]): string[] {
  const vars = new Set<string>();
  for (const step of steps) {
    const matches = step.command.matchAll(/\{\{(\w+)\}\}/g);
    for (const m of matches) vars.add(m[1]);
  }
  return [...vars];
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>(
  (set, get) => ({
    workflows: [],
    execution: null,

    addWorkflow: (wf) => {
      const variables = extractVariables(wf.steps);
      const workflow: Workflow = {
        ...wf,
        id: `wf-${Date.now()}`,
        createdAt: Date.now(),
        useCount: 0,
        variables,
      };
      const next = [...get().workflows, workflow];
      set({ workflows: next });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },

    updateWorkflow: (id, updates) => {
      const next = get().workflows.map((w) => {
        if (w.id !== id) return w;
        const updated = { ...w, ...updates };
        if (updates.steps) {
          updated.variables = extractVariables(updates.steps);
        }
        return updated;
      });
      set({ workflows: next });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },

    deleteWorkflow: (id) => {
      const next = get().workflows.filter((w) => w.id !== id);
      set({ workflows: next });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },

    loadWorkflows: async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) set({ workflows: JSON.parse(raw) });
      } catch {}
    },

    startExecution: (workflowId, variables) => {
      const wf = get().workflows.find((w) => w.id === workflowId);
      if (!wf) return;
      // Update usage stats
      get().updateWorkflow(workflowId, {
        lastUsedAt: Date.now(),
        useCount: wf.useCount + 1,
      });
      set({
        execution: {
          workflowId,
          currentStep: 0,
          totalSteps: wf.steps.length,
          variables,
          isRunning: true,
        },
      });
    },

    advanceStep: () => {
      const { execution } = get();
      if (!execution) return;
      const nextStep = execution.currentStep + 1;
      if (nextStep >= execution.totalSteps) {
        set({ execution: null });
      } else {
        set({
          execution: { ...execution, currentStep: nextStep },
        });
      }
    },

    cancelExecution: () => {
      set({ execution: null });
    },

    getResolvedCommand: () => {
      const { execution, workflows } = get();
      if (!execution) return null;
      const wf = workflows.find((w) => w.id === execution.workflowId);
      if (!wf) return null;
      const step = wf.steps[execution.currentStep];
      if (!step) return null;
      let cmd = step.command;
      for (const [key, val] of Object.entries(execution.variables)) {
        cmd = cmd.replaceAll(`{{${key}}}`, val);
      }
      return cmd;
    },
  }),
);
