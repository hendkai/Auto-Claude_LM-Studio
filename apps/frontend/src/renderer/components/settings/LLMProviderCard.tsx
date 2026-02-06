/**
 * Provider Card Component
 * =======================
 * 
 * Zeigt einen einzelnen LLM Provider mit Status, Usage und Aktionen.
 */

import { useTranslation } from 'react-i18next';
import { 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  Settings,
  Trash2,
  Power,
  Brain,
  MessageSquare,
  Sparkles,
  Cloud,
  Laptop,
  Globe,
  Moon,
  Wind,
  Layers,
  Library,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import type { 
  LLMProviderSettings, 
  ProviderUsageData,
  LLMProviderType,
} from '../../../shared/types/llm-provider';
import { PROVIDER_METADATA } from '../../../shared/types/llm-provider';

// Icon mapping
const PROVIDER_ICONS: Record<LLMProviderType, LucideIcon> = {
  anthropic: MessageSquare,
  openai: Brain,
  google: Sparkles,
  groq: Zap,
  azure: Cloud,
  ollama: Laptop,
  openrouter: Globe,
  kimi: Moon,
  mistral: Wind,
  cohere: Layers,
  ai21: Library,
  custom: Settings,
};

interface ProviderCardProps {
  provider: LLMProviderSettings;
  usage?: ProviderUsageData;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRefreshUsage: () => void;
  isRefreshing?: boolean;
}

export function LLMProviderCard({
  provider,
  usage,
  onEdit,
  onDelete,
  onToggle,
  onRefreshUsage,
  isRefreshing = false,
}: ProviderCardProps) {
  const { t } = useTranslation(['settings', 'common']);
  const metadata = PROVIDER_METADATA[provider.providerType];
  const Icon = PROVIDER_ICONS[provider.providerType] || Settings;
  
  // Determine status
  const isHealthy = provider.enabled && !usage?.isRateLimited;
  
  return (
    <Card className={cn(
      'transition-all duration-200',
      !provider.enabled && 'opacity-60 grayscale'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              isHealthy 
                ? 'bg-primary/10 text-primary' 
                : 'bg-destructive/10 text-destructive'
            )}>
              <Icon className="h-5 w-5" />
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{provider.name}</h3>
                {provider.enabled ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {metadata.name}
                {provider.options?.defaultModel && (
                  <span className="ml-2">
                    • {provider.options.defaultModel}
                  </span>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggle}
              title={provider.enabled ? 'Disable' : 'Enable'}
            >
              <Power className={cn(
                'h-4 w-4',
                provider.enabled ? 'text-green-500' : 'text-muted-foreground'
              )} />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onEdit}
              title="Edit"
            >
              <Settings className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {provider.enabled && usage?.hasLimits && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Rate Limit Warning */}
            {usage.isRateLimited && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">
                  Rate limited
                  {usage.rateLimitResetAt && (
                    <span className="ml-1">
                      (resets at {usage.rateLimitResetAt.toLocaleTimeString()})
                    </span>
                  )}
                </span>
              </div>
            )}
            
            {/* Usage Bars */}
            <div className="space-y-2">
              {usage.sessionPercent !== undefined && (
                <UsageBar
                  label="Session"
                  percent={usage.sessionPercent}
                />
              )}
              
              {usage.dailyPercent !== undefined && (
                <UsageBar
                  label="Daily"
                  percent={usage.dailyPercent}
                />
              )}
              
              {usage.monthlyPercent !== undefined && (
                <UsageBar
                  label="Monthly"
                  percent={usage.monthlyPercent}
                />
              )}
            </div>
            
            {/* Token & Cost Info */}
            {(usage.totalTokensUsed !== undefined || usage.costIncurred !== undefined) && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {usage.totalTokensUsed !== undefined && (
                  <Badge variant="secondary">
                    {usage.totalTokensUsed.toLocaleString()} tokens
                  </Badge>
                )}
                {usage.costIncurred !== undefined && (
                  <Badge variant="secondary">
                    {usage.costCurrency || '$'}{usage.costIncurred.toFixed(2)}
                  </Badge>
                )}
              </div>
            )}
            
            {/* Refresh Button */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={onRefreshUsage}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
                Refresh
              </Button>
              
              {usage.lastUpdated && (
                <span className="text-xs text-muted-foreground">
                  Updated {usage.lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      )}
      
      {/* No Usage Tracking Warning */}
      {provider.enabled && !usage?.hasLimits && metadata.supportsUsageTracking && (
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Usage data not available
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================
// Usage Bar Component
// ============================================

interface UsageBarProps {
  label: string;
  percent: number;
}

function UsageBar({ label, percent }: UsageBarProps) {
  const getColorClass = (p: number) => {
    if (p >= 90) return 'bg-destructive';
    if (p >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          'font-medium',
          percent >= 90 ? 'text-destructive' : 
          percent >= 75 ? 'text-yellow-600' : 'text-green-600'
        )}>
          {percent}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary">
        <div 
          className={cn('h-full rounded-full transition-all', getColorClass(percent))}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
