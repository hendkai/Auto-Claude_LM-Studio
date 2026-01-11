/**
 * Application Logger Service
 *
 * Provides persistent, always-on logging for the main process using electron-log.
 * Logs are stored in the standard OS log directory:
 * - macOS: ~/Library/Logs/Auto-Claude/
 * - Windows: %USERPROFILE%\AppData\Roaming\Auto-Claude\logs\
 * - Linux: ~/.config/Auto-Claude/logs/
 *
 * Features:
 * - Automatic file rotation (7 days, max 10MB per file)
 * - Always-on logging (not dependent on DEBUG flag)
 * - Debug info collection for support/bug reports
 * - Beta version detection for enhanced logging
 */

import log from 'electron-log/main.js';
import { app } from 'electron';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import os from 'os';

// Configure electron-log (wrapped in try-catch for re-import scenarios in tests)
try {
  log.initialize();
} catch {
  // Already initialized, ignore
}

// File transport configuration
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB max file size
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.file.fileName = 'main.log';

// Note: We use electron-log's default archiveLogFn which properly rotates logs
// by renaming old files to .old format. Custom implementations were problematic.

// Console transport - always show warnings and errors, debug only in dev mode
// FIX: Disable console logging in packaged builds to prevent EPIPE errors causing crash loops
if (app.isPackaged) {
  // Aggressively remove console transport in packaged builds
  // Just setting level to false wasn't enough to prevent some internal writes
  log.transports.console.level = false;
  // @ts-ignore - electron-log types might not technically allow null, but it stops operation
  log.transports.console = null;
} else {
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn';
  log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';
}

// Determine if this is a beta version
function isBetaVersion(): boolean {
  try {
    const version = app.getVersion();
    return version.includes('-beta') || version.includes('-alpha') || version.includes('-rc');
  } catch (error) {
    if (!app.isPackaged) {
      log.warn('Failed to detect beta version:', error);
    }
    return false;
  }
}

// ... (rest of file)

// Log unhandled errors
export function setupErrorLogging(): void {
  process.on('uncaughtException', (error) => {
    // CRITICAL FIX: Ignore EPIPE errors to prevent infinite crash loops
    // These happen when trying to write to closed stdout/stderr in packaged apps
    if (error.message && error.message.includes('EPIPE')) {
      return;
    }
    // @ts-ignore - Check for code property on error object
    if (error.code === 'EPIPE') {
      return;
    }

    log.error('Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason) => {
    // CRITICAL FIX: Ignore EPIPE errors here too
    if (reason instanceof Error) {
      if (reason.message && reason.message.includes('EPIPE')) return;
      // @ts-ignore
      if (reason.code === 'EPIPE') return;
    }

    log.error('Unhandled rejection:', reason);
  });

  log.info('Error logging initialized');
}
