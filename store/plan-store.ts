/**
 * store/plan-store.ts — Plan Mode ステップカード状態管理
 *
 * activePlan: 現在表示中のプラン（メモリのみ）
 * planHistory: 過去のプラン（AsyncStorage永続化、最大20件）
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlanMessage, PlanStep, PlanStepStatus } from '@/lib/parse-plan';

const STORAGE_KEY = 'shelly_plan_history';
const MAX_HISTORY = 20;

type PlanStore = {
  activePlan: PlanMessage | null;
  planHistory: PlanMessage[];
  isLoaded: boolean;

  load: () => Promise<void>;
  setActivePlan: (plan: PlanMessage) => void;
  updateStepStatus: (planId: string, stepId: string, status: PlanStepStatus, output?: string) => void;
  clearActivePlan: () => void;
  archiveActivePlan: () => void;
};

export const usePlanStore = create<PlanStore>((set, get) => ({
  activePlan: null,
  planHistory: [],
  isLoaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const history = JSON.parse(raw) as PlanMessage[];
        set({ planHistory: history.slice(-MAX_HISTORY), isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  setActivePlan: (plan) => {
    set({ activePlan: plan });
  },

  updateStepStatus: (planId, stepId, status, output) => {
    set((state) => {
      if (!state.activePlan || state.activePlan.id !== planId) return state;
      const updatedSteps = state.activePlan.steps.map((step) =>
        step.id === stepId ? { ...step, status, output: output ?? step.output } : step,
      );
      return { activePlan: { ...state.activePlan, steps: updatedSteps } };
    });
  },

  clearActivePlan: () => {
    set({ activePlan: null });
  },

  archiveActivePlan: () => {
    const { activePlan, planHistory } = get();
    if (!activePlan) return;
    const updated = [...planHistory, activePlan].slice(-MAX_HISTORY);
    set({ activePlan: null, planHistory: updated });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },
}));
