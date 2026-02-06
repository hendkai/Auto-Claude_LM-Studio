/**
 * LLM Provider List Component
 * ===========================
 * 
 * Zeigt alle konfigurierten LLM Provider und erlaubt Hinzufügen/Bearbeiten/Löschen.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { LLMProviderCard } from './LLMProviderCard';
import { LLMProviderConfigModal } from './LLMProviderConfigModal';
import { useLLMProviderStore, useAllProviderUsage } from '../../stores/llm-provider-store';
import type { LLMProviderSettings } from '../../../shared/types/llm-provider';

export function LLMProviderList() {
  const { t } = useTranslation(['settings', 'common']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProviderSettings | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  
  const providers = useLLMProviderStore((state) => state.providers);
  const usageData = useAllProviderUsage();
  const { 
    addProvider, 
    updateProvider, 
    removeProvider, 
    toggleProvider,
    updateUsageData 
  } = useLLMProviderStore();
  
  // Group providers by enabled status
  const enabledProviders = providers.filter(p => p.enabled);
  const disabledProviders = providers.filter(p => !p.enabled);
  
  const handleAdd = () => {
    setEditingProvider(null);
    setIsModalOpen(true);
  };
  
  const handleEdit = (provider: LLMProviderSettings) => {
    setEditingProvider(provider);
    setIsModalOpen(true);
  };
  
  const handleSave = (providerData: Omit<LLMProviderSettings, 'createdAt' | 'updatedAt'>) => {
    if (editingProvider) {
      updateProvider(editingProvider.id, providerData);
    } else {
      addProvider(providerData);
    }
    setIsModalOpen(false);
  };
  
  const handleDelete = (providerId: string) => {
    if (confirm(t('settings:llmProviders.confirmDelete'))) {
      removeProvider(providerId);
    }
  };
  
  const handleToggle = (providerId: string) => {
    toggleProvider(providerId);
  };
  
  const handleRefreshUsage = async (providerId: string) => {
    setRefreshingId(providerId);
    try {
      // TODO: Call IPC to fetch real usage from backend
      // const usage = await window.electronAPI.getProviderUsage(providerId);
      
      // For now, simulate with mock data
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateUsageData(providerId, {
        hasLimits: true,
        sessionPercent: Math.floor(Math.random() * 100),
        dailyPercent: Math.floor(Math.random() * 100),
        isRateLimited: false,
        inputTokensUsed: Math.floor(Math.random() * 1000000),
        outputTokensUsed: Math.floor(Math.random() * 500000),
        costIncurred: Math.random() * 50,
      });
    } finally {
      setRefreshingId(null);
    }
  };
  
  const hasProviders = providers.length > 0;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {t('settings:llmProviders.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('settings:llmProviders.description')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {t('settings:llmProviders.addProvider')}
        </Button>
      </div>
      
      {/* No Providers Warning */}
      {!hasProviders && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('settings:llmProviders.noProvidersWarning')}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Enabled Providers */}
      {enabledProviders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('settings:llmProviders.enabledProviders')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {enabledProviders.map((provider) => (
              <LLMProviderCard
                key={provider.id}
                provider={provider}
                usage={usageData.find(u => u.providerId === provider.id)}
                onEdit={() => handleEdit(provider)}
                onDelete={() => handleDelete(provider.id)}
                onToggle={() => handleToggle(provider.id)}
                onRefreshUsage={() => handleRefreshUsage(provider.id)}
                isRefreshing={refreshingId === provider.id}
              />
            ))}
          </CardContent>
        </Card>
      )}
      
      {/* Disabled Providers */}
      {disabledProviders.length > 0 && (
        <Card className="opacity-75">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              {t('settings:llmProviders.disabledProviders')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {disabledProviders.map((provider) => (
              <LLMProviderCard
                key={provider.id}
                provider={provider}
                usage={usageData.find(u => u.providerId === provider.id)}
                onEdit={() => handleEdit(provider)}
                onDelete={() => handleDelete(provider.id)}
                onToggle={() => handleToggle(provider.id)}
                onRefreshUsage={() => handleRefreshUsage(provider.id)}
                isRefreshing={refreshingId === provider.id}
              />
            ))}
          </CardContent>
        </Card>
      )}
      
      {/* Provider Config Modal */}
      <LLMProviderConfigModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        provider={editingProvider}
      />
    </div>
  );
}
