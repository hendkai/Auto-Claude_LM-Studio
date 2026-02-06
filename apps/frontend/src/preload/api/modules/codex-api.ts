/**
 * Codex API for renderer process
 *
 * Provides access to Codex CLI management:
 * - Check installed vs latest version
 * - Install or update Codex
 */

import { IPC_CHANNELS } from '../../../shared/constants';
import type { CodexVersionInfo } from '../../../shared/types/cli';
import { invokeIpc } from './ipc-utils';

/**
 * Result of Codex installation attempt
 */
export interface CodexInstallResult {
  success: boolean;
  data?: {
    command: string;
  };
  error?: string;
}

/**
 * Result of version check
 */
export interface CodexVersionResult {
  success: boolean;
  data?: CodexVersionInfo;
  error?: string;
}

/**
 * Codex API interface exposed to renderer
 */
export interface CodexAPI {
  /**
   * Check Codex CLI version status
   * Returns installed version, latest version, and whether update is available
   */
  checkCodexVersion: () => Promise<CodexVersionResult>;

  /**
   * Install or update Codex CLI
   * Opens the user's terminal with the install command
   */
  installCodex: () => Promise<CodexInstallResult>;
}

/**
 * Creates the Codex API implementation
 */
export const createCodexAPI = (): CodexAPI => ({
  checkCodexVersion: (): Promise<CodexVersionResult> =>
    invokeIpc(IPC_CHANNELS.CODEX_CHECK_VERSION),

  installCodex: (): Promise<CodexInstallResult> =>
    invokeIpc(IPC_CHANNELS.CODEX_INSTALL)
});
