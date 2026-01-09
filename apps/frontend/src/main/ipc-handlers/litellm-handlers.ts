import { ipcMain } from 'electron';
import { getLiteLLMService, LiteLLMStatus } from '../services/litellm-service';
import type { IPCResult } from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/constants/ipc';

/**
 * Register LiteLLM service IPC handlers
 */
export function registerLiteLLMHandlers(): void {
  const service = getLiteLLMService();

  // Get current status
  ipcMain.handle(
    IPC_CHANNELS.LITELLM_GET_STATUS,
    async (): Promise<IPCResult<LiteLLMStatus>> => {
      try {
        const status = await service.getStatus();
        return { success: true, data: status };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Start LiteLLM
  ipcMain.handle(
    IPC_CHANNELS.LITELLM_START,
    async (): Promise<IPCResult<void>> => {
      try {
        await service.start();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start LiteLLM',
        };
      }
    }
  );

  // Stop LiteLLM
  ipcMain.handle(
    IPC_CHANNELS.LITELLM_STOP,
    async (): Promise<IPCResult<void>> => {
      try {
        await service.stop();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop LiteLLM',
        };
      }
    }
  );

  // Restart LiteLLM
  ipcMain.handle(
    IPC_CHANNELS.LITELLM_RESTART,
    async (): Promise<IPCResult<void>> => {
      try {
        await service.restart();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to restart LiteLLM',
        };
      }
    }
  );

  // Listen for service events and forward to renderer
  service.on('started', (data) => {
    // Could emit to renderer via webContents if needed
    console.log('[LiteLLM] Service started:', data);
  });

  service.on('stopped', (data) => {
    console.log('[LiteLLM] Service stopped:', data);
  });

  service.on('error', (error) => {
    console.error('[LiteLLM] Service error:', error);
  });

  console.log('[IPC] LiteLLM handlers registered');
}

