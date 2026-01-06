import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  SDKRateLimitInfo,
  Task,
  TaskStatus,
  Project,
  ImplementationPlan
} from '../../shared/types';
import { AgentManager } from '../agent';
import type { ProcessType, ExecutionProgressData } from '../agent';
import { titleGenerator } from '../title-generator';
import { fileWatcher } from '../file-watcher';
import { projectStore } from '../project-store';
import { notificationService } from '../notification-service';
import { persistPlanStatus, persistPlanStatusSync, getPlanPath } from './task/plan-file-utils';


/**
 * Register all agent-events-related IPC handlers
 */
export function registerAgenteventsHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Agent Manager Events → Renderer
  // ============================================

  agentManager.on('log', (taskId: string, log: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_LOG, taskId, log);
    }
  });

  agentManager.on('error', (taskId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_ERROR, taskId, error);
    }
  });

  // Handle SDK rate limit events from agent manager
  agentManager.on('sdk-rate-limit', (rateLimitInfo: SDKRateLimitInfo) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_SDK_RATE_LIMIT, rateLimitInfo);
    }
  });

  // Handle SDK rate limit events from title generator
  titleGenerator.on('sdk-rate-limit', (rateLimitInfo: SDKRateLimitInfo) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_SDK_RATE_LIMIT, rateLimitInfo);
    }
  });

  agentManager.on('exit', (taskId: string, code: number | null, processType: ProcessType) => {
    // Wrap in setImmediate to prevent blocking the event loop
    // This allows the process exit event to complete quickly
    setImmediate(async () => {
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      try {
        // Send final plan state to renderer BEFORE unwatching
        // This ensures the renderer has the final subtask data (fixes 0/0 subtask bug)
        const finalPlan = fileWatcher.getCurrentPlan(taskId);
        if (finalPlan && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.TASK_PROGRESS, taskId, finalPlan);
        }

        // Await unwatch to ensure watcher is properly closed
        await fileWatcher.unwatch(taskId);

        if (processType === 'spec-creation') {
          console.warn(`[Task ${taskId}] Spec creation completed with code ${code}`);
          return;
        }

        let task: Task | undefined;
        let project: Project | undefined;

        const projects = projectStore.getProjects();

        for (const p of projects) {
          const tasks = projectStore.getTasks(p.id);
          task = tasks.find((t) => t.id === taskId || t.specId === taskId);
          if (task) {
            project = p;
            break;
          }
        }

        if (task && project) {
          const taskTitle = task.title || task.specId;
          const planPath = getPlanPath(project, task);

          // Use async persistPlanStatus to avoid blocking the event loop
          const persistStatus = async (status: TaskStatus) => {
            try {
              const persisted = await persistPlanStatus(planPath, status);
              if (persisted) {
                console.log(`[Task ${taskId}] Persisted status to plan: ${status}`);
              }
            } catch (err) {
              console.warn(`[Task ${taskId}] Failed to persist status:`, err);
            }
          };

          if (code === 0) {
            notificationService.notifyReviewNeeded(taskTitle, project.id, taskId);
            
            // Fallback: Ensure status is updated even if COMPLETE phase event was missed
            // This prevents tasks from getting stuck in ai_review status
            // Uses inverted logic to also handle tasks with no subtasks (treats them as complete)
            const isActiveStatus = task.status === 'in_progress' || task.status === 'ai_review';
            const hasIncompleteSubtasks = task.subtasks && task.subtasks.length > 0 && 
              task.subtasks.some((s) => s.status !== 'completed');
            
            if (isActiveStatus && !hasIncompleteSubtasks) {
              console.log(`[Task ${taskId}] Fallback: Moving to human_review (process exited successfully)`);
              // Fire and forget - don't block on file write
              void persistStatus('human_review');
              // Check if window is still available before sending
              if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send(
                  IPC_CHANNELS.TASK_STATUS_CHANGE,
                  taskId,
                  'human_review' as TaskStatus
                );
              }
            }
          } else {
            notificationService.notifyTaskFailed(taskTitle, project.id, taskId);
            // Fire and forget - don't block on file write
            void persistStatus('human_review');
            // Check if window is still available before sending
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send(
                IPC_CHANNELS.TASK_STATUS_CHANGE,
                taskId,
                'human_review' as TaskStatus
              );
            }
          }
        }
      } catch (error) {
        console.error(`[Task ${taskId}] Exit handler error:`, error);
      }
    });
  });

  agentManager.on('execution-progress', (taskId: string, progress: ExecutionProgressData) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    try {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, taskId, progress);

      const phaseToStatus: Record<string, TaskStatus | null> = {
        'idle': null,
        'planning': 'in_progress',
        'coding': 'in_progress',
        'qa_review': 'ai_review',
        'qa_fixing': 'ai_review',
        'complete': 'human_review',
        'failed': 'human_review'
      };

      const newStatus = phaseToStatus[progress.phase];
      if (newStatus) {
        // Check again before sending status change
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            newStatus
          );
        }

        // CRITICAL: Persist status to plan file to prevent flip-flop on task list refresh
        // When getTasks() is called, it reads status from the plan file. Without persisting,
        // the status in the file might differ from the UI, causing inconsistent state.
        // Uses shared utility with locking to prevent race conditions.
        // Fire and forget - don't block the event loop on file writes
        setImmediate(async () => {
          try {
            const projects = projectStore.getProjects();
            for (const p of projects) {
              const tasks = projectStore.getTasks(p.id);
              const task = tasks.find((t) => t.id === taskId || t.specId === taskId);
              if (task) {
                const planPath = getPlanPath(p, task);
                await persistPlanStatus(planPath, newStatus);
                break;
              }
            }
          } catch (err) {
            // Ignore persistence errors - UI will still work, just might flip on refresh
            console.warn('[execution-progress] Could not persist status:', err);
          }
        });
      }
    } catch (error) {
      console.error(`[execution-progress] Error handling progress for task ${taskId}:`, error);
    }
  });

  // ============================================
  // File Watcher Events → Renderer
  // ============================================

  fileWatcher.on('progress', (taskId: string, plan: ImplementationPlan) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_PROGRESS, taskId, plan);
    }
  });

  fileWatcher.on('error', (taskId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_ERROR, taskId, error);
    }
  });
}
