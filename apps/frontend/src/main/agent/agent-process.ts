import { spawn } from 'child_process';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import { ProcessType, ExecutionProgressData, AgentProcess } from './types';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv, detectAuthFailure } from '../rate-limit-detector';
import { getAPIProfileEnv, getProfileEnvForPair } from '../services/profile';
import { projectStore } from '../project-store';
import { getClaudeProfileManager } from '../claude-profile-manager';
import { parsePythonCommand, validatePythonPath } from '../python-detector';
import { pythonEnvManager, getConfiguredPythonPath } from '../python-env-manager';
import { buildMemoryEnvVars } from '../memory-env-builder';
import { readSettingsFile } from '../settings-utils';
import type { AppSettings, PhaseModelConfigV2, ProfileModelPair } from '../../shared/types/settings';
import { getOAuthModeClearVars } from './env-utils';
import { getAugmentedEnv } from '../env-utils';
import { getToolInfo } from '../cli-tool-manager';


function deriveGitBashPath(gitExePath: string): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const gitDir = path.dirname(gitExePath);  // e.g., D:\...\Git\mingw64\bin
    const gitDirName = path.basename(gitDir).toLowerCase();

    // Find Git installation root
    let gitRoot: string;

    if (gitDirName === 'cmd') {
      // .../Git/cmd/git.exe -> .../Git
      gitRoot = path.dirname(gitDir);
    } else if (gitDirName === 'bin') {
      // Could be .../Git/bin/git.exe OR .../Git/mingw64/bin/git.exe
      const parent = path.dirname(gitDir);
      const parentName = path.basename(parent).toLowerCase();
      if (parentName === 'mingw64' || parentName === 'mingw32') {
        // .../Git/mingw64/bin/git.exe -> .../Git
        gitRoot = path.dirname(parent);
      } else {
        // .../Git/bin/git.exe -> .../Git
        gitRoot = parent;
      }
    } else {
      // Unknown structure - try to find 'bin' sibling
      gitRoot = path.dirname(gitDir);
    }

    // Bash.exe is in Git/bin/bash.exe
    const bashPath = path.join(gitRoot, 'bin', 'bash.exe');

    if (existsSync(bashPath)) {
      console.log('[AgentProcess] Derived git-bash path:', bashPath);
      return bashPath;
    }

    // Fallback: check one level up if gitRoot didn't work
    const altBashPath = path.join(path.dirname(gitRoot), 'bin', 'bash.exe');
    if (existsSync(altBashPath)) {
      console.log('[AgentProcess] Found git-bash at alternate path:', altBashPath);
      return altBashPath;
    }

    console.warn('[AgentProcess] Could not find bash.exe from git path:', gitExePath);
    return null;
  } catch (error) {
    console.error('[AgentProcess] Error deriving git-bash path:', error);
    return null;
  }
}

/**
 * Process spawning and lifecycle management
 */
export class AgentProcessManager {
  private state: AgentState;
  private events: AgentEvents;
  private emitter: EventEmitter;
  // Python path will be configured by pythonEnvManager after venv is ready
  // Use null to indicate not yet configured - getPythonPath() will use fallback
  private _pythonPath: string | null = null;
  private autoBuildSourcePath: string = '';

  constructor(state: AgentState, events: AgentEvents, emitter: EventEmitter) {
    this.state = state;
    this.events = events;
    this.emitter = emitter;
  }

  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    if (pythonPath) {
      const validation = validatePythonPath(pythonPath);
      if (validation.valid) {
        this._pythonPath = validation.sanitizedPath || pythonPath;
      } else {
        console.error(`[AgentProcess] Invalid Python path rejected: ${validation.reason}`);
        console.error(`[AgentProcess] Falling back to getConfiguredPythonPath()`);
        // Don't set _pythonPath - let getPythonPath() use getConfiguredPythonPath() fallback
      }
    }
    if (autoBuildSourcePath) {
      this.autoBuildSourcePath = autoBuildSourcePath;
    }
  }

  private setupProcessEnvironment(
    extraEnv: Record<string, string>
  ): NodeJS.ProcessEnv {
    const profileEnv = getProfileEnv();
    // Use getAugmentedEnv() to ensure common tool paths (dotnet, homebrew, etc.)
    // are available even when app is launched from Finder/Dock
    const augmentedEnv = getAugmentedEnv();

    // On Windows, detect and pass git-bash path for Claude Code CLI
    // Electron can detect git via where.exe, but Python subprocess may not have the same PATH
    const gitBashEnv: Record<string, string> = {};
    if (process.platform === 'win32' && !process.env.CLAUDE_CODE_GIT_BASH_PATH) {
      try {
        const gitInfo = getToolInfo('git');
        if (gitInfo.found && gitInfo.path) {
          const bashPath = deriveGitBashPath(gitInfo.path);
          if (bashPath) {
            gitBashEnv['CLAUDE_CODE_GIT_BASH_PATH'] = bashPath;
            console.log('[AgentProcess] Setting CLAUDE_CODE_GIT_BASH_PATH:', bashPath);
          }
        }
      } catch (error) {
        console.warn('[AgentProcess] Failed to detect git-bash path:', error);
      }
    }

    return {
      ...augmentedEnv,
      ...gitBashEnv,
      ...extraEnv,
      ...profileEnv,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    } as NodeJS.ProcessEnv;
  }

  private async handleProcessFailure(
    taskId: string,
    allOutput: string,
    processType: ProcessType
  ): Promise<boolean> {
    console.log('[AgentProcess] Checking for rate limit in output (last 500 chars):', allOutput.slice(-500));

    const rateLimitDetection = detectRateLimit(allOutput);
    console.log('[AgentProcess] Rate limit detection result:', {
      isRateLimited: rateLimitDetection.isRateLimited,
      resetTime: rateLimitDetection.resetTime,
      limitType: rateLimitDetection.limitType,
      profileId: rateLimitDetection.profileId,
      suggestedProfile: rateLimitDetection.suggestedProfile
    });

    if (rateLimitDetection.isRateLimited) {
      // V3: Try next fallback model before Auto-Swap
      const tryNextFallback = await this.tryNextFallbackModel(taskId, processType);
      if (tryNextFallback) {
        console.log('[AgentProcess] Successfully switched to fallback model');
        return true; // Handled - retrying with fallback
      }

      // If no fallbacks available, try Auto-Swap (legacy OAuth account switching)
      const wasHandled = this.handleRateLimitWithAutoSwap(
        taskId,
        rateLimitDetection,
        processType
      );
      if (wasHandled) return true;

      const source = processType === 'spec-creation' ? 'roadmap' : 'task';
      const rateLimitInfo = createSDKRateLimitInfo(source, rateLimitDetection, { taskId });
      console.log('[AgentProcess] Emitting sdk-rate-limit event (manual):', rateLimitInfo);
      this.emitter.emit('sdk-rate-limit', rateLimitInfo);
      return true;
    }

    return this.handleAuthFailure(taskId, allOutput);
  }

  /**
   * Try next fallback model in the chain
   * Returns true if retry was attempted, false if no fallbacks available
   */
  private async tryNextFallbackModel(taskId: string, processType: ProcessType): Promise<boolean> {
    const process = this.state.getProcess(taskId);
    if (!process || !process.fallbackChain || !process.fallbackChain.length) {
      console.log('[AgentProcess] No fallback chain available for retry');
      return false;
    }

    const currentIndex = process.currentFallbackIndex ?? 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= process.fallbackChain.length) {
      console.log('[AgentProcess] All fallbacks exhausted');
      this.emitter.emit('agent-notification', {
        type: 'error',
        title: 'All Models Unavailable',
        message: 'All fallback models hit rate limit. Please wait or add more profiles.'
      });
      return false;
    }

    const nextModel = process.fallbackChain[nextIndex];
    console.log(`[AgentProcess] Switching to fallback ${nextIndex}: ${nextModel.profileId} - ${nextModel.model}`);

    // Notify user about fallback switch
    this.emitter.emit('agent-notification', {
      type: 'warning',
      title: 'Rate Limit Reached',
      message: `Switching to fallback model: ${nextModel.model}`
    });

    // Get spawn arguments for restart (before killing process)
    const spawnArgs = process.spawnArgs;
    if (!spawnArgs) {
      console.error('[AgentProcess] No spawn arguments stored, cannot restart with fallback');
      return false;
    }

    // Store next index and fallback chain before killing process
    const nextFallbackIndex = nextIndex;
    const savedFallbackChain = process.fallbackChain;

    // Kill current process (only once)
    this.killProcess(taskId);

    // Get env for fallback model
    try {
      const fallbackEnv = await getProfileEnvForPair(nextModel);

      // Temporarily store the fallback index so spawnProcess can use it
      // Create a temporary process entry with the next index
      // Preserve current phase to use correct fallback chain
      const tempProcess: AgentProcess = {
        taskId,
        process: null as any, // Will be replaced by spawnProcess
        startedAt: new Date(),
        spawnId: 0, // Will be replaced by spawnProcess
        fallbackChain: savedFallbackChain,
        currentFallbackIndex: nextFallbackIndex,
        currentPhase: process.currentPhase, // Preserve current phase
        spawnArgs
      } as AgentProcess;
      this.state.addProcess(taskId, tempProcess);

      // Emit execution progress update with new model
      this.emitter.emit('execution-progress', taskId, {
        phase: 'planning', // Keep current phase
        phaseProgress: 0,
        overallProgress: 0,
        currentModel: nextModel.model, // Update current model
        message: `Switched to fallback model: ${nextModel.model}`
      });

      // Restart process with fallback model
      console.log('[AgentProcess] Restarting with fallback model...');
      await this.spawnProcess(
        taskId,
        spawnArgs.cwd,
        spawnArgs.args,
        { ...spawnArgs.extraEnv, ...fallbackEnv },
        spawnArgs.processType
      );

      return true; // Successfully restarted with fallback
    } catch (error) {
      console.error('[AgentProcess] Failed to restart with fallback model:', error);
      return false;
    }
  }

  private handleRateLimitWithAutoSwap(
    taskId: string,
    rateLimitDetection: ReturnType<typeof detectRateLimit>,
    processType: ProcessType
  ): boolean {
    const profileManager = getClaudeProfileManager();
    const autoSwitchSettings = profileManager.getAutoSwitchSettings();

    console.log('[AgentProcess] Auto-switch settings:', {
      enabled: autoSwitchSettings.enabled,
      autoSwitchOnRateLimit: autoSwitchSettings.autoSwitchOnRateLimit,
      proactiveSwapEnabled: autoSwitchSettings.proactiveSwapEnabled
    });

    if (!autoSwitchSettings.enabled || !autoSwitchSettings.autoSwitchOnRateLimit) {
      console.log('[AgentProcess] Auto-switch disabled - showing manual modal');
      return false;
    }

    const currentProfileId = rateLimitDetection.profileId;
    const bestProfile = profileManager.getBestAvailableProfile(currentProfileId);

    console.log('[AgentProcess] Best available profile:', bestProfile ? {
      id: bestProfile.id,
      name: bestProfile.name
    } : 'NONE');

    if (!bestProfile) {
      console.log('[AgentProcess] No alternative profile available - falling back to manual modal');
      return false;
    }

    console.log('[AgentProcess] AUTO-SWAP: Switching from', currentProfileId, 'to', bestProfile.id);
    profileManager.setActiveProfile(bestProfile.id);

    const source = processType === 'spec-creation' ? 'roadmap' : 'task';
    const rateLimitInfo = createSDKRateLimitInfo(source, rateLimitDetection, { taskId });
    rateLimitInfo.wasAutoSwapped = true;
    rateLimitInfo.swappedToProfile = { id: bestProfile.id, name: bestProfile.name };
    rateLimitInfo.swapReason = 'reactive';

    console.log('[AgentProcess] Emitting sdk-rate-limit event (auto-swapped):', rateLimitInfo);
    this.emitter.emit('sdk-rate-limit', rateLimitInfo);

    console.log('[AgentProcess] Emitting auto-swap-restart-task event for task:', taskId);
    this.emitter.emit('auto-swap-restart-task', taskId, bestProfile.id);
    return true;
  }

  private handleAuthFailure(taskId: string, allOutput: string): boolean {
    console.log('[AgentProcess] No rate limit detected - checking for auth failure');
    const authFailureDetection = detectAuthFailure(allOutput);

    if (authFailureDetection.isAuthFailure) {
      console.log('[AgentProcess] Auth failure detected:', authFailureDetection);
      this.emitter.emit('auth-failure', taskId, {
        profileId: authFailureDetection.profileId,
        failureType: authFailureDetection.failureType,
        message: authFailureDetection.message,
        originalError: authFailureDetection.originalError
      });
      return true;
    }

    console.log('[AgentProcess] Process failed but no rate limit or auth failure detected');
    return false;
  }

  /**
   * Get the configured Python path.
   * Returns explicitly configured path, or falls back to getConfiguredPythonPath()
   * which uses the venv Python if ready.
   */
  getPythonPath(): string {
    // If explicitly configured (by pythonEnvManager), use that
    if (this._pythonPath) {
      return this._pythonPath;
    }
    // Otherwise use the global configured path (venv if ready, else bundled/system)
    return getConfiguredPythonPath();
  }

  /**
   * Get the auto-claude source path (detects automatically if not configured)
   */
  getAutoBuildSourcePath(): string | null {
    // Use runners/spec_runner.py as the validation marker - this is the file actually needed
    const validatePath = (p: string): boolean => {
      return existsSync(p) && existsSync(path.join(p, 'runners', 'spec_runner.py'));
    };

    // If manually configured AND valid, use that
    if (this.autoBuildSourcePath && validatePath(this.autoBuildSourcePath)) {
      return this.autoBuildSourcePath;
    }

    // Auto-detect from app location (configured path was invalid or not set)
    const possiblePaths = [
      // Packaged app: backend is in extraResources (process.resourcesPath/backend)
      ...(app.isPackaged ? [path.join(process.resourcesPath, 'backend')] : []),
      // Dev mode: from dist/main -> ../../backend (apps/frontend/out/main -> apps/backend)
      path.resolve(__dirname, '..', '..', '..', 'backend'),
      // Alternative: from app root -> apps/backend
      path.resolve(app.getAppPath(), '..', 'backend'),
      // If running from repo root with apps structure
      path.resolve(process.cwd(), 'apps', 'backend')
    ];

    for (const p of possiblePaths) {
      if (validatePath(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Get project-specific environment variables based on project settings
   */
  private getProjectEnvVars(projectPath: string): Record<string, string> {
    const env: Record<string, string> = {};

    // Find project by path
    const projects = projectStore.getProjects();
    const project = projects.find((p) => p.path === projectPath);

    if (project?.settings) {
      // Graphiti MCP integration
      if (project.settings.graphitiMcpEnabled) {
        const graphitiUrl = project.settings.graphitiMcpUrl || 'http://localhost:8000/mcp/';
        env['GRAPHITI_MCP_URL'] = graphitiUrl;
      }

      // CLAUDE.md integration (enabled by default)
      if (project.settings.useClaudeMd !== false) {
        env['USE_CLAUDE_MD'] = 'true';
      }
    }

    return env;
  }

  /**
   * Parse environment variables from a .env file content.
   * Filters out empty values to prevent overriding valid tokens from profiles.
   */
  private parseEnvFile(envPath: string): Record<string, string> {
    if (!existsSync(envPath)) {
      return {};
    }

    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();

          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          // Skip empty values to prevent overriding valid values from other sources
          if (value) {
            envVars[key] = value;
          }
        }
      }

      return envVars;
    } catch {
      return {};
    }
  }

  /**
   * Load environment variables from project's .auto-claude/.env file
   * This contains frontend-configured settings like memory/Graphiti configuration
   */
  private loadProjectEnv(projectPath: string): Record<string, string> {
    // Find project by path to get autoBuildPath
    const projects = projectStore.getProjects();
    const project = projects.find((p) => p.path === projectPath);

    if (!project?.autoBuildPath) {
      return {};
    }

    const envPath = path.join(projectPath, project.autoBuildPath, '.env');
    return this.parseEnvFile(envPath);
  }

  /**
   * Load environment variables from auto-claude .env file
   */
  loadAutoBuildEnv(): Record<string, string> {
    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) {
      return {};
    }

    const envPath = path.join(autoBuildSource, '.env');
    return this.parseEnvFile(envPath);
  }

  /**
   * Spawn a Python process for task execution
   */
  async spawnProcess(
    taskId: string,
    cwd: string,
    args: string[],
    extraEnv: Record<string, string> = {},
    processType: ProcessType = 'task-execution'
  ): Promise<void> {
    const isSpecRunner = processType === 'spec-creation';
    this.killProcess(taskId);

    const spawnId = this.state.generateSpawnId();
    const env = this.setupProcessEnvironment(extraEnv);

    // Get Python environment (PYTHONPATH for bundled packages, etc.)
    const pythonEnv = pythonEnvManager.getPythonEnv();

    // Get API profile environment variables
    // V3: Use fallback chain (array of ProfileModelPair per phase)
    let apiProfileEnv: Record<string, string> = {};
    let fallbackChain: ProfileModelPair[] = [];
    // Check if we're restarting with a fallback model (preserve currentFallbackIndex)
    const existingProcess = this.state.getProcess(taskId);
    let currentFallbackIndex = existingProcess?.currentFallbackIndex ?? 0;

    try {
      // Load settings to check for phase-specific configuration
      const settings = await readSettingsFile();
      const phaseModelsV3 = settings?.customPhaseModelsV3 as import('../../shared/types/settings').PhaseModelConfigV3 | undefined;

      // Determine initial phase (spec-runner starts in spec, others in planning)
      // Use current phase from existing process if available, otherwise default
      let initialPhase: 'spec' | 'planning' | 'coding' | 'qa' = isSpecRunner ? 'spec' : 'planning';

      // Map execution phase to config phase
      if (existingProcess?.currentPhase) {
        const phaseMap: Record<string, 'spec' | 'planning' | 'coding' | 'qa'> = {
          'planning': 'planning',
          'coding': 'coding',
          'qa_review': 'qa',
          'qa_fixing': 'qa'
        };
        const mappedPhase = phaseMap[existingProcess.currentPhase];
        if (mappedPhase) {
          initialPhase = mappedPhase;
          console.log(`[AgentProcess] Using phase from existing process: ${existingProcess.currentPhase} -> ${initialPhase}`);
        }
      }

      // If V3 config exists, use fallback chain for the current phase
      if (phaseModelsV3 && phaseModelsV3[initialPhase] && phaseModelsV3[initialPhase].length > 0) {
        fallbackChain = phaseModelsV3[initialPhase];
        // Use the model at currentFallbackIndex (or primary if not set)
        const modelIndex = currentFallbackIndex < fallbackChain.length ? currentFallbackIndex : 0;
        const selectedModel = fallbackChain[modelIndex];
        console.log(`[AgentProcess] Using phase-specific profile for ${initialPhase} (index ${modelIndex}):`, selectedModel);
        console.log(`[AgentProcess] Fallback chain length: ${fallbackChain.length}`);
        apiProfileEnv = await getProfileEnvForPair(selectedModel);
        // Ensure currentFallbackIndex is set correctly
        currentFallbackIndex = modelIndex;
      } else {
        // Fallback to active profile
        console.log('[AgentProcess] No V3 phase config, using active profile');
        apiProfileEnv = await getAPIProfileEnv();
        currentFallbackIndex = 0;
      }
    } catch (error) {
      console.error('[Agent Process] Failed to get API profile env:', error);
      // Continue with empty profile env (falls back to OAuth mode)
      currentFallbackIndex = 0;
    }

    // Get OAuth mode clearing vars (clears stale ANTHROPIC_* vars when in OAuth mode)
    const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);

    // Parse Python commandto handle space-separated commands like "py -3"
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(this.getPythonPath());
    const childProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
      cwd,
      env: {
        ...env, // Already includes process.env, extraEnv, profileEnv, PYTHONUNBUFFERED, PYTHONUTF8
        ...pythonEnv, // Include Python environment (PYTHONPATH for bundled packages)
        ...oauthModeClearVars, // Clear stale ANTHROPIC_* vars when in OAuth mode
        ...apiProfileEnv // Include active API profile config (highest priority for ANTHROPIC_* vars)
      }
    });

    let currentPhase: ExecutionProgressData['phase'] = isSpecRunner ? 'planning' : 'planning';

    this.state.addProcess(taskId, {
      taskId,
      process: childProcess,
      startedAt: new Date(),
      spawnId,
      // V3: Store fallback chain for retry logic
      fallbackChain,
      currentFallbackIndex,
      currentPhase, // Store initial phase
      // Store spawn arguments for restarting with fallback model
      spawnArgs: {
        cwd,
        args,
        extraEnv,
        processType
      }
    });

    // currentPhase is already declared above
    let phaseProgress = 0;
    let currentSubtask: string | undefined;
    let lastMessage: string | undefined;
    let allOutput = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let sequenceNumber = 0;
    let rateLimitHandled = false; // Track if we've already handled a rate limit for this process

    this.emitter.emit('execution-progress', taskId, {
      phase: currentPhase,
      phaseProgress: 0,
      overallProgress: this.events.calculateOverallProgress(currentPhase, 0),
      message: isSpecRunner ? 'Starting spec creation...' : 'Starting build process...',
      sequenceNumber: ++sequenceNumber
    });

    const isDebug = ['true', '1', 'yes', 'on'].includes(process.env.DEBUG?.toLowerCase() ?? '');

    const processLog = (line: string) => {
      allOutput = (allOutput + line).slice(-10000);

      const hasMarker = line.includes('__EXEC_PHASE__');
      if (isDebug && hasMarker) {
        console.log(`[PhaseDebug:${taskId}] Found marker in line: "${line.substring(0, 200)}"`);
      }

      const phaseUpdate = this.events.parseExecutionPhase(line, currentPhase, isSpecRunner);

      if (isDebug && hasMarker) {
        console.log(`[PhaseDebug:${taskId}] Parse result:`, phaseUpdate);
      }

      if (phaseUpdate) {
        const phaseChanged = phaseUpdate.phase !== currentPhase;

        if (isDebug) {
          console.log(`[PhaseDebug:${taskId}] Phase update: ${currentPhase} -> ${phaseUpdate.phase} (changed: ${phaseChanged})`);
        }

        currentPhase = phaseUpdate.phase;

        if (phaseUpdate.currentSubtask) {
          currentSubtask = phaseUpdate.currentSubtask;
        }
        if (phaseUpdate.message) {
          lastMessage = phaseUpdate.message;
        }

        if (phaseChanged) {
          phaseProgress = 10;
        } else {
          phaseProgress = Math.min(90, phaseProgress + 5);
        }

        const overallProgress = this.events.calculateOverallProgress(currentPhase, phaseProgress);

        if (isDebug) {
          console.log(`[PhaseDebug:${taskId}] Emitting execution-progress:`, { phase: currentPhase, phaseProgress, overallProgress });
        }

        // Preserve currentModel in progress updates
        const currentModelName = fallbackChain && fallbackChain.length > 0 && currentFallbackIndex < fallbackChain.length
          ? fallbackChain[currentFallbackIndex].model
          : undefined;

        this.emitter.emit('execution-progress', taskId, {
          phase: currentPhase,
          phaseProgress,
          overallProgress,
          currentSubtask,
          message: lastMessage,
          sequenceNumber: ++sequenceNumber,
          currentModel: currentModelName
        });
      }
    };

    const processBufferedOutput = (buffer: string, newData: string): string => {
      if (isDebug && newData.includes('__EXEC_PHASE__')) {
        console.log(`[PhaseDebug:${taskId}] Raw chunk with marker (${newData.length} bytes): "${newData.substring(0, 300)}"`);
        console.log(`[PhaseDebug:${taskId}] Current buffer before append (${buffer.length} bytes): "${buffer.substring(0, 100)}"`);
      }

      buffer += newData;
      const lines = buffer.split('\n');
      const remaining = lines.pop() || '';

      if (isDebug && newData.includes('__EXEC_PHASE__')) {
        console.log(`[PhaseDebug:${taskId}] Split into ${lines.length} complete lines, remaining buffer: "${remaining.substring(0, 100)}"`);
      }

      for (const line of lines) {
        if (line.trim()) {
          this.emitter.emit('log', taskId, line + '\n');
          processLog(line);

          // Check for rate limit during execution (not just on exit)
          // Use allOutput (accumulated) instead of just line to detect repeated messages
          if (!rateLimitHandled) {
            const rateLimitDetection = detectRateLimit(allOutput);
            if (rateLimitDetection.isRateLimited) {
              console.log('[AgentProcess] Rate limit detected during execution:', rateLimitDetection);
              console.log('[AgentProcess] Current process state:', {
                taskId,
                hasProcess: !!this.state.getProcess(taskId),
                fallbackChain: this.state.getProcess(taskId)?.fallbackChain,
                currentIndex: this.state.getProcess(taskId)?.currentFallbackIndex
              });
              rateLimitHandled = true;

              // Try to switch to next fallback model (await to ensure it completes)
              // Use void to avoid blocking the log processing
              void (async () => {
                try {
                  const switched = await this.tryNextFallbackModel(taskId, processType);
                  if (switched) {
                    console.log('[AgentProcess] Successfully switched to fallback model during execution');
                  } else {
                    console.log('[AgentProcess] Could not switch to fallback model, will handle on exit');
                    rateLimitHandled = false; // Allow handling on exit if fallback failed
                  }
                } catch (error) {
                  console.error('[AgentProcess] Error switching to fallback model:', error);
                  rateLimitHandled = false; // Allow handling on exit if fallback failed
                }
              })();
            }
          }

          if (isDebug) {
            console.log(`[Agent:${taskId}] ${line}`);
          }
        }
      }

      return remaining;
    };

    childProcess.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer = processBufferedOutput(stdoutBuffer, data.toString('utf8'));
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      stderrBuffer = processBufferedOutput(stderrBuffer, data.toString('utf8'));
    });

    childProcess.on('exit', async (code: number | null) => {
      if (stdoutBuffer.trim()) {
        this.emitter.emit('log', taskId, stdoutBuffer + '\n');
        processLog(stdoutBuffer);
      }
      if (stderrBuffer.trim()) {
        this.emitter.emit('log', taskId, stderrBuffer + '\n');
        processLog(stderrBuffer);
      }

      this.state.deleteProcess(taskId);

      if (this.state.wasSpawnKilled(spawnId)) {
        this.state.clearKilledSpawn(spawnId);
        return;
      }

      if (code !== 0) {
        console.log('[AgentProcess] Process failed with code:', code, 'for task:', taskId);
        // Check for rate limit in final output if not already handled during execution
        if (!rateLimitHandled) {
          const rateLimitDetection = detectRateLimit(allOutput);
          if (rateLimitDetection.isRateLimited) {
            console.log('[AgentProcess] Rate limit detected on exit, attempting fallback switch');
            rateLimitHandled = true;
            const switched = await this.tryNextFallbackModel(taskId, processType);
            if (switched) {
              console.log('[AgentProcess] Successfully switched to fallback model on exit');
              this.emitter.emit('exit', taskId, code, processType);
              return;
            }
          }
          // Fall back to standard failure handling if no rate limit or fallback failed
          const wasHandled = await this.handleProcessFailure(taskId, allOutput, processType);
          if (wasHandled) {
            this.emitter.emit('exit', taskId, code, processType);
            return;
          }
        } else {
          console.log('[AgentProcess] Rate limit already handled during execution, skipping exit handler');
        }
      }

      if (code !== 0 && currentPhase !== 'complete' && currentPhase !== 'failed') {
        this.emitter.emit('execution-progress', taskId, {
          phase: 'failed',
          phaseProgress: 0,
          overallProgress: this.events.calculateOverallProgress(currentPhase, phaseProgress),
          message: `Process exited with code ${code}`,
          sequenceNumber: ++sequenceNumber
        });
      }

      this.emitter.emit('exit', taskId, code, processType);
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[AgentProcess] Process error:', err.message);
      this.state.deleteProcess(taskId);

      this.emitter.emit('execution-progress', taskId, {
        phase: 'failed',
        phaseProgress: 0,
        overallProgress: 0,
        message: `Error: ${err.message}`,
        sequenceNumber: ++sequenceNumber
      });

      this.emitter.emit('error', taskId, err.message);
    });
  }

  /**
   * Kill a specific task's process
   */
  /**
   * Kill a specific task's process
   */
  killProcess(taskId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const agentProcess = this.state.getProcess(taskId);
      if (!agentProcess) {
        resolve(false);
        return;
      }

      try {
        // Mark this specific spawn as killed so its exit handler knows to ignore
        this.state.markSpawnAsKilled(agentProcess.spawnId);

        if (agentProcess.process.killed) {
          this.state.deleteProcess(taskId);
          resolve(true);
          return;
        }

        // Setup exit listener for cleanup
        const cleanup = () => {
          this.state.deleteProcess(taskId);
          resolve(true);
        };

        // Listen for exit to resolve promise
        agentProcess.process.once('exit', cleanup);
        agentProcess.process.once('error', cleanup);

        // Send SIGTERM first for graceful shutdown
        agentProcess.process.kill('SIGTERM');

        // Force kill after timeout if it doesn't exit
        setTimeout(() => {
          if (!agentProcess.process.killed) {
            console.log('[AgentProcess] Force killing stuck process for task:', taskId);
            agentProcess.process.kill('SIGKILL');
            // We resolve in the exit handler which should fire after SIGKILL
            // But just in case it doesn't fire for some reason (zombie process), we cleanup here too
            setTimeout(() => {
              if (this.state.getProcess(taskId)) {
                cleanup();
              }
            }, 500);
          }
        }, 5000);

      } catch (error) {
        console.error('[AgentProcess] Error killing process:', error);
        resolve(false);
      }
    });
  }

  /**
   * Kill all running processes
   */
  async killAllProcesses(): Promise<void> {
    const killPromises = this.state.getRunningTaskIds().map((taskId) => {
      return new Promise<void>((resolve) => {
        this.killProcess(taskId);
        resolve();
      });
    });
    await Promise.all(killPromises);
  }

  /**
   * Get combined environment variables for a project
   *
   * Priority (later sources override earlier):
   * 1. App-wide memory settings from settings.json (NEW - enables memory from onboarding)
   * 2. Backend source .env (apps/backend/.env) - CLI defaults
   * 3. Project's .auto-claude/.env - Frontend-configured settings (memory, integrations)
   * 4. Project settings (graphitiMcpUrl, useClaudeMd) - Runtime overrides
   */
  getCombinedEnv(projectPath: string): Record<string, string> {
    // Load app-wide memory settings from settings.json
    // This bridges onboarding config to backend agents
    const appSettings = (readSettingsFile() || {}) as Partial<AppSettings>;
    const memoryEnv = buildMemoryEnvVars(appSettings as AppSettings);

    // Existing env sources
    const autoBuildEnv = this.loadAutoBuildEnv();
    const projectFileEnv = this.loadProjectEnv(projectPath);
    const projectSettingsEnv = this.getProjectEnvVars(projectPath);

    // Priority: app-wide memory -> backend .env -> project .env -> project settings
    // Later sources override earlier ones
    return { ...memoryEnv, ...autoBuildEnv, ...projectFileEnv, ...projectSettingsEnv };
  }
}
