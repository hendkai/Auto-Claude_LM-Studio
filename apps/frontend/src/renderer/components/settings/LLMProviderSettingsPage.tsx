/**
 * LLM Provider Settings Page
 * ==========================
 * 
 * Kombinierte Seite für API Integrations und CLI Tools.
 * Zeigt beide Bereiche getrennt mit klaren Überschriften.
 */

import { useTranslation } from 'react-i18next';
import { Key, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Separator } from '../ui/separator';
import { LLMProviderList } from './LLMProviderList';
import { PhaseModelConfiguration } from './PhaseModelConfiguration';
import { CLIToolsIntegration } from './CLIToolsIntegration';

export function LLMProviderSettingsPage() {
  const { t } = useTranslation('settings');
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {t('settings:llmSettings.title', 'AI Model Settings')}
        </h1>
        <p className="text-muted-foreground">
          {t('settings:llmSettings.description', 
            'Configure LLM providers for automated tasks and manage CLI coding tools.')}
        </p>
      </div>
      
      {/* Section 1: API Integrations */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">
            {t('settings:llmSettings.apiIntegrations', 'API Integrations')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t('settings:llmSettings.apiIntegrationsDesc', 
            'Add LLM providers with API keys. These are used by the agent for automated tasks like spec creation, code generation, and reviews.')}
        </p>
        
        <LLMProviderList />
        
        <Separator className="my-8" />
        
        <PhaseModelConfiguration />
      </section>
      
      <Separator className="my-8" />
      
      {/* Section 2: CLI Tools */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">
            {t('settings:llmSettings.cliTools', 'CLI Tools Integration')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t('settings:llmSettings.cliToolsDesc', 
            'Manage local CLI coding agents (Claude Code, Kimi Code, Codex). These run independently on your system.')}
        </p>
        
        <CLIToolsIntegration />
      </section>
    </div>
  );
}
