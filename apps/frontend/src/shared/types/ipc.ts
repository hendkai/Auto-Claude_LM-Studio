/**
 * IPC (Inter-Process Communication) bridge types.
 *
 * The canonical Electron API surface is defined in `src/preload/api/index.ts`.
 * This file re-exports the preload type for renderer/shared consumers and keeps
 * commonly shared IPC-only helper types in one place.
 */

import type { ElectronAPI as PreloadElectronAPI } from '../../preload/api';

/**
 * Branch type indicator for distinguishing local from remote branches.
 */
export type GitBranchType = 'local' | 'remote';

/**
 * Structured branch information used by branch-selection UIs.
 */
export interface GitBranchDetail {
  name: string;
  type: GitBranchType;
  displayName: string;
  isCurrent?: boolean;
}

/**
 * Persisted tab state for project tabs.
 */
export interface TabState {
  openProjectIds: string[];
  activeProjectId: string | null;
  tabOrder: string[];
}

/**
 * Electron API exposed to the renderer via contextBridge.
 */
export type ElectronAPI = PreloadElectronAPI;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    DEBUG: boolean;
  }
}

