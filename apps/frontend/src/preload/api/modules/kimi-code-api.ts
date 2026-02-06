/**
 * Kimi Code API for renderer process
 *
 * Provides access to Kimi Code CLI management:
 * - Check installed vs latest version
 * - Install or update Kimi Code
 */

import { IPC_CHANNELS } from '../../../shared/constants';
import type { KimiCodeVersionInfo } from '../../../shared/types/cli';
import { invokeIpc } from './ipc-utils';

/**
 * Result of Kimi Code installation attempt
 */
export interface KimiCodeInstallResult {
  success: boolean;
  data?: {
    command: string;
  };
  error?: string;
}

/**
 * Result of version check
 */
export interface KimiCodeVersionResult {
  success: boolean;
  data?: KimiCodeVersionInfo;
  error?: string;
}

/**
 * Kimi Code API interface exposed to renderer
 */
export interface KimiCodeAPI {
  /**
   * Check Kimi Code CLI version status
   * Returns installed version, latest version, and whether update is available
   */
  checkKimiCodeVersion: () => Promise<KimiCodeVersionResult>;

  /**
   * Install or update Kimi Code CLI
   * Opens the user's terminal with the install command
   */
  installKimiCode: () => Promise<KimiCodeInstallResult>;
}

/**
 * Creates the Kimi Code API implementation
 */
export const createKimiCodeAPI = (): KimiCodeAPI => ({
  checkKimiCodeVersion: (): Promise<KimiCodeVersionResult> =>
    invokeIpc(IPC_CHANNELS.KIMI_CODE_CHECK_VERSION),

  installKimiCode: (): Promise<KimiCodeInstallResult> =>
    invokeIpc(IPC_CHANNELS.KIMI_CODE_INSTALL)
});
