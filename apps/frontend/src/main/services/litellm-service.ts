import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { findPythonCommand, parsePythonCommand } from '../python-detector';

export interface LiteLLMStatus {
  isRunning: boolean;
  port: number;
  pid?: number;
  error?: string;
}

/**
 * Service manager for LiteLLM Proxy
 * Automatically starts/stops LiteLLM when needed
 */
export class LiteLLMService extends EventEmitter {
  private process: ChildProcess | null = null;
  private configPath: string | null = null;
  private readonly DEFAULT_PORT = 4000;
  private readonly DEFAULT_CONFIG_NAME = 'litellm_config.yaml';

  /**
   * Get the path to litellm_config.yaml
   * Checks multiple locations:
   * 1. Project root (if running from source)
   * 2. User config directory (~/.config/auto-claude-ui/)
   * 3. App resources (packaged app)
   */
  private getConfigPath(): string | null {
    // If already found, return cached
    if (this.configPath) {
      return this.configPath;
    }

    // 1. Check project root (development)
    const projectRoot = path.join(__dirname, '../../..');
    const projectConfig = path.join(projectRoot, this.DEFAULT_CONFIG_NAME);
    if (fs.existsSync(projectConfig)) {
      this.configPath = projectConfig;
      return projectConfig;
    }

    // 2. Check user config directory
    const userDataDir = app.getPath('userData');
    const userConfig = path.join(userDataDir, this.DEFAULT_CONFIG_NAME);
    if (fs.existsSync(userConfig)) {
      this.configPath = userConfig;
      return userConfig;
    }

    // 3. Check app resources (packaged)
    if (app.isPackaged) {
      const resourcesPath = process.resourcesPath;
      // Check in root of resources (where litellm_config.yaml is bundled)
      const resourcesConfig = path.join(resourcesPath, this.DEFAULT_CONFIG_NAME);
      if (fs.existsSync(resourcesConfig)) {
        this.configPath = resourcesConfig;
        return resourcesConfig;
      }
      // Fallback: check in backend directory
      const backendConfig = path.join(resourcesPath, 'backend', this.DEFAULT_CONFIG_NAME);
      if (fs.existsSync(backendConfig)) {
        this.configPath = backendConfig;
        return backendConfig;
      }
    }

    return null;
  }

  /**
   * Create default config file if it doesn't exist
   */
  private createDefaultConfig(): string {
    const userDataDir = app.getPath('userData');
    const configPath = path.join(userDataDir, this.DEFAULT_CONFIG_NAME);

    // Don't overwrite existing config
    if (fs.existsSync(configPath)) {
      return configPath;
    }

    const defaultConfig = `model_list:
  - model_name: local-model
    litellm_params:
      model: openai/local-model
      api_base: "http://localhost:1234/v1"
      api_key: "lm-studio"

litellm_settings:
  drop_params: true
  set_verbose: true
`;

    fs.writeFileSync(configPath, defaultConfig, 'utf-8');
    console.log(`[LiteLLM] Created default config at: ${configPath}`);
    return configPath;
  }

  /**
   * Check if LiteLLM is already running on the default port
   */
  private async checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const server = net.createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use
          resolve(false);
        } else {
          resolve(true);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Get current status of LiteLLM service
   */
  async getStatus(): Promise<LiteLLMStatus> {
    if (this.process && !this.process.killed) {
      return {
        isRunning: true,
        port: this.DEFAULT_PORT,
        pid: this.process.pid,
      };
    }

    // Check if port is in use (might be running externally)
    const portAvailable = await this.checkPortAvailable(this.DEFAULT_PORT);
    return {
      isRunning: !portAvailable,
      port: this.DEFAULT_PORT,
    };
  }

  /**
   * Start LiteLLM proxy server
   */
  async start(): Promise<void> {
    // Check if already running
    const status = await this.getStatus();
    if (status.isRunning) {
      console.log('[LiteLLM] Already running');
      return;
    }

    // Get or create config
    let configPath = this.getConfigPath();
    if (!configPath) {
      configPath = this.createDefaultConfig();
    }

    // Get Python path
    const pythonPath = findPythonCommand();
    if (!pythonPath) {
      throw new Error('Python not found. Cannot start LiteLLM.');
    }

    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);

    // Start LiteLLM
    console.log(`[LiteLLM] Starting with config: ${configPath}`);
    this.process = spawn(pythonCommand, [
      ...pythonBaseArgs,
      '-m',
      'litellm',
      '--config',
      configPath,
      '--port',
      String(this.DEFAULT_PORT),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONUTF8: '1',
      },
    });

    let startupOutput = '';
    let startupError = '';

    // Collect output to detect when server is ready
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      startupOutput += output;
      console.log(`[LiteLLM] ${output.trim()}`);

      // Check if server is ready
      if (output.includes('Proxy running on') || output.includes('LiteLLM: Proxy running')) {
        this.emit('started', { port: this.DEFAULT_PORT, pid: this.process?.pid });
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      startupError += error;
      console.error(`[LiteLLM] ${error.trim()}`);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[LiteLLM] Process exited with code ${code}, signal ${signal}`);
      this.process = null;
      this.emit('stopped', { code, signal });
    });

    this.process.on('error', (error) => {
      console.error('[LiteLLM] Failed to start:', error);
      this.process = null;
      this.emit('error', error);
    });

    // Wait a bit to see if startup fails immediately
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (this.process.killed || !this.process.pid) {
      throw new Error(`Failed to start LiteLLM: ${startupError || 'Unknown error'}`);
    }
  }

  /**
   * Stop LiteLLM proxy server
   */
  async stop(): Promise<void> {
    if (!this.process || this.process.killed) {
      return;
    }

    console.log('[LiteLLM] Stopping...');
    this.process.kill('SIGTERM');

    // Wait for graceful shutdown
    await new Promise((resolve) => {
      if (!this.process) {
        resolve(undefined);
        return;
      }

      const timeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.log('[LiteLLM] Force killing...');
          this.process.kill('SIGKILL');
        }
        resolve(undefined);
      }, 5000);

      this.process.once('exit', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });
    });

    this.process = null;
  }

  /**
   * Restart LiteLLM proxy server
   */
  async restart(): Promise<void> {
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.start();
  }
}

// Singleton instance
let litellmService: LiteLLMService | null = null;

export function getLiteLLMService(): LiteLLMService {
  if (!litellmService) {
    litellmService = new LiteLLMService();
  }
  return litellmService;
}

