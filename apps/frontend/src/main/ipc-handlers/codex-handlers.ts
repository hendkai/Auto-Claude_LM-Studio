/**
 * Codex CLI Handlers
 *
 * IPC handlers for Codex CLI version checking and installation.
 * Provides functionality to:
 * - Check installed vs latest version
 * - Open terminal with installation command
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipc';
import type { IPCResult } from '../../shared/types';
import type { CodexVersionInfo } from '../../shared/types/cli';
import { getToolInfoAsync } from '../cli-tool-manager';
import semver from 'semver';
import { openTerminalWithCommand } from './claude-code-handlers';

// Cache for latest version (avoid hammering npm registry)
let cachedLatestVersion: { version: string; timestamp: number } | null = null;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch the latest version of Codex from npm registry
 */
async function fetchLatestVersion(): Promise<string> {
  // Check cache first
  if (cachedLatestVersion && Date.now() - cachedLatestVersion.timestamp < CACHE_DURATION_MS) {
    return cachedLatestVersion.version;
  }

  try {
    const response = await fetch('https://registry.npmjs.org/@openai/codex/latest', {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const version = data.version;

    if (!version || typeof version !== 'string') {
      throw new Error('Invalid version format from npm registry');
    }

    // Cache the result
    cachedLatestVersion = { version, timestamp: Date.now() };
    return version;
  } catch (error) {
    console.error('[Codex] Failed to fetch latest version:', error);
    // Return cached version if available, even if expired
    if (cachedLatestVersion) {
      return cachedLatestVersion.version;
    }
    throw error;
  }
}

/**
 * Get the platform-specific install command for Codex
 * @param isUpdate - If true, Codex is already installed and we just need to update
 */
function getInstallCommand(isUpdate: boolean): string {
  if (isUpdate) {
    return 'npm update -g @openai/codex';
  }
  return 'npm install -g @openai/codex';
}

/**
 * Register Codex IPC handlers
 */
export function registerCodexHandlers(): void {
  // Check Codex version
  ipcMain.handle(
    IPC_CHANNELS.CODEX_CHECK_VERSION,
    async (): Promise<IPCResult<CodexVersionInfo>> => {
      try {
        console.log('[Codex] Checking version...');

        // Get installed version via cli-tool-manager
        let detectionResult;
        try {
          detectionResult = await getToolInfoAsync('codex');
          console.log('[Codex] Detection result:', JSON.stringify(detectionResult, null, 2));
        } catch (detectionError) {
          console.error('[Codex] Detection error:', detectionError);
          throw new Error(`Detection failed: ${detectionError instanceof Error ? detectionError.message : 'Unknown error'}`);
        }

        const installed = detectionResult.found ? detectionResult.version || null : null;
        console.log('[Codex] Installed version:', installed);

        // Fetch latest version from npm
        let latest: string;
        try {
          console.log('[Codex] Fetching latest version from npm...');
          latest = await fetchLatestVersion();
          console.log('[Codex] Latest version:', latest);
        } catch (error) {
          console.warn('[Codex] Failed to fetch latest version, continuing with unknown:', error);
          // If we can't fetch latest, still return installed info
          return {
            success: true,
            data: {
              installed,
              latest: 'unknown',
              isOutdated: false,
              path: detectionResult.path,
              detectionResult,
            },
          };
        }

        // Compare versions
        let isOutdated = false;
        if (installed && latest !== 'unknown') {
          try {
            // Clean version strings (remove 'v' prefix if present)
            const cleanInstalled = installed.replace(/^v/, '');
            const cleanLatest = latest.replace(/^v/, '');
            isOutdated = semver.lt(cleanInstalled, cleanLatest);
          } catch {
            // If semver comparison fails, assume not outdated
            isOutdated = false;
          }
        }

        console.log('[Codex] Check complete:', { installed, latest, isOutdated });
        return {
          success: true,
          data: {
            installed,
            latest,
            isOutdated,
            path: detectionResult.path,
            detectionResult,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Codex] Check failed:', errorMsg, error);
        return {
          success: false,
          error: `Failed to check Codex version: ${errorMsg}`,
        };
      }
    }
  );

  // Install Codex (open terminal with install command)
  ipcMain.handle(
    IPC_CHANNELS.CODEX_INSTALL,
    async (): Promise<IPCResult<{ command: string }>> => {
      try {
        // Check if Codex is already installed to determine if this is an update
        let isUpdate = false;
        try {
          const detectionResult = await getToolInfoAsync('codex');
          isUpdate = detectionResult.found && !!detectionResult.version;
          console.log('[Codex] Is update:', isUpdate, 'detected version:', detectionResult.version);
        } catch {
          // Detection failed, assume fresh install
          isUpdate = false;
        }

        const command = getInstallCommand(isUpdate);
        console.log('[Codex] Install command:', command);
        console.log('[Codex] Opening terminal...');
        await openTerminalWithCommand(command);
        console.log('[Codex] Terminal opened successfully');

        return {
          success: true,
          data: { command },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Codex] Install failed:', errorMsg, error);
        return {
          success: false,
          error: `Failed to open terminal for installation: ${errorMsg}`,
        };
      }
    }
  );

  console.warn('[IPC] Codex handlers registered');
}
