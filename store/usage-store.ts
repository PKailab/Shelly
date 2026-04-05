// store/usage-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UsageData, parseUsage, ReadFileFn, ListFilesFn } from '@/lib/usage-parser';

interface AlertSettings {
  alertEnabled: boolean;
  alertBlockThreshold: number;
  alertDailyCostLimit: number;
}

interface UsageState extends AlertSettings {
  usageData: UsageData | null;
  isLoading: boolean;
  error: string | null;
  isExpanded: boolean;
  lastAlertedDate: string | null;
  lastAlertedBlock: string | null;
}

interface UsageActions {
  refresh: (readFile: ReadFileFn, listFiles: ListFilesFn) => Promise<void>;
  forceRefresh: (readFile: ReadFileFn, listFiles: ListFilesFn) => Promise<void>;
  toggleExpanded: () => void;
  setAlertSettings: (s: Partial<AlertSettings>) => void;
  markAlerted: (type: 'daily' | 'block', id: string) => void;
}

const REFRESH_TTL_MS = 60_000;

export const useUsageStore = create<UsageState & UsageActions>()(
  persist(
    (set, get) => ({
      usageData: null,
      isLoading: false,
      error: null,
      isExpanded: false,
      alertEnabled: false,
      alertBlockThreshold: 80,
      alertDailyCostLimit: 10,
      lastAlertedDate: null,
      lastAlertedBlock: null,

      refresh: async (readFile, listFiles) => {
        const state = get();
        if (state.isLoading) return;
        if (state.usageData && Date.now() - state.usageData.lastUpdated < REFRESH_TTL_MS) return;

        set({ isLoading: true, error: null });
        try {
          const data = await parseUsage(readFile, listFiles);
          set({ usageData: data, isLoading: false });
        } catch (e: any) {
          set({ error: e.message || 'Failed to load usage', isLoading: false });
        }
      },

      forceRefresh: async (readFile, listFiles) => {
        const state = get();
        if (state.isLoading) return;
        set({ isLoading: true, error: null });
        try {
          const data = await parseUsage(readFile, listFiles);
          set({ usageData: data, isLoading: false });
        } catch (e: any) {
          set({ error: e.message || 'Failed to load usage', isLoading: false });
        }
      },

      toggleExpanded: () => set(s => ({ isExpanded: !s.isExpanded })),

      setAlertSettings: (s) => set(s),

      markAlerted: (type, id) => {
        if (type === 'daily') set({ lastAlertedDate: id });
        else set({ lastAlertedBlock: id });
      },
    }),
    {
      name: 'shelly-usage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        usageData: s.usageData,
        alertEnabled: s.alertEnabled,
        alertBlockThreshold: s.alertBlockThreshold,
        alertDailyCostLimit: s.alertDailyCostLimit,
        lastAlertedDate: s.lastAlertedDate,
        lastAlertedBlock: s.lastAlertedBlock,
      }),
    }
  )
);
