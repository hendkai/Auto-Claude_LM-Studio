import { NetworkDiscovery } from './network-discovery';
import { SyncService } from './sync-service';
import { projectStore } from '../project-store';
import { ipcMain } from 'electron';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { AUTO_BUILD_PATHS, getSpecsDir } from '../../shared/constants';
import { Task } from '../../shared/types';
import { logger } from '../app-logger';

export class NetworkSyncManager {
    private discovery: NetworkDiscovery;
    private sync: SyncService;
    private isEnabled = false;

    constructor() {
        this.sync = new SyncService();

        // Discovery will be initialized after sync starts (to get the port)
        // Placeholder
        this.discovery = null as any;
    }

    public async init() {
        try {
            const port = await this.sync.start();
            this.discovery = new NetworkDiscovery(port);

            this.setupListeners();
            this.registerIpcHandlers();

            // Default to enabled or check settings?
            // For now, let's wait for explicit enable via IPC or setting
            // But for testing, we might want it on.
            // Let's check a setting ?
            // this.setEnabled(true);
        } catch (err) {
            logger.error('Failed to init NetworkSyncManager', err);
        }
    }

    public stop() {
        if (!this.isEnabled) return;
        this.isEnabled = false;

        // Stop discovery
        if (this.discovery) {
            this.discovery.stop();
        }

        // Stop sync service
        if (this.sync) {
            this.sync.stop();
        }

        logger.info('Network sync stopped');
    }

    private setupListeners() {
        this.discovery.on('peer-discovered', (peer) => {
            logger.info('Peer discovered, triggering sync:', peer.hostname);
            // Automatically sync with new peer
            // Iterate all open projects? 
            // For MVP, we need to know which projectId to sync.
            // We can broadcast the projectId in HELLO message? 
            // Or just iterate all loaded projects in projectStore.

            const projects = projectStore.getProjects();
            for (const project of projects) {
                this.sync.syncWithPeer(peer.ip, peer.port, project.id);
            }
        });

        this.sync.on('task-received', async ({ projectId, task }: { projectId: string; task: Task }) => {
            logger.info(`Received task update for ${task.id} in project ${projectId}`);
            await this.saveTaskToDisk(projectId, task);
        });
    }

    private registerIpcHandlers() {
        ipcMain.handle('network:get-peers', () => {
            return this.discovery ? this.discovery.getPeers() : [];
        });

        ipcMain.handle('network:get-enabled', () => {
            return this.isEnabled;
        });

        ipcMain.handle('network:set-enabled', (_, enabled: boolean) => {
            this.setEnabled(enabled);
            return true;
        });

        ipcMain.handle('network:trigger-sync', async () => {
            if (!this.discovery) return 0;
            const peers = this.discovery.getPeers();
            const projects = projectStore.getProjects();

            for (const peer of peers) {
                for (const project of projects) {
                    this.sync.syncWithPeer(peer.ip, peer.port, project.id);
                }
            }
            return peers.length;
        });
    }

    public setEnabled(enabled: boolean) {
        if (this.isEnabled === enabled) return;

        this.isEnabled = enabled;
        if (enabled) {
            this.discovery.start();
            logger.info('Network sync enabled');
        } else {
            this.discovery.stop();
            logger.info('Network sync disabled');
        }
    }

    private async saveTaskToDisk(projectId: string, task: Task) {
        const project = projectStore.getProject(projectId);
        if (!project) return;

        const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const specDir = path.join(project.path, specsBaseDir, task.specId);

        // Create directory if not exists
        if (!existsSync(specDir)) {
            mkdirSync(specDir, { recursive: true });
        }

        // 1. Save implementation_plan.json
        // We need to reconstruct it from task data if we don't have the raw file content.
        // SyncService currently transfers the Task object.

        // Construct plan
        const plan = {
            feature: task.title,
            description: task.description,
            created_at: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt,
            updated_at: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt,
            status: 'pending', // TODO: Map task status to plan status?
            phases: [] // We lose subtasks details if we don't sync the full plan JSON structure...
            // Wait, Task object has subtasks!
        };

        // Ideally we should sync the raw implementation_plan.json content.
        // But for now, let's update what we can.
        // If the task exists locally, read it to preserve other fields?

        // Reconstructing subtasks to phases is hard if we flat-mapped them.
        // IMPORTANT: The SyncService should probably transfer the raw plan content too?
        // But let's stick to updating status/title/desc for now.

        const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
        let existingPlan: any = {};
        if (existsSync(planPath)) {
            try {
                existingPlan = JSON.parse(require('fs').readFileSync(planPath, 'utf-8'));
            } catch (e) { }
        }

        const newPlan = {
            ...existingPlan,
            feature: task.title,
            description: task.description,
            updated_at: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt
            // We are NOT syncing subtasks back to phases here because `task.subtasks` structure 
            // in `Task` type is a flat list, but `implementation_plan.json` has phases.
            // Losing phase structure would be bad.
            // For simple sync, maybe we just sync Title/Description/Status?
        };

        writeFileSync(planPath, JSON.stringify(newPlan, null, 2));

        // 2. Save task_metadata.json
        if (task.metadata) {
            const metadataPath = path.join(specDir, 'task_metadata.json');
            writeFileSync(metadataPath, JSON.stringify(task.metadata, null, 2));
        }

        // 3. Save requirements.json (basic)
        const reqPath = path.join(specDir, 'requirements.json');
        if (!existsSync(reqPath)) {
            const req = {
                task_description: task.description,
                workflow_type: task.metadata?.category || 'feature'
            };
            writeFileSync(reqPath, JSON.stringify(req, null, 2));
        }

        // Invalidate cache
        projectStore.invalidateTasksCache(projectId);
        logger.info(`Persisted task ${task.id} to disk`);
    }
}

export const networkSyncManager = new NetworkSyncManager();
