/**
 * Gitea Handlers Entry Point
 */

import type { BrowserWindow } from 'electron';
import type { AgentManager } from '../agent';
import { registerGiteaHandlers as registerHandlers } from './gitea/index';

export const registerGiteaHandlers = (
    agentManager: AgentManager,
    getMainWindow: () => BrowserWindow | null
) => {
    // Currently Gitea handlers don't need agentManager or MainWindow but matching signature for consistency
    registerHandlers();
};
