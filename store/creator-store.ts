/**
 * store/creator-store.ts
 *
 * Zustand store for the Creator Engine.
 * Manages the lifecycle of a Creator session:
 *   idle → planning → confirming → building → done / error
 *
 * Persists project history to AsyncStorage.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CreatorProject,
  CreatorSessionStatus,
  BuildStep,
} from './types';
import {
  createProject,
  buildCompletionMessage,
  buildRecipeCommand,
} from '@/lib/creator-engine';

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'shelly_creator_projects';

// ─── Store type ───────────────────────────────────────────────────────────────

type CreatorState = {
  // Session state
  sessionStatus: CreatorSessionStatus;
  currentProject: CreatorProject | null;
  errorMessage: string | null;

  // Project history (persisted)
  projects: CreatorProject[];
  isLoaded: boolean;

  // Actions
  startPlanning: (userInput: string) => void;
  confirmPlan: () => void;
  cancelSession: () => void;
  resetSession: () => void;

  /** Advance a build step to 'running' then 'done' */
  advanceBuildStep: (stepId: string, status: BuildStep['status']) => void;

  /** Update a build step message (for real-time progress from Termux) */
  updateBuildStepMessage: (stepId: string, message: string) => void;

  /** Mark the current project as done and save to history */
  finishProject: (termuxPath?: string) => Promise<void>;

  /** Mark the current project as errored */
  failProject: (message: string) => void;

  /** Load project history from AsyncStorage */
  loadProjects: () => Promise<void>;

  /** Delete a project from history */
  deleteProject: (projectId: string) => Promise<void>;

  /** Get the completion message for the current project */
  getCompletionMessage: () => string;

  /** Get the recipe command for the current project */
  getRecipeCommand: () => string;

  /** Clone a project from history as a new session */
  cloneProject: (projectId: string) => void;

  /** Update tags on a project and persist */
  updateProjectTags: (projectId: string, tags: string[]) => Promise<void>;

  /** Touch a project's lastOpenedAt and persist */
  touchProject: (projectId: string) => Promise<void>;

  /** Replace the entire project list (used by Import) */
  setProjects: (projects: CreatorProject[]) => Promise<void>;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCreatorStore = create<CreatorState>((set, get) => ({
  sessionStatus: 'idle',
  currentProject: null,
  errorMessage: null,
  projects: [],
  isLoaded: false,

  // ── startPlanning ────────────────────────────────────────────────────────────

  startPlanning: (userInput: string) => {
    if (!userInput.trim()) return;

    set({ sessionStatus: 'planning', errorMessage: null });

    // Simulate a brief "thinking" delay (feels more natural)
    setTimeout(() => {
      try {
        const project = createProject(userInput);
        set({
          currentProject: project,
          sessionStatus: 'confirming',
        });
      } catch (e) {
        set({
          sessionStatus: 'error',
          errorMessage: 'プランの生成に失敗しました。もう一度試してみてね。',
        });
      }
    }, 600);
  },

  // ── confirmPlan ──────────────────────────────────────────────────────────────

  confirmPlan: () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ sessionStatus: 'building' });
  },

  // ── cancelSession ────────────────────────────────────────────────────────────

  cancelSession: () => {
    set({
      sessionStatus: 'idle',
      currentProject: null,
      errorMessage: null,
    });
  },

  // ── resetSession ─────────────────────────────────────────────────────────────

  resetSession: () => {
    set({
      sessionStatus: 'idle',
      currentProject: null,
      errorMessage: null,
    });
  },

  // ── advanceBuildStep ─────────────────────────────────────────────────────────

  advanceBuildStep: (stepId: string, status: BuildStep['status']) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedSteps = currentProject.buildSteps.map((step) =>
      step.id === stepId ? { ...step, status } : step
    );

    set({
      currentProject: {
        ...currentProject,
        buildSteps: updatedSteps,
      },
    });
  },

  // ── finishProject ────────────────────────────────────────────────────────────

  finishProject: async (termuxPath?: string) => {
    const { currentProject, projects } = get();
    if (!currentProject) return;

    const finished: CreatorProject = {
      ...currentProject,
      status: 'done',
      ...(termuxPath ? { path: termuxPath } : {}),
    };

    const updatedProjects = [finished, ...projects].slice(0, 50); // keep last 50

    set({
      currentProject: finished,
      sessionStatus: 'done',
      projects: updatedProjects,
    });

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
    } catch {
      // Storage failure is non-fatal
    }
  },

  // ── failProject ──────────────────────────────────────────────────────────────

  failProject: (message: string) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({
      currentProject: { ...currentProject, status: 'error' },
      sessionStatus: 'error',
      errorMessage: message,
    });
  },

  // ── loadProjects ─────────────────────────────────────────────────────────────

  loadProjects: async () => {
    if (get().isLoaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CreatorProject[];
        set({ projects: parsed, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  // ── deleteProject ────────────────────────────────────────────────────────────

  deleteProject: async (projectId: string) => {
    const updated = get().projects.filter((p) => p.id !== projectId);
    set({ projects: updated });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // non-fatal
    }
  },

  // ── getCompletionMessage ─────────────────────────────────────────────────────

  getCompletionMessage: () => {
    const { currentProject } = get();
    if (!currentProject) return '';
    return buildCompletionMessage(currentProject);
  },

  // ── getRecipeCommand ─────────────────────────────────────────────────────────

  getRecipeCommand: () => {
    const { currentProject } = get();
    if (!currentProject) return '';
    return buildRecipeCommand(currentProject);
  },

  // ── updateBuildStepMessage ───────────────────────────────────────────────────

  updateBuildStepMessage: (stepId: string, message: string) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const updatedSteps = currentProject.buildSteps.map((step) =>
      step.id === stepId ? { ...step, message } : step
    );
    set({ currentProject: { ...currentProject, buildSteps: updatedSteps } });
  },

   // ── cloneProject ─────────────────────────────────────────────────────────────

  cloneProject: (projectId: string) => {
    const { projects } = get();
    const source = projects.find((p) => p.id === projectId);
    if (!source) return;
    // Re-run planning with the same user input
    get().startPlanning(source.userInput);
  },

  // ── updateProjectTags ────────────────────────────────────────────────────────

  updateProjectTags: async (projectId: string, tags: string[]) => {
    const updated = get().projects.map((p) =>
      p.id === projectId ? { ...p, tags } : p
    );
    set({ projects: updated });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // non-fatal
    }
  },

  // ── touchProject ─────────────────────────────────────────────────────────────

  touchProject: async (projectId: string) => {
    const now = Date.now();
    const updated = get().projects.map((p) =>
      p.id === projectId ? { ...p, lastOpenedAt: now } : p
    );
    set({ projects: updated });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // non-fatal
    }
  },

  // ── setProjects ──────────────────────────────────────────────────────────────

  setProjects: async (projects: CreatorProject[]) => {
    set({ projects });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {
      // non-fatal
    }
  },
}));

