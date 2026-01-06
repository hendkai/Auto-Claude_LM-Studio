import { ipcRenderer } from 'electron';
import type { IPCResult } from '../../../shared/types/common';
import type { GiteaSyncStatus } from '../../../shared/types/integrations';

export interface GiteaAPI {
    checkGiteaConnection: (projectId: string) => Promise<IPCResult<GiteaSyncStatus>>;
}

export const createGiteaAPI = (): GiteaAPI => ({
    checkGiteaConnection: (projectId: string) => ipcRenderer.invoke('gitea:check-connection', projectId),
});
