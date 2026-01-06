import { Notification, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { projectStore } from './project-store';

export type NotificationType = 'task-complete' | 'task-failed' | 'review-needed';

interface NotificationOptions {
  title: string;
  body: string;
  projectId?: string;
  taskId?: string;
}

/**
 * Service for sending system notifications with optional sound
 */
class NotificationService {
  private mainWindow: (() => BrowserWindow | null) | null = null;

  /**
   * Initialize the notification service with the main window getter
   */
  initialize(getMainWindow: () => BrowserWindow | null): void {
    this.mainWindow = getMainWindow;
  }

  /**
   * Send a notification for task completion
   */
  notifyTaskComplete(taskTitle: string, projectId: string, taskId: string): void {
    // Wrap in setImmediate to prevent blocking if projectStore.getProjects() is slow
    setImmediate(() => {
      try {
        this.sendNotification('task-complete', {
          title: 'Task Complete',
          body: `"${taskTitle}" has completed and is ready for review`,
          projectId,
          taskId
        });
      } catch (error) {
        console.error('[NotificationService] Error sending task complete notification:', error);
      }
    });
  }

  /**
   * Send a notification for task failure
   */
  notifyTaskFailed(taskTitle: string, projectId: string, taskId: string): void {
    // Wrap in setImmediate to prevent blocking if projectStore.getProjects() is slow
    setImmediate(() => {
      try {
        this.sendNotification('task-failed', {
          title: 'Task Failed',
          body: `"${taskTitle}" encountered an error`,
          projectId,
          taskId
        });
      } catch (error) {
        console.error('[NotificationService] Error sending task failed notification:', error);
      }
    });
  }

  /**
   * Send a notification for review needed
   */
  notifyReviewNeeded(taskTitle: string, projectId: string, taskId: string): void {
    // Wrap in setImmediate to prevent blocking if projectStore.getProjects() is slow
    setImmediate(() => {
      try {
        this.sendNotification('review-needed', {
          title: 'Review Needed',
          body: `"${taskTitle}" is ready for your review`,
          projectId,
          taskId
        });
      } catch (error) {
        console.error('[NotificationService] Error sending review notification:', error);
      }
    });
  }

  /**
   * Send a system notification with optional sound
   */
  private sendNotification(type: NotificationType, options: NotificationOptions): void {
    // Get notification settings
    const settings = this.getNotificationSettings(options.projectId);

    // Check if this notification type is enabled
    if (!this.isNotificationEnabled(type, settings)) {
      return;
    }

    // Create and show the notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: !settings.sound // Let the OS handle sound if enabled
      });

      // Focus window when notification is clicked
      notification.on('click', () => {
        try {
          const window = this.mainWindow?.();
          if (window && !window.isDestroyed()) {
            if (window.isMinimized()) {
              window.restore();
            }
            window.focus();
          }
        } catch (error) {
          console.error('[NotificationService] Error handling notification click:', error);
        }
      });

      notification.show();
    }

    // Play sound if enabled (system beep)
    if (settings.sound) {
      this.playNotificationSound();
    }
  }

  /**
   * Play a notification sound
   */
  private playNotificationSound(): void {
    // Use system beep - works across all platforms
    shell.beep();
  }

  /**
   * Get notification settings for a project or fall back to defaults
   */
  private getNotificationSettings(projectId?: string): {
    onTaskComplete: boolean;
    onTaskFailed: boolean;
    onReviewNeeded: boolean;
    sound: boolean;
  } {
    // Try to get project-specific settings
    if (projectId) {
      try {
        const projects = projectStore.getProjects();
        const project = projects.find(p => p.id === projectId);
        if (project?.settings?.notifications) {
          return project.settings.notifications;
        }
      } catch (error) {
        console.error('[NotificationService] Error getting project settings:', error);
        // Fall through to defaults
      }
    }

    // Fall back to defaults
    return {
      onTaskComplete: true,
      onTaskFailed: true,
      onReviewNeeded: true,
      sound: false
    };
  }

  /**
   * Check if a notification type is enabled in settings
   */
  private isNotificationEnabled(
    type: NotificationType,
    settings: {
      onTaskComplete: boolean;
      onTaskFailed: boolean;
      onReviewNeeded: boolean;
      sound: boolean;
    }
  ): boolean {
    switch (type) {
      case 'task-complete':
        return settings.onTaskComplete;
      case 'task-failed':
        return settings.onTaskFailed;
      case 'review-needed':
        return settings.onReviewNeeded;
      default:
        return false;
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
