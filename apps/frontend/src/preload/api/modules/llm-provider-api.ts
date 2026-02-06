/**
 * LLM Provider API for renderer process
 * =====================================
 * 
 * Provides access to LLM provider management and routing.
 */

import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  LLMProviderSettings,
  ModelInfo,
  ProviderUsageData,
  RoutingContext,
  RoutingResult,
} from '../../../shared/types/llm-provider';
import { invokeIpc } from './ipc-utils';

/**
 * LLM Provider API interface exposed to renderer
 */
export interface LLMProviderAPI {
  // Provider management
  listProviders: () => Promise<{ success: boolean; data?: LLMProviderSettings[]; error?: string }>;
  addProvider: (provider: Omit<LLMProviderSettings, 'createdAt' | 'updatedAt'>) => 
    Promise<{ success: boolean; data?: LLMProviderSettings; error?: string }>;
  updateProvider: (providerId: string, updates: Partial<LLMProviderSettings>) => 
    Promise<{ success: boolean; data?: LLMProviderSettings; error?: string }>;
  deleteProvider: (providerId: string) => 
    Promise<{ success: boolean; data?: boolean; error?: string }>;
  
  // Provider testing and discovery
  testProviderConnection: (providerType: string, auth: unknown) => 
    Promise<{ success: boolean; data?: { success: boolean; message: string }; error?: string }>;
  getProviderModels: (providerId: string) => 
    Promise<{ success: boolean; data?: ModelInfo[]; error?: string }>;
  getProviderUsage: (providerId: string) => 
    Promise<{ success: boolean; data?: ProviderUsageData; error?: string }>;
  
  // Routing
  routeCompletion: (context: RoutingContext, request: unknown) => 
    Promise<{ success: boolean; data?: RoutingResult; error?: string }>;
}

/**
 * Creates the LLM Provider API implementation
 */
export const createLLMProviderAPI = (): LLMProviderAPI => ({
  listProviders: () => invokeIpc(IPC_CHANNELS.LLM_PROVIDER_LIST),
  
  addProvider: (provider) => invokeIpc(IPC_CHANNELS.LLM_PROVIDER_ADD, provider),
  
  updateProvider: (providerId, updates) => 
    invokeIpc(IPC_CHANNELS.LLM_PROVIDER_UPDATE, providerId, updates),
  
  deleteProvider: (providerId) => 
    invokeIpc(IPC_CHANNELS.LLM_PROVIDER_DELETE, providerId),
  
  testProviderConnection: (providerType, auth) => 
    invokeIpc(IPC_CHANNELS.LLM_PROVIDER_TEST, providerType, auth),
  
  getProviderModels: (providerId) => 
    invokeIpc(IPC_CHANNELS.LLM_PROVIDER_GET_MODELS, providerId),
  
  getProviderUsage: (providerId) => 
    invokeIpc(IPC_CHANNELS.LLM_PROVIDER_GET_USAGE, providerId),
  
  routeCompletion: (context, request) => 
    invokeIpc(IPC_CHANNELS.LLM_ROUTE_COMPLETION, context, request),
});
