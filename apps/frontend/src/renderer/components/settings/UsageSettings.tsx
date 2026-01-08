import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { SettingsSection } from './SettingsSection';
import type { ClaudeUsageSnapshot } from '../../../shared/types/agent';

export function UsageSettings() {
    const { t } = useTranslation('settings');
    const [usageStats, setUsageStats] = useState<ClaudeUsageSnapshot | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchUsage = async () => {
        setLoading(true);
        try {
            const result = await window.electronAPI.requestUsageUpdate();
            if (result.success && result.data) {
                setUsageStats(result.data);
            }
        } finally {
            setLoading(false);
        }
    };

    // Listen for usage updates
    useEffect(() => {
        const unsubscribe = window.electronAPI.onUsageUpdated((snapshot: ClaudeUsageSnapshot) => {
            setUsageStats(snapshot);
        });

        // Initial fetch
        fetchUsage();

        return unsubscribe;
    }, []);

    return (
        <SettingsSection
            title="Usage Statistics"
            description="Detailed breakdown of your AI model usage, including token counts and rate limits."
        >
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Activity className="h-4 w-4 text-primary" />
                            Current Usage
                        </h4>
                        {usageStats?.fetchedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Last updated: {new Date(usageStats.fetchedAt).toLocaleTimeString()}
                            </p>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchUsage}
                        disabled={loading}
                        className="gap-2"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>

                {usageStats ? (
                    <div className="rounded-lg border border-border bg-card overflow-hidden">
                        {/* Header: Active Profile */}
                        <div className="p-4 border-b border-border bg-muted/20">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-muted-foreground">Active Profile</span>
                                <span className="font-semibold">{usageStats.profileName}</span>
                            </div>
                        </div>

                        <div className="p-4 space-y-6">
                            {/* Custom Details (GLM) or Standard */}
                            {usageStats.customUsageDetails && usageStats.customUsageDetails.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4">
                                        {usageStats.customUsageDetails.map((detail, idx) => (
                                            <div key={idx} className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-medium text-sm">{detail.label}</span>
                                                    <span className={cn(
                                                        "font-mono font-bold text-sm",
                                                        detail.percentage >= 90 ? "text-red-500" :
                                                            detail.percentage >= 75 ? "text-orange-500" :
                                                                "text-green-500"
                                                    )}>{Math.round(detail.percentage)}%</span>
                                                </div>

                                                <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-2">
                                                    <div
                                                        className={cn("h-full transition-all",
                                                            detail.percentage >= 90 ? "bg-red-500" :
                                                                detail.percentage >= 75 ? "bg-orange-500" :
                                                                    "bg-green-500"
                                                        )}
                                                        style={{ width: `${Math.min(detail.percentage, 100)}%` }}
                                                    />
                                                </div>

                                                <div className="flex justify-between items-center text-xs text-muted-foreground">
                                                    <span className="font-mono">{detail.value || 'Wait...'}</span>
                                                    {detail.resetTime && (
                                                        <span className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                                                            Resets: {detail.resetTime}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                /* Standard Anthropic View */
                                <div className="space-y-4">
                                    {/* Session */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label>Session Limit (5-hour)</Label>
                                            <span className="font-mono">{usageStats.sessionPercent}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full transition-all",
                                                    usageStats.sessionPercent >= 90 ? "bg-red-500" :
                                                        usageStats.sessionPercent >= 75 ? "bg-orange-500" :
                                                            "bg-green-500"
                                                )}
                                                style={{ width: `${Math.min(usageStats.sessionPercent, 100)}%` }}
                                            />
                                        </div>
                                        {usageStats.sessionResetTime && (
                                            <p className="text-xs text-right text-muted-foreground">
                                                Resets: {usageStats.sessionResetTime}
                                            </p>
                                        )}
                                    </div>

                                    {/* Weekly */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label>Weekly Limit</Label>
                                            <span className="font-mono">{usageStats.weeklyPercent}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full transition-all",
                                                    usageStats.weeklyPercent >= 90 ? "bg-red-500" :
                                                        usageStats.weeklyPercent >= 75 ? "bg-orange-500" :
                                                            "bg-green-500"
                                                )}
                                                style={{ width: `${Math.min(usageStats.weeklyPercent, 100)}%` }}
                                            />
                                        </div>
                                        {usageStats.weeklyResetTime && (
                                            <p className="text-xs text-right text-muted-foreground">
                                                Resets: {usageStats.weeklyResetTime}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Activity className="h-8 w-8 mb-3 opacity-50" />
                            <p>No usage data available.</p>
                            <Button variant="link" onClick={fetchUsage} className="mt-2">
                                Try loading again
                            </Button>
                        </div>
                    </div>
                )}

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-6">
                    <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-1">
                        About Usage Limits
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        Usage limits are determined by the API provider (Anthropic, GLM, etc.).
                        Auto-Claude monitors these limits to prevent interruptions and can automatically switch profiles if additional accounts are configured.
                    </p>
                </div>
            </div>
        </SettingsSection>
    );
}
