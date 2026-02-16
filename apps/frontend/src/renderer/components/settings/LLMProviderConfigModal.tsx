/**
 * LLM Provider Config Modal
 * =========================
 * 
 * Modal zum Hinzufügen oder Bearbeiten eines LLM Providers.
 * Unterstützt alle Provider-Typen mit dynamischen Auth-Formularen.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, TestTube, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription } from '../ui/alert';
import { cn } from '../../lib/utils';
import type { 
  LLMProviderSettings, 
  LLMProviderType,
  ProviderAuthConfig,
  ModelInfo,
} from '../../../shared/types/llm-provider';
import { PROVIDER_METADATA } from '../../../shared/types/llm-provider';

interface LLMProviderConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: Omit<LLMProviderSettings, 'createdAt' | 'updatedAt'>) => void;
  provider: LLMProviderSettings | null;
}

export function LLMProviderConfigModal({
  isOpen,
  onClose,
  onSave,
  provider,
}: LLMProviderConfigModalProps) {
  const { t } = useTranslation(['settings', 'common']);
  const isEditing = !!provider;
  
  // Form state
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<LLMProviderType>('anthropic');
  const [enabled, setEnabled] = useState(true);
  const [authConfig, setAuthConfig] = useState<ProviderAuthConfig>({ type: 'apiKey', apiKey: '' });
  const [defaultModel, setDefaultModel] = useState('');
  const [timeout, setTimeout] = useState(30000);
  const [maxRetries, setMaxRetries] = useState(3);
  
  // UI state
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (provider) {
        setName(provider.name);
        setProviderType(provider.providerType);
        setEnabled(provider.enabled);
        setAuthConfig(provider.auth);
        setDefaultModel(provider.options?.defaultModel || '');
        setTimeout(provider.options?.timeout || 30000);
        setMaxRetries(provider.options?.maxRetries || 3);
      } else {
        setName('');
        setProviderType('anthropic');
        setEnabled(true);
        setAuthConfig({ type: 'apiKey', apiKey: '' });
        setDefaultModel('');
        setTimeout(30000);
        setMaxRetries(3);
      }
      setTestResult(null);
      setAvailableModels([]);
    }
  }, [isOpen, provider]);
  
  // Update auth type when provider type changes
  useEffect(() => {
    const metadata = PROVIDER_METADATA[providerType];
    if (!isEditing) {
      switch (metadata.defaultAuthType) {
        case 'apiKey':
          setAuthConfig({ type: 'apiKey', apiKey: '' });
          break;
        case 'azure':
          setAuthConfig({ type: 'azure', apiKey: '', endpoint: '', deployment: '' });
          break;
        case 'ollama':
          setAuthConfig({ type: 'ollama', baseUrl: 'http://localhost:11434' });
          break;
        default:
          setAuthConfig({ type: 'apiKey', apiKey: '' });
      }
    }
  }, [providerType, isEditing]);
  
  const handleSave = () => {
    const providerData: Omit<LLMProviderSettings, 'createdAt' | 'updatedAt'> = {
      id: provider?.id || generateProviderId(),
      name: name || `${PROVIDER_METADATA[providerType].name} ${Math.floor(Math.random() * 1000)}`,
      providerType,
      auth: authConfig,
      enabled,
      options: {
        defaultModel: defaultModel || undefined,
        timeout,
        maxRetries,
      },
    };
    onSave(providerData);
  };
  
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      // TODO: Implement IPC call to test connection
      // const result = await window.electronAPI.testProviderConnection({
      //   providerType,
      //   auth: authConfig,
      // });
      
      // Simulate test
      await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 1500));
      
      // Simulate success (in reality, check the actual connection)
      const hasAuth = authConfig.type === 'apiKey' 
        ? (authConfig as { apiKey: string }).apiKey.length > 10
        : true;
        
      if (hasAuth) {
        setTestResult({ success: true, message: 'Connection successful!' });
        // Load available models
        loadAvailableModels();
      } else {
        setTestResult({ success: false, message: 'Invalid API key or credentials' });
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Connection failed' 
      });
    } finally {
      setIsTesting(false);
    }
  };
  
  const loadAvailableModels = async () => {
    setIsLoadingModels(true);
    try {
      // TODO: Implement IPC call to fetch models
      // const models = await window.electronAPI.getProviderModels({
      //   providerType,
      //   auth: authConfig,
      // });
      
      // Simulate loading models
      await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 800));
      
      const mockModels: Record<LLMProviderType, ModelInfo[]> = {
        anthropic: [
          { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', providerId: 'mock' },
          { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', providerId: 'mock' },
          { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', providerId: 'mock' },
        ],
        openai: [
          { id: 'gpt-4o', displayName: 'GPT-4o', providerId: 'mock' },
          { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', providerId: 'mock' },
          { id: 'o1-preview', displayName: 'o1 Preview', providerId: 'mock' },
        ],
        // ... other providers
        google: [],
        groq: [],
        azure: [],
        ollama: [],
        openrouter: [],
        kimi: [],
        mistral: [],
        cohere: [],
        ai21: [],
        custom: [],
      };
      
      setAvailableModels(mockModels[providerType] || []);
    } finally {
      setIsLoadingModels(false);
    }
  };
  
  const canSave = name.trim() && (
    authConfig.type !== 'apiKey' || 
    (authConfig as { apiKey: string }).apiKey.trim()
  );
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing 
              ? t('settings:llmProviders.editProvider') 
              : t('settings:llmProviders.addProvider')
            }
          </DialogTitle>
          <DialogDescription>
            {t('settings:llmProviders.providerConfigDescription')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Provider Type */}
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="provider-type">
                {t('settings:llmProviders.providerType')}
              </Label>
              <Select
                value={providerType}
                onValueChange={(v) => setProviderType(v as LLMProviderType)}
              >
                <SelectTrigger id="provider-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_METADATA).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span>{meta.name}</span>
                        {meta.isLocal && (
                          <span className="text-xs text-muted-foreground">(Local)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {PROVIDER_METADATA[providerType].description}
              </p>
            </div>
          )}
          
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="provider-name">
              {t('settings:llmProviders.providerName')}
            </Label>
            <Input
              id="provider-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={PROVIDER_METADATA[providerType].name}
            />
          </div>
          
          {/* Auth Configuration */}
          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="font-medium">
              {t('settings:llmProviders.authentication')}
            </h4>
            
            {authConfig.type === 'apiKey' && (
              <div className="space-y-2">
                <Label htmlFor="api-key">
                  API Key
                </Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={(authConfig as { apiKey: string }).apiKey}
                    onChange={(e) => setAuthConfig({ 
                      type: 'apiKey', 
                      apiKey: e.target.value 
                    })}
                    placeholder="sk-..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}
            
            {authConfig.type === 'azure' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={(authConfig as { apiKey: string }).apiKey}
                    onChange={(e) => setAuthConfig({ 
                      ...authConfig as { type: 'azure', apiKey: string, endpoint: string, deployment: string },
                      apiKey: e.target.value 
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Endpoint URL</Label>
                  <Input
                    value={(authConfig as { endpoint: string }).endpoint}
                    onChange={(e) => setAuthConfig({ 
                      ...authConfig as { type: 'azure', apiKey: string, endpoint: string, deployment: string },
                      endpoint: e.target.value 
                    })}
                    placeholder="https://your-resource.openai.azure.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deployment Name</Label>
                  <Input
                    value={(authConfig as { deployment: string }).deployment}
                    onChange={(e) => setAuthConfig({ 
                      ...authConfig as { type: 'azure', apiKey: string, endpoint: string, deployment: string },
                      deployment: e.target.value 
                    })}
                    placeholder="gpt-4"
                  />
                </div>
              </div>
            )}
            
            {authConfig.type === 'ollama' && (
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input
                  value={(authConfig as { baseUrl: string }).baseUrl}
                  onChange={(e) => setAuthConfig({ 
                    type: 'ollama', 
                    baseUrl: e.target.value 
                  })}
                  placeholder="http://localhost:11434"
                />
              </div>
            )}
            
            {/* Test Connection Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting || !canSave}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="mr-2 h-4 w-4" />
                  Test Connection
                </>
              )}
            </Button>
            
            {/* Test Result */}
            {testResult && (
              <Alert variant={testResult.success ? 'default' : 'destructive'}>
                <div className="flex items-center gap-2">
                  {testResult.success && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  <AlertDescription>{testResult.message}</AlertDescription>
                </div>
              </Alert>
            )}
          </div>
          
          {/* Default Model */}
          {availableModels.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="default-model">
                {t('settings:llmProviders.defaultModel')}
              </Label>
              <Select
                value={defaultModel}
                onValueChange={setDefaultModel}
              >
                <SelectTrigger id="default-model">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {isLoadingModels && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading available models...
            </div>
          )}
          
          {/* Advanced Options */}
          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="font-medium">
              {t('settings:llmProviders.advancedOptions')}
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeout">
                  Timeout (ms)
                </Label>
                <Input
                  id="timeout"
                  type="number"
                  value={timeout}
                  onChange={(e) => setTimeout(Number(e.target.value))}
                  min={1000}
                  step={1000}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="max-retries">
                  Max Retries
                </Label>
                <Input
                  id="max-retries"
                  type="number"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                  min={0}
                  max={10}
                />
              </div>
            </div>
          </div>
          
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="enabled" className="cursor-pointer">
                {t('settings:llmProviders.enableProvider')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings:llmProviders.enableProviderDescription')}
              </p>
            </div>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEditing ? t('common:save') : t('common:add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function generateProviderId(): string {
  return `provider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
