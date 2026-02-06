/**
 * Kimi Code CLI Handlers
 *
 * IPC handlers for Kimi Code CLI version checking and installation.
 * Provides functionality to:
 * - Check installed vs latest version
 * - Open terminal with installation command
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipc';
import type { IPCResult } from '../../shared/types';
import type { KimiCodeVersionInfo } from '../../shared/types/cli';
import { getToolInfoAsync } from '../cli-tool-manager';
import semver from 'semver';
import { openTerminalWithCommand } from './claude-code-handlers';

// Cache for latest version (avoid hammering GitHub API)
let cachedLatestVersion: { version: string; timestamp: number } | null = null;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch the latest version of Kimi Code from GitHub releases
 */
async function fetchLatestVersion(): Promise<string> {
  // Check cache first
  if (cachedLatestVersion && Date.now() - cachedLatestVersion.timestamp < CACHE_DURATION_MS) {
    return cachedLatestVersion.version;
  }

  try {
    // Try to get the latest release from GitHub
    const response = await fetch('https://api.github.com/repos/MoonshotAI/kimi-cli/releases/latest', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Auto-Claude-App',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    // GitHub returns tag_name like "v1.0.0", remove the 'v' prefix
    const version = data.tag_name?.replace(/^v/, '');

    if (!version || typeof version !== 'string') {
      throw new Error('Invalid version format from GitHub API');
    }

    // Cache the result
    cachedLatestVersion = { version, timestamp: Date.now() };
    return version;
  } catch (error) {
    console.error('[Kimi Code] Failed to fetch latest version:', error);
    // Return cached version if available, even if expired
    if (cachedLatestVersion) {
      return cachedLatestVersion.version;
    }
    // Return unknown if we can't fetch
    return 'unknown';
  }
}

/**
 * Get the platform-specific install command for Kimi Code
 * Kimi Code is installed via curl/bash script from code.kimi.com
 * @param isUpdate - If true, Kimi is already installed and we just need to update
 */
function getInstallCommand(_isUpdate: boolean): string {
  if (process.platform === 'win32') {
    // Windows - use PowerShell
    return 'irm code.kimi.com/install.ps1 | iex';
  } else {
    // macOS/Linux - use bash
    return 'curl -L code.kimi.com/install.sh | bash';
  }
}

/**
 * Register Kimi Code IPC handlers
 */
export function registerKimiCodeHandlers(): void {
  // Check Kimi Code version
  ipcMain.handle(
    IPC_CHANNELS.KIMI_CODE_CHECK_VERSION,
    async (): Promise<IPCResult<KimiCodeVersionInfo>> => {
      try {
        console.log('[Kimi Code] Checking version...');

        // Get installed version via cli-tool-manager
        let detectionResult;
        try {
          detectionResult = await getToolInfoAsync('kimi');
          console.log('[Kimi Code] Detection result:', JSON.stringify(detectionResult, null, 2));
        } catch (detectionError) {
          console.error('[Kimi Code] Detection error:', detectionError);
          throw new Error(`Detection failed: ${detectionError instanceof Error ? detectionError.message : 'Unknown error'}`);
        }

        const installed = detectionResult.found ? detectionResult.version || null : null;
        console.log('[Kimi Code] Installed version:', installed);

        // Fetch latest version from npm
        let latest: string;
        try {
          console.log('[Kimi Code] Fetching latest version from npm...');
          latest = await fetchLatestVersion();
          console.log('[Kimi Code] Latest version:', latest);
        } catch (error) {
          console.warn('[Kimi Code] Failed to fetch latest version, continuing with unknown:', error);
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

        console.log('[Kimi Code] Check complete:', { installed, latest, isOutdated });
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
        console.error('[Kimi Code] Check failed:', errorMsg, error);
        return {
          success: false,
          error: `Failed to check Kimi Code version: ${errorMsg}`,
        };
      }
    }
  );

  // Install Kimi Code (open terminal with install command)
  ipcMain.handle(
    IPC_CHANNELS.KIMI_CODE_INSTALL,
    async (): Promise<IPCResult<{ command: string }>> => {
      try {
        // Check if Kimi is already installed to determine if this is an update
        let isUpdate = false;
        try {
          const detectionResult = await getToolInfoAsync('kimi');
          isUpdate = detectionResult.found && !!detectionResult.version;
          console.log('[Kimi Code] Is update:', isUpdate, 'detected version:', detectionResult.version);
        } catch {
          // Detection failed, assume fresh install
          isUpdate = false;
        }

        const command = getInstallCommand(isUpdate);
        console.log('[Kimi Code] Install command:', command);
        console.log('[Kimi Code] Opening terminal...');
        await openTerminalWithCommand(command);
        console.log('[Kimi Code] Terminal opened successfully');

        return {
          success: true,
          data: { command },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Kimi Code] Install failed:', errorMsg, error);
        return {
          success: false,
          error: `Failed to open terminal for installation: ${errorMsg}`,
        };
      }
    }
  );

  console.warn('[IPC] Kimi Code handlers registered');
}
