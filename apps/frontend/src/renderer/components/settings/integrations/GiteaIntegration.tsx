import { useState } from 'react';
import { RefreshCw, Info, Link, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PasswordInput } from '../../project-settings/PasswordInput';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Separator } from '../../ui/separator';
import { Button } from '../../ui/button';
import { Loader2 } from 'lucide-react';
import type { ProjectEnvConfig, GiteaSyncStatus } from '../../../../shared/types';

function GiteaIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" role="img" aria-labelledby="gitea-icon-title">
            <title id="gitea-icon-title">Gitea</title>
            <path d="M19.14 7.5A2.86 2.86 0 0 1 22 10.36v3.78A2.86 2.86 0 0 1 19.14 17H12a2 2 0 0 0-2 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.36A4.64 4.64 0 0 1 8.64 15h2.22v-.86A2.86 2.86 0 0 1 8 11.28V7.5a2.86 2.86 0 0 1 2.86-2.86h8.28A2.86 2.86 0 0 1 19.14 7.5zm-5.07 7.14H19a1.79 1.79 0 0 0 1.79-1.79v-2.5a1.79 1.79 0 0 0-1.79-1.79h-5.93zM13 13.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" />
        </svg>
    );
}

interface GiteaIntegrationProps {
    envConfig: ProjectEnvConfig | null;
    updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
    giteaConnectionStatus: GiteaSyncStatus | null;
    isCheckingGitea: boolean;
}

export function GiteaIntegration({
    envConfig,
    updateEnvConfig,
    giteaConnectionStatus,
    isCheckingGitea,
}: GiteaIntegrationProps) {
    if (!envConfig) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="font-normal text-foreground">Enable Gitea Issues</Label>
                    <p className="text-xs text-muted-foreground">
                        Sync issues from Gitea and create tasks automatically
                    </p>
                </div>
                <Switch
                    checked={envConfig.giteaEnabled}
                    onCheckedChange={(checked) => updateEnvConfig({ giteaEnabled: checked })}
                />
            </div>

            {envConfig.giteaEnabled && (
                <>
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">Gitea Instance URL</Label>
                        <p className="text-xs text-muted-foreground">
                            The full URL to your Gitea instance (e.g. <code className="px-1 bg-muted rounded">https://gitea.example.com</code>)
                        </p>
                        <div className="relative">
                            <Link className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="https://gitea.your-domain.com"
                                value={envConfig.giteaInstanceUrl || ''}
                                onChange={(e) => updateEnvConfig({ giteaInstanceUrl: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">Access Token</Label>
                        <p className="text-xs text-muted-foreground">
                            Create a token from your Gitea User Settings -&gt; Applications
                        </p>
                        <div className="relative">
                            <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground z-10" />
                            <PasswordInput
                                className="pl-9"
                                value={envConfig.giteaToken || ''}
                                onChange={(value) => updateEnvConfig({ giteaToken: value })}
                                placeholder="sha1_token..."
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">Repository</Label>
                        <p className="text-xs text-muted-foreground">
                            Format: <code className="px-1 bg-muted rounded">owner/repo</code> (e.g., my-org/my-project)
                        </p>
                        <Input
                            placeholder="owner/repository"
                            value={envConfig.giteaRepo || ''}
                            onChange={(e) => updateEnvConfig({ giteaRepo: e.target.value })}
                        />
                    </div>

                    {/* Connection Status */}
                    {envConfig.giteaToken && envConfig.giteaRepo && envConfig.giteaInstanceUrl && (
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-foreground">Connection Status</p>
                                    <p className="text-xs text-muted-foreground">
                                        {isCheckingGitea ? 'Checking...' :
                                            giteaConnectionStatus?.connected
                                                ? `Connected to ${giteaConnectionStatus.repoFullName}`
                                                : giteaConnectionStatus?.error || 'Not connected'}
                                    </p>
                                </div>
                                {isCheckingGitea ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : giteaConnectionStatus?.connected ? (
                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-warning" />
                                )}
                            </div>
                        </div>
                    )}

                    <Separator />

                    {/* Auto-sync Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 text-info" />
                                <Label className="font-normal text-foreground">Auto-Sync on Load</Label>
                            </div>
                            <p className="text-xs text-muted-foreground pl-6">
                                Automatically fetch issues when the project loads
                            </p>
                        </div>
                        <Switch
                            checked={envConfig.giteaAutoSync || false}
                            onCheckedChange={(checked) => updateEnvConfig({ giteaAutoSync: checked })}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
