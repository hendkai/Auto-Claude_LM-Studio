import type { BrowserWindow } from 'electron';
import path from 'path';
import { existsSync } from 'fs';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir } from '../../shared/constants';
import { wouldPhaseRegress, isTerminalPhase, isValidExecutionPhase, type ExecutionPhase } from '../../shared/constants/phase-protocol';
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
import { persistPlanStatus, getPlanPath } from './task/plan-file-utils';
import { findTaskWorktree } from '../worktree-paths';
import { findTaskAndProject } from './task/shared';


/**
 * Validates status transitions to prevent invalid state changes.
 * FIX (ACS-55, ACS-71): Adds guardrails against bad status transitions.
 * FIX (PR Review): Uses comprehensive wouldPhaseRegress() utility instead of hardcoded checks.
 *
 * @param task - The current task (may be undefined if not found)
 * @param newStatus - The proposed new status
 * @param phase - The execution phase that triggered this transition
 * @returns true if transition is valid, false if it should be blocked
 */
function validateStatusTransition(
  task: Task | undefined,
  newStatus: TaskStatus,
  phase: string
): boolean {
  // Can't validate without task data - allow the transition
  if (!task) return true;

  // Don't allow human_review without subtasks
  // This prevents tasks from jumping to review before planning is complete
  if (newStatus === 'human_review' && (!task.subtasks || task.subtasks.length === 0)) {
    console.warn(`[validateStatusTransition] Blocking human_review - task ${task.id} has no subtasks (phase: ${phase})`);
    return false;
  }

  // FIX (PR Review): Use comprehensive phase regression check instead of hardcoded checks
  // This handles all phase regressions (qa_review→coding, complete→coding, etc.)
  // not just the specific coding→planning case
  const currentPhase = task.executionProgress?.phase;
  if (currentPhase && isValidExecutionPhase(currentPhase) && isValidExecutionPhase(phase)) {
    // Block transitions from terminal phases (complete/failed)
    if (isTerminalPhase(currentPhase)) {
      console.warn(`[validateStatusTransition] Blocking transition from terminal phase: ${currentPhase} for task ${task.id}`);
      return false;
    }

    // Block any phase regression (going backwards in the workflow)
    // Note: Cast phase to ExecutionPhase since isValidExecutionPhase() type guard doesn't narrow through function calls
    if (wouldPhaseRegress(currentPhase, phase as ExecutionPhase)) {
      console.warn(`[validateStatusTransition] Blocking phase regression: ${currentPhase} -> ${phase} for task ${task.id}`);
      return false;
    }
  }

  return true;
}


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

  // Cache last persisted status to debounce updates and prevent IO saturation
  const lastTaskStatus = new Map<string, TaskStatus>();

  agentManager.on('log', (taskId: string, log: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Include projectId for multi-project filtering (issue #723)
      const { project } = findTaskAndProject(taskId);
      mainWindow.webContents.send(IPC_CHANNELS.TASK_LOG, taskId, log, project?.id);
    }
  });

  agentManager.on('error', (taskId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Include projectId for multi-project filtering (issue #723)
      const { project } = findTaskAndProject(taskId);
      mainWindow.webContents.send(IPC_CHANNELS.TASK_ERROR, taskId, error, project?.id);
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

  agentManager.on('exit', async (taskId: string, code: number | null, processType: ProcessType) => {
    // Check if we should ignore this exit event (e.g. manual stop during status update)
    if (agentManager.shouldIgnoreExit(taskId)) {
      console.log(`[Task ${taskId}] Ignoring exit event as requested (manual stop)`);
      // Reset the flag immediately as it's a one-time suppression
      agentManager.setIgnoreExit(taskId, false);
      return;
    }

    const mainWindow = getMainWindow();
    if (!mainWindow) {
      console.warn(`[Task ${taskId}] Exit handler: No main window available`);
      // Still cleanup file watcher even if no window
      try {
        await fileWatcher.unwatch(taskId);
      } catch (unwatchError) {
        console.error(`[Task ${taskId}] Failed to unwatch during no-window cleanup:`, unwatchError);
      }
      return;
    }

    try {
      // Get project info early for multi-project filtering (issue #723)
      let exitProjectId: string | undefined;
      try {
        const { project: exitProject } = findTaskAndProject(taskId);
        exitProjectId = exitProject?.id;
      } catch (findError) {
        console.error(`[Task ${taskId}] Failed to find project info:`, findError);
      }

      // Cleanup status cache
      try {
        lastTaskStatus.delete(taskId);
      } catch (cacheError) {
        console.error(`[Task ${taskId}] Failed to cleanup status cache:`, cacheError);
      }

      // Send final plan state to renderer BEFORE unwatching
      // This ensures the renderer has the final subtask data (fixes 0/0 subtask bug)
      try {
        const finalPlan = fileWatcher.getCurrentPlan(taskId);
        if (finalPlan) {
          mainWindow.webContents.send(IPC_CHANNELS.TASK_PROGRESS, taskId, finalPlan, exitProjectId);
        }
      } catch (planError) {
        console.error(`[Task ${taskId}] Failed to send final plan state:`, planError);
      }

      // CRITICAL: Always unwatch file watcher, even if other operations fail
      try {
        await fileWatcher.unwatch(taskId);
      } catch (unwatchError) {
        console.error(`[Task ${taskId}] Failed to unwatch file watcher:`, unwatchError);
        // Continue execution - this shouldn't prevent status updates
      }

      if (processType === 'spec-creation') {
        console.warn(`[Task ${taskId}] Spec creation completed with code ${code}`);
        return;
      }

      let task: Task | undefined;
      let project: Project | undefined;

      try {
        const projects = projectStore.getProjects();

        // IMPORTANT: Invalidate cache for all projects to ensure we get fresh data
        // This prevents race conditions where cached task data has stale status
        for (const p of projects) {
          try {
            projectStore.invalidateTasksCache(p.id);
          } catch (invalidateError) {
            console.error(`[Task ${taskId}] Failed to invalidate cache for project ${p.id}:`, invalidateError);
          }
        }

        for (const p of projects) {
          try {
            const tasks = projectStore.getTasks(p.id);
            task = tasks.find((t) => t.id === taskId || t.specId === taskId);
            if (task) {
              project = p;
              break;
            }
          } catch (getTasksError) {
            console.error(`[Task ${taskId}] Failed to get tasks for project ${p.id}:`, getTasksError);
          }
        }

        if (task && project) {
          const taskTitle = task.title || task.specId;
          const mainPlanPath = getPlanPath(project, task);
          const projectId = project.id; // Capture for closure

          // Capture task values for closure
          const taskSpecId = task.specId;
          const projectPath = project.path;
          const autoBuildPath = project.autoBuildPath;

          // Use shared utility for persisting status (prevents race conditions)
          // Persist to both main project AND worktree (if exists) for consistency
          const persistStatus = async (status: TaskStatus) => {
            try {
              // Persist to main project
              // Use async persistPlanStatus which uses locks, preventing race conditions with TASK_UPDATE_STATUS
              const mainPersisted = await persistPlanStatus(mainPlanPath, status, projectId);
              if (mainPersisted) {
                console.warn(`[Task ${taskId}] Persisted status to main plan: ${status}`);
              }
            } catch (mainPersistError) {
              console.error(`[Task ${taskId}] Failed to persist status to main plan:`, mainPersistError);
            }

            try {
              // Also persist to worktree if it exists
              const worktreePath = findTaskWorktree(projectPath, taskSpecId);
              if (worktreePath) {
                const specsBaseDir = getSpecsDir(autoBuildPath);
                const worktreePlanPath = path.join(
                  worktreePath,
                  specsBaseDir,
                  taskSpecId,
                  AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN
                );
                // Use EAFP instead of existsSync to avoid race conditions
                const worktreePersisted = await persistPlanStatus(worktreePlanPath, status, projectId);
                if (worktreePersisted) {
                  console.warn(`[Task ${taskId}] Persisted status to worktree plan: ${status}`);
                }
              }
            } catch (worktreePersistError) {
              console.error(`[Task ${taskId}] Failed to persist status to worktree plan:`, worktreePersistError);
            }
          };

          if (code === 0) {
            try {
              notificationService.notifyReviewNeeded(taskTitle, project.id, taskId);
            } catch (notifyError) {
              console.error(`[Task ${taskId}] Failed to send review notification:`, notifyError);
            }

            // Fallback: Ensure status is updated even if COMPLETE phase event was missed
            // This prevents tasks from getting stuck in ai_review status
            // FIX (ACS-71): Only move to human_review if subtasks exist AND are all completed
            // If no subtasks exist, the task is still in planning and shouldn't move to human_review
            const isActiveStatus = task.status === 'in_progress' || task.status === 'ai_review';
            const hasSubtasks = task.subtasks && task.subtasks.length > 0;
            const hasIncompleteSubtasks = hasSubtasks &&
              task.subtasks.some((s) => s.status !== 'completed');

            if (isActiveStatus && hasSubtasks && !hasIncompleteSubtasks) {
              // All subtasks completed - safe to move to human_review
              console.warn(`[Task ${taskId}] Fallback: Moving to human_review (process exited successfully, all ${task.subtasks.length} subtasks completed)`);
              try {
                await persistStatus('human_review');
                // Include projectId for multi-project filtering (issue #723)
                mainWindow.webContents.send(
                  IPC_CHANNELS.TASK_STATUS_CHANGE,
                  taskId,
                  'human_review' as TaskStatus,
                  projectId
                );
              } catch (statusUpdateError) {
                console.error(`[Task ${taskId}] Failed to update status to human_review:`, statusUpdateError);
              }
            } else if (isActiveStatus && !hasSubtasks) {
              // No subtasks yet - task is still in planning phase, don't change status
              // This prevents the bug where tasks jump to human_review before planning completes
              console.warn(`[Task ${taskId}] Process exited but no subtasks created yet - keeping current status (${task.status})`);
            }
          } else {
            // Process failed (non-zero exit code)
            try {
              notificationService.notifyTaskFailed(taskTitle, project.id, taskId);
            } catch (notifyError) {
              console.error(`[Task ${taskId}] Failed to send failure notification:`, notifyError);
            }

            try {
              await persistStatus('human_review');
              // Include projectId for multi-project filtering (issue #723)
              mainWindow.webContents.send(
                IPC_CHANNELS.TASK_STATUS_CHANGE,
                taskId,
                'human_review' as TaskStatus,
                projectId
              );
            } catch (statusUpdateError) {
              console.error(`[Task ${taskId}] Failed to update status after failure:`, statusUpdateError);
            }
          }
        } else {
          console.warn(`[Task ${taskId}] Exit handler: Task or project not found after process exit`);
        }
      } catch (error) {
        console.error(`[Task ${taskId}] Exit handler error in main processing:`, error);
      }
    } catch (outerError) {
      // Catch-all for any unexpected errors in the exit handler itself
      console.error(`[Task ${taskId}] Critical error in exit handler:`, outerError);
      // Still attempt to cleanup file watcher as last resort
      try {
        await fileWatcher.unwatch(taskId);
      } catch (finalUnwatchError) {
        console.error(`[Task ${taskId}] Failed final file watcher cleanup:`, finalUnwatchError);
      }
    }
  });

  agentManager.on('execution-progress', async (taskId: string, progress: ExecutionProgressData) => {
    // Check if we should ignore events for this task (e.g. manual stop)
    // This prevents race conditions where "failed" progress events (triggered by kill)
    // try to persist status via sync write while the async status update is in progress.
    if (agentManager.shouldIgnoreExit(taskId)) {
      return;
    }

    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Use shared helper to find task and project (issue #723 - deduplicate lookup)
      const { task, project } = findTaskAndProject(taskId);
      const taskProjectId = project?.id;

      // Include projectId in execution progress event for multi-project filtering
      mainWindow.webContents.send(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, taskId, progress, taskProjectId);

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
      // FIX (ACS-55, ACS-71): Validate status transition before sending/persisting
      if (newStatus && validateStatusTransition(task, newStatus, progress.phase)) {
        // Include projectId in status change event for multi-project filtering
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_STATUS_CHANGE,
          taskId,
          newStatus,
          taskProjectId
        );

        // PERFORMANCE FIX: Debounce status updates
        // Only persist if the status has actually changed.
        // This prevents IO saturation during high-volume logging phases (like "planning")
        // where every log line simulates a "progress" event.
        if (lastTaskStatus.get(taskId) === newStatus) {
          return;
        }
        lastTaskStatus.set(taskId, newStatus);

        // CRITICAL: Persist status to plan file(s) to prevent flip-flop on task list refresh
        // When getTasks() is called, it reads status from the plan file. Without persisting,
        // the status in the file might differ from the UI, causing inconsistent state.
        // Uses shared utility with locking to prevent race conditions.
        // IMPORTANT: We persist to BOTH main project AND worktree (if exists) to ensure
        // consistency, since getTasks() prefers the worktree version.
        if (task && project) {
          try {
            // Persist to main project plan file
            // Use async persistence with locks
            const mainPlanPath = getPlanPath(project, task);
            await persistPlanStatus(mainPlanPath, newStatus, project.id);

            // Also persist to worktree plan file if it exists
            // This ensures consistency since getTasks() prefers worktree version
            const worktreePath = findTaskWorktree(project.path, task.specId);
            if (worktreePath) {
              const specsBaseDir = getSpecsDir(project.autoBuildPath);
              const worktreePlanPath = path.join(
                worktreePath,
                specsBaseDir,
                task.specId,
                AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN
              );
              // Use EAFP instead of existsSync to avoid race conditions
              await persistPlanStatus(worktreePlanPath, newStatus, project.id);
            }
          } catch (err) {
            // Ignore persistence errors - UI will still work, just might flip on refresh
            console.warn('[execution-progress] Could not persist status:', err);
          }
        }
      }
    }
  });

  // ============================================
  // File Watcher Events → Renderer
  // ============================================

  fileWatcher.on('progress', (taskId: string, plan: ImplementationPlan) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Use shared helper to find project (issue #723 - deduplicate lookup)
      const { project } = findTaskAndProject(taskId);
      mainWindow.webContents.send(IPC_CHANNELS.TASK_PROGRESS, taskId, plan, project?.id);
    }
  });

  fileWatcher.on('error', (taskId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Include projectId for multi-project filtering (issue #723)
      const { project } = findTaskAndProject(taskId);
      mainWindow.webContents.send(IPC_CHANNELS.TASK_ERROR, taskId, error, project?.id);
    }
  });
}
