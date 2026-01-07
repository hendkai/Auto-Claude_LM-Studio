import http from 'http';
import { AddressInfo } from 'net';
import { EventEmitter } from 'events';
import { projectStore } from '../project-store';
import { Task } from '../../shared/types';
import { logger } from '../app-logger';

interface TaskState {
    id: string;
    updatedAt: string;
}

export class SyncService extends EventEmitter {
    private server: http.Server;
    private port: number = 0;
    private isRunning = false;

    constructor() {
        super();
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
    }

    public async start(): Promise<number> {
        return new Promise((resolve, reject) => {
            // Listen on random port (0)
            this.server.listen(0, '0.0.0.0', () => {
                const address = this.server.address() as AddressInfo;
                this.port = address.port;
                this.isRunning = true;
                logger.info(`Sync service listening on port ${this.port}`);
                resolve(this.port);
            });

            this.server.on('error', (err) => {
                reject(err);
            });
        });
    }

    public stop() {
        if (this.isRunning) {
            this.server.close();
            this.isRunning = false;
        }
    }

    public getPort(): number {
        return this.port;
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const url = new URL(req.url || '', `http://${req.headers.host}`);

        // GET /state?projectId=...
        if (url.pathname === '/state' && req.method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            if (!projectId) {
                res.writeHead(400);
                res.end('Missing projectId');
                return;
            }

            try {
                const tasks = projectStore.getTasks(projectId);
                const state: TaskState[] = tasks.map(t => ({
                    id: t.id,
                    updatedAt: new Date(t.updatedAt).toISOString()
                }));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
            } catch (err) {
                res.writeHead(500);
                res.end(String(err));
            }
            return;
        }

        // GET /task/:id?projectId=...
        const taskMatch = url.pathname.match(/^\/task\/([^\/]+)$/);
        if (taskMatch && req.method === 'GET') {
            const taskId = taskMatch[1];
            const projectId = url.searchParams.get('projectId');

            if (!projectId) {
                res.writeHead(400);
                res.end('Missing projectId');
                return;
            }

            try {
                const tasks = projectStore.getTasks(projectId);
                const task = tasks.find(t => t.id === taskId);

                if (task) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(task));
                } else {
                    res.writeHead(404);
                    res.end('Task not found');
                }
            } catch (err) {
                res.writeHead(500);
                res.end(String(err));
            }
            return;
        }

        res.writeHead(404);
        res.end('Not found');
    }

    // Client methods

    public async syncWithPeer(peerIp: string, peerPort: number, projectId: string): Promise<void> {
        try {
            // 1. Get remote state
            const remoteState = await this.fetchJson<TaskState[]>(`http://${peerIp}:${peerPort}/state?projectId=${projectId}`);
            const localTasks = projectStore.getTasks(projectId);

            const tasksToPull: string[] = [];

            for (const remoteTask of remoteState) {
                const localTask = localTasks.find(t => t.id === remoteTask.id);

                if (!localTask) {
                    // New task
                    tasksToPull.push(remoteTask.id);
                } else {
                    // Compare timestamps
                    const localTime = new Date(localTask.updatedAt).getTime();
                    const remoteTime = new Date(remoteTask.updatedAt).getTime();

                    if (remoteTime > localTime) {
                        tasksToPull.push(remoteTask.id);
                    }
                }
            }

            logger.info(`Found ${tasksToPull.length} tasks to pull from ${peerIp}`);

            // 2. Pull tasks
            for (const taskId of tasksToPull) {
                await this.pullTask(peerIp, peerPort, projectId, taskId);
            }

        } catch (err) {
            logger.error(`Sync failed with ${peerIp}:`, err);
        }
    }

    private async pullTask(peerIp: string, peerPort: number, projectId: string, taskId: string) {
        try {
            const task = await this.fetchJson<Task>(`http://${peerIp}:${peerPort}/task/${taskId}?projectId=${projectId}`);

            // TODO: Save task to local store
            // We need to request `updateTask` or similar from IPC handlers or projectStore directly?
            // projectStore currently reads from disk. We need a way to WRITE.
            // The task handlers usually import 'fs' to write files.
            // See `task/crud-handlers.ts`. It writes to `implementation_plan.json` etc.

            // For now, I will emit an event and let the manager handle the saving,
            // or duplicate the saving logic here (less ideal).
            // Or better: Inject a save callback or import the saving logic.

            this.emit('task-received', { projectId, task });

        } catch (err) {
            logger.error(`Failed to pull task ${taskId}:`, err);
        }
    }

    private fetchJson<T>(url: string): Promise<T> {
        return new Promise((resolve, reject) => {
            http.get(url, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`Request failed with status ${res.statusCode}`));
                    return;
                }

                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }
}
