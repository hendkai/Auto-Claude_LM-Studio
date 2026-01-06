import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, GiteaSyncStatus, ProjectEnvConfig } from '../../../shared/types';
import { projectStore } from '../../project-store';

/**
 * Check Gitea connection status
 */
export function registerCheckConnection(): void {
    ipcMain.handle(
        IPC_CHANNELS.GITEA_CHECK_CONNECTION,
        async (_, projectId: string): Promise<IPCResult<GiteaSyncStatus>> => {
            const project = projectStore.getProject(projectId);
            if (!project) {
                return { success: false, error: 'Project not found' };
            }

            // Helper to get config (mirroring GitHub's getGitHubConfig logic)
            const getGiteaConfig = (proj: any) => {
                const env = proj.env || {};
                const config: Partial<ProjectEnvConfig> = env;
                if (config.giteaEnabled && config.giteaToken && config.giteaInstanceUrl && config.giteaRepo) {
                    return {
                        token: config.giteaToken,
                        instanceUrl: config.giteaInstanceUrl.replace(/\/$/, ''), // Remove trailing slash
                        repo: config.giteaRepo
                    };
                }
                return null;
            };

            const config = getGiteaConfig(project);

            if (!config) {
                return {
                    success: true,
                    data: {
                        connected: false,
                        error: 'No Gitea configuration found (url, token, repo)'
                    }
                };
            }

            try {
                const headers = {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/json'
                };

                const apiUrl = `${config.instanceUrl}/api/v1/repos/${config.repo}`;

                const response = await fetch(apiUrl, { headers });

                if (!response.ok) {
                    if (response.status === 401) throw new Error('Invalid Gitea token');
                    if (response.status === 404) throw new Error('Repository not found');
                    throw new Error(`Gitea API error: ${response.status} ${response.statusText}`);
                }

                const repoData = await response.json() as any;

                // Fetch open issues count
                // Gitea API: /repos/{owner}/{repo} returns open_issues_count directly usually, but let's verify if we need separate call
                // The repoData object usually has open_issues_count
                const openCount = repoData.open_issues_count ?? 0;

                return {
                    success: true,
                    data: {
                        connected: true,
                        repoFullName: repoData.full_name,
                        repoDescription: repoData.description,
                        issueCount: openCount,
                        lastSyncedAt: new Date().toISOString()
                    }
                };

            } catch (error) {
                return {
                    success: true,
                    data: {
                        connected: false,
                        error: error instanceof Error ? error.message : 'Failed to connect to Gitea'
                    }
                };
            }
        }
    );
}
