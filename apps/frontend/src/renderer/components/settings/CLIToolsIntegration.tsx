/**
 * CLI Tools Integration
 * =====================
 *
 * Verwaltung der lokalen CLI Tools (Claude Code, Kimi Code, Codex).
 * Separat von API Integrations - diese Tools laufen lokal auf dem System.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal,
  Code,
  Sparkles,
  Download,
  Check,
  AlertTriangle,
  X,
  Loader2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { cn } from '../../lib/utils';

// CLI Tool definitions
interface CLITool {
  id: 'claude-code' | 'kimi-code' | 'codex';
  name: string;
  description: string;
  icon: React.ElementType;
  docsUrl: string;
  checkInstalled: () => Promise<CLIToolStatus | null>;
  install: () => Promise<void>;
}

interface CLIToolStatus {
  installed: boolean;
  version: string | null;
  latestVersion: string | null;
  isOutdated: boolean;
  path: string | null;
}

interface CLIStatusPayload {
  installed: string | null;
  latest: string | null;
  isOutdated: boolean;
  path?: string;
  detectionResult?: {
    path?: string;
  };
}

function normalizeStatus(payload: CLIStatusPayload): CLIToolStatus {
  const installed = payload.installed ?? null;
  const latest = payload.latest && payload.latest !== 'unknown' ? payload.latest : null;
  return {
    installed: Boolean(installed),
    version: installed,
    latestVersion: latest,
    isOutdated: Boolean(installed && latest && payload.isOutdated),
    path: payload.path ?? payload.detectionResult?.path ?? null,
  };
}

async function checkClaudeCodeStatus(): Promise<CLIToolStatus | null> {
  if (!window.electronAPI?.checkClaudeCodeVersion) return null;
  const result = await window.electronAPI.checkClaudeCodeVersion();
  if (!result.success || !result.data) return null;
  return normalizeStatus(result.data);
}

async function checkKimiCodeStatus(): Promise<CLIToolStatus | null> {
  if (!window.electronAPI?.checkKimiCodeVersion) return null;
  const result = await window.electronAPI.checkKimiCodeVersion();
  if (!result.success || !result.data) return null;
  return normalizeStatus(result.data);
}

async function checkCodexStatus(): Promise<CLIToolStatus | null> {
  if (!window.electronAPI?.checkCodexVersion) return null;
  const result = await window.electronAPI.checkCodexVersion();
  if (!result.success || !result.data) return null;
  return normalizeStatus(result.data);
}

const CLI_TOOLS: CLITool[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic\'s official CLI agent for coding tasks',
    icon: Terminal,
    docsUrl: 'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview',
    checkInstalled: checkClaudeCodeStatus,
    install: async () => {
      if (!window.electronAPI?.installClaudeCode) throw new Error('Claude Code installer unavailable');
      const result = await window.electronAPI.installClaudeCode();
      if (!result.success) throw new Error(result.error || 'Install failed');
    },
  },
  {
    id: 'kimi-code',
    name: 'Kimi Code',
    description: 'Moonshot AI\'s CLI agent (Kimi)',
    icon: Sparkles,
    docsUrl: 'https://github.com/MoonshotAI/kimi-cli',
    checkInstalled: checkKimiCodeStatus,
    install: async () => {
      if (!window.electronAPI?.installKimiCode) throw new Error('Kimi Code installer unavailable');
      const result = await window.electronAPI.installKimiCode();
      if (!result.success) throw new Error(result.error || 'Install failed');
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI\'s official CLI coding agent',
    icon: Code,
    docsUrl: 'https://github.com/openai/codex/blob/main/README.md',
    checkInstalled: checkCodexStatus,
    install: async () => {
      if (!window.electronAPI?.installCodex) throw new Error('Codex installer unavailable');
      const result = await window.electronAPI.installCodex();
      if (!result.success) throw new Error(result.error || 'Install failed');
    },
  },
];

export function CLIToolsIntegration() {
  const { t } = useTranslation('settings');
  const [statuses, setStatuses] = useState<Record<string, CLIToolStatus | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  
  // Check all tools on mount
  useEffect(() => {
    checkAllTools();
  }, []);
  
  const checkAllTools = async () => {
    const results: Record<string, CLIToolStatus | null> = {};
    
    for (const tool of CLI_TOOLS) {
      setLoading(prev => ({ ...prev, [tool.id]: true }));
      try {
        results[tool.id] = await tool.checkInstalled();
      } catch (error) {
        results[tool.id] = null;
      } finally {
        setLoading(prev => ({ ...prev, [tool.id]: false }));
      }
    }
    
    setStatuses(results);
  };
  
  const checkTool = async (tool: CLITool) => {
    setLoading(prev => ({ ...prev, [tool.id]: true }));
    try {
      const status = await tool.checkInstalled();
      setStatuses(prev => ({ ...prev, [tool.id]: status }));
    } finally {
      setLoading(prev => ({ ...prev, [tool.id]: false }));
    }
  };
  
  const installTool = async (tool: CLITool) => {
    setInstalling(prev => ({ ...prev, [tool.id]: true }));
    try {
      await tool.install();
      // Re-check after install
      await checkTool(tool);
    } catch (error) {
      console.error(`Failed to install ${tool.name}:`, error);
    } finally {
      setInstalling(prev => ({ ...prev, [tool.id]: false }));
    }
  };

  const openDocs = async (tool: CLITool) => {
    try {
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(tool.docsUrl);
        return;
      }
      window.open(tool.docsUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(`Failed to open docs for ${tool.name}:`, error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          {t('settings:cliTools.title', 'CLI Tools Integration')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('settings:cliTools.description', 
            'Manage local CLI coding agents. These tools run directly on your system and work independently from API integrations.')}
        </p>
      </div>
      
      <div className="grid gap-4">
        {CLI_TOOLS.map((tool) => {
          const status = statuses[tool.id];
          const isLoading = loading[tool.id];
          const isInstalling = installing[tool.id];
          const Icon = tool.icon;
          
          return (
            <Card key={tool.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      status?.installed 
                        ? 'bg-green-500/10 text-green-500' 
                        : 'bg-muted text-muted-foreground'
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{tool.name}</CardTitle>
                        {isLoading && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                      </div>
                      <CardDescription>{tool.description}</CardDescription>
                    </div>
                  </div>
                  
                  <StatusBadge status={status} />
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {/* Status Details */}
                {status?.installed && (
                  <div className="mb-4 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Version:</span>
                      <span className="font-mono">{status.version}</span>
                      {status.isOutdated && (
                        <Badge variant="warning" className="text-[10px]">
                          Update available: {status.latestVersion}
                        </Badge>
                      )}
                    </div>
                    {status.path && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span>Path:</span>
                        <code className="text-xs">{status.path}</code>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {!status?.installed ? (
                    <Button
                      size="sm"
                      onClick={() => installTool(tool)}
                      disabled={isInstalling}
                    >
                      {isInstalling ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Installing...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Install
                        </>
                      )}
                    </Button>
                  ) : (
                    <>
                      {status.isOutdated && (
                        <Button
                          size="sm"
                          onClick={() => installTool(tool)}
                          disabled={isInstalling}
                        >
                          {isInstalling ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Update
                        </Button>
                      )}
                    </>
                  )}
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => checkTool(tool)}
                    disabled={isLoading}
                  >
                    <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                    Refresh
                  </Button>
                  
                  <Separator orientation="vertical" className="h-6" />
                  
                  <Button
                    size="sm"
                    variant="link"
                    className="text-muted-foreground"
                    onClick={() => openDocs(tool)}
                  >
                    Documentation
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Info Box */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">What's the difference?</p>
              <p>
                <strong>CLI Tools</strong> run locally on your machine and require their own 
                authentication (usually via browser OAuth). They work independently from the 
                API integrations above.
              </p>
              <p className="mt-2">
                <strong>API Integrations</strong> are used by the Auto Claude agent for automated 
                tasks and are configured with API keys in the settings.
              </p>
              <p className="mt-2">
                <strong>OpenCode</strong> is available as a preset in API profiles (Custom Endpoints).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Status Badge Component
// ============================================

function StatusBadge({ status }: { status: CLIToolStatus | null | undefined }) {
  if (!status) {
    return <Badge variant="secondary">Unknown</Badge>;
  }
  
  if (!status.installed) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <X className="mr-1 h-3 w-3" />
        Not Installed
      </Badge>
    );
  }
  
  if (status.isOutdated) {
    return (
      <Badge variant="warning">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Update Available
      </Badge>
    );
  }
  
  return (
    <Badge variant="success" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
      <Check className="mr-1 h-3 w-3" />
      Installed
    </Badge>
  );
}
