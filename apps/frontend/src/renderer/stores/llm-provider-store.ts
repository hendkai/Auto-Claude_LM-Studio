/**
 * LLM Provider Store
 * ==================
 * 
 * Zustandsmanagement für LLM Provider.
 * Verwaltet Provider-Instanzen, Usage-Daten und Routing-Konfiguration.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  LLMProviderSettings,
  LLMProviderType,
  ModelInfo,
  ModelReference,
  ProviderUsageData,
  PhaseModelPriorityConfig,
  FeatureModelPriorityConfig,
  FallbackConfiguration,
  RoutingContext,
  RoutingResult,
  PipelinePhase,
  FeatureType,
} from '../../shared/types/llm-provider';
import {
  DEFAULT_PHASE_MODEL_PRIORITIES,
  DEFAULT_FEATURE_MODEL_PRIORITIES,
  DEFAULT_FALLBACK_CONFIG,
  PROVIDER_METADATA,
} from '../../shared/types/llm-provider';

// ============================================
// Store State
// ============================================

interface LLMProviderState {
  // Provider instances
  providers: LLMProviderSettings[];
  
  // Usage data cache
  usageData: Record<string, ProviderUsageData>;
  
  // Configuration
  phaseModelPriorities: PhaseModelPriorityConfig;
  featureModelPriorities: FeatureModelPriorityConfig;
  fallbackConfig: FallbackConfiguration;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
}

// ============================================
// Store Actions
// ============================================

interface LLMProviderActions {
  // Provider management
  addProvider: (provider: Omit<LLMProviderSettings, 'createdAt' | 'updatedAt'>) => void;
  updateProvider: (providerId: string, updates: Partial<LLMProviderSettings>) => void;
  removeProvider: (providerId: string) => void;
  toggleProvider: (providerId: string) => void;
  
  // Usage data
  updateUsageData: (providerId: string, usage: Partial<ProviderUsageData>) => void;
  refreshAllUsage: () => Promise<void>;
  
  // Priority configuration
  setPhasePriorities: (phase: PipelinePhase, priorities: ModelReference[]) => void;
  setFeaturePriorities: (feature: FeatureType, priorities: ModelReference[]) => void;
  addModelToPhasePriority: (phase: PipelinePhase, reference: ModelReference, index?: number) => void;
  removeModelFromPhasePriority: (phase: PipelinePhase, index: number) => void;
  movePhasePriority: (phase: PipelinePhase, fromIndex: number, toIndex: number) => void;
  
  addModelToFeaturePriority: (feature: FeatureType, reference: ModelReference, index?: number) => void;
  removeModelFromFeaturePriority: (feature: FeatureType, index: number) => void;
  moveFeaturePriority: (feature: FeatureType, fromIndex: number, toIndex: number) => void;
  
  // Fallback configuration
  updateFallbackConfig: (config: Partial<FallbackConfiguration>) => void;
  
  // Routing
  getAvailableModel: (context: RoutingContext) => RoutingResult | null;
  hasAvailableProvider: (priorityList: ModelReference[]) => boolean;
  
  // Reset
  resetToDefaults: () => void;
}

// ============================================
// Store Implementation
// ============================================

export const useLLMProviderStore = create<LLMProviderState & LLMProviderActions>()(
  immer(
    persist(
      (set, get) => ({
        // ============================================
        // Initial State
        // ============================================
        providers: [],
        usageData: {},
        phaseModelPriorities: DEFAULT_PHASE_MODEL_PRIORITIES,
        featureModelPriorities: DEFAULT_FEATURE_MODEL_PRIORITIES,
        fallbackConfig: DEFAULT_FALLBACK_CONFIG,
        isLoading: false,
        error: null,
        
        // ============================================
        // Provider Management
        // ============================================
        
        addProvider: (provider) => {
          set((state) => {
            const now = new Date();
            state.providers.push({
              ...provider,
              createdAt: now,
              updatedAt: now,
            });
          });
        },
        
        updateProvider: (providerId, updates) => {
          set((state) => {
            const index = state.providers.findIndex((p: LLMProviderSettings) => p.id === providerId);
            if (index !== -1) {
              state.providers[index] = {
                ...state.providers[index],
                ...updates,
                updatedAt: new Date(),
              };
            }
          });
        },
        
        removeProvider: (providerId) => {
          set((state) => {
            state.providers = state.providers.filter((p: LLMProviderSettings) => p.id !== providerId);
            delete state.usageData[providerId];
          });
        },
        
        toggleProvider: (providerId) => {
          set((state) => {
            const provider = state.providers.find((p: LLMProviderSettings) => p.id === providerId);
            if (provider) {
              provider.enabled = !provider.enabled;
              provider.updatedAt = new Date();
            }
          });
        },
        
        // ============================================
        // Usage Data
        // ============================================
        
        updateUsageData: (providerId, usage) => {
          set((state) => {
            const existing = state.usageData[providerId];
            state.usageData[providerId] = {
              ...existing,
              ...usage,
              providerId,
              lastUpdated: new Date(),
            };
          });
        },
        
        refreshAllUsage: async () => {
          set({ isLoading: true, error: null });
          try {
            // TODO: Implement IPC calls to backend for usage refresh
            // For now, this is a placeholder
            set({ isLoading: false });
          } catch (error) {
            set({ 
              isLoading: false, 
              error: error instanceof Error ? error.message : 'Failed to refresh usage' 
            });
          }
        },
        
        // ============================================
        // Priority Configuration
        // ============================================
        
        setPhasePriorities: (phase, priorities) => {
          set((state) => {
            state.phaseModelPriorities[phase] = priorities;
          });
        },
        
        setFeaturePriorities: (feature, priorities) => {
          set((state) => {
            state.featureModelPriorities[feature] = priorities;
          });
        },
        
        addModelToPhasePriority: (phase, reference, index) => {
          set((state) => {
            const list = state.phaseModelPriorities[phase];
            if (index !== undefined && index >= 0 && index <= list.length) {
              list.splice(index, 0, reference);
            } else {
              list.push(reference);
            }
          });
        },
        
        removeModelFromPhasePriority: (phase, index) => {
          set((state) => {
            state.phaseModelPriorities[phase].splice(index, 1);
          });
        },
        
        movePhasePriority: (phase, fromIndex, toIndex) => {
          set((state) => {
            const list = state.phaseModelPriorities[phase];
            const [moved] = list.splice(fromIndex, 1);
            list.splice(toIndex, 0, moved);
          });
        },
        
        addModelToFeaturePriority: (feature, reference, index) => {
          set((state) => {
            const list = state.featureModelPriorities[feature];
            if (index !== undefined && index >= 0 && index <= list.length) {
              list.splice(index, 0, reference);
            } else {
              list.push(reference);
            }
          });
        },
        
        removeModelFromFeaturePriority: (feature, index) => {
          set((state) => {
            state.featureModelPriorities[feature].splice(index, 1);
          });
        },
        
        moveFeaturePriority: (feature, fromIndex, toIndex) => {
          set((state) => {
            const list = state.featureModelPriorities[feature];
            const [moved] = list.splice(fromIndex, 1);
            list.splice(toIndex, 0, moved);
          });
        },
        
        // ============================================
        // Fallback Configuration
        // ============================================
        
        updateFallbackConfig: (config) => {
          set((state) => {
            state.fallbackConfig = { ...state.fallbackConfig, ...config };
          });
        },
        
        // ============================================
        // Routing Logic
        // ============================================
        
        getAvailableModel: (context) => {
          const state = get();
          const { fallbackConfig, providers, usageData } = state;
          
          // Get priority list based on context
          let priorityList: ModelReference[] = [];
          if (context.phase) {
            priorityList = state.phaseModelPriorities[context.phase] || [];
          } else if (context.feature) {
            priorityList = state.featureModelPriorities[context.feature] || [];
          }
          
          if (priorityList.length === 0) return null;
          
          // Find first available provider
          for (let i = 0; i < priorityList.length; i++) {
            const ref = priorityList[i];
            const provider = providers.find((p: LLMProviderSettings) => p.id === ref.providerId);
            
            if (!provider || !provider.enabled) continue;
            
            // Check capacity
            const usage = usageData[ref.providerId];
            if (fallbackConfig.skipRateLimited && usage?.isRateLimited) continue;
            
            if (usage?.hasLimits) {
              const minCap = fallbackConfig.minCapacityPercent;
              if (usage.sessionPercent !== undefined && usage.sessionPercent >= (100 - minCap)) continue;
              if (usage.dailyPercent !== undefined && usage.dailyPercent >= (100 - minCap)) continue;
              if (usage.monthlyPercent !== undefined && usage.monthlyPercent >= (100 - minCap)) continue;
            }
            
            return {
              providerId: ref.providerId,
              modelId: ref.modelId,
              modelDisplayName: ref.displayName || ref.modelId,
              fallbackUsed: i > 0,
              priorityIndex: i,
              selectionReason: i === 0 
                ? 'Primary model selected' 
                : `Fallback ${i} selected (primary unavailable)`,
            };
          }
          
          return null;
        },
        
        hasAvailableProvider: (priorityList) => {
          return get().getAvailableModel({ phase: undefined, feature: undefined }) !== null;
        },
        
        // ============================================
        // Reset
        // ============================================
        
        resetToDefaults: () => {
          set((state) => {
            state.phaseModelPriorities = DEFAULT_PHASE_MODEL_PRIORITIES;
            state.featureModelPriorities = DEFAULT_FEATURE_MODEL_PRIORITIES;
            state.fallbackConfig = DEFAULT_FALLBACK_CONFIG;
          });
        },
      }),
      {
        name: 'llm-provider-store',
        partialize: (state) => ({
          providers: state.providers,
          phaseModelPriorities: state.phaseModelPriorities,
          featureModelPriorities: state.featureModelPriorities,
          fallbackConfig: state.fallbackConfig,
        }),
      }
    )
  )
);

// ============================================
// Helper Hooks
// ============================================

/**
 * Get all enabled providers
 */
export function useEnabledProviders() {
  return useLLMProviderStore((state) => 
    state.providers.filter((p: LLMProviderSettings) => p.enabled)
  );
}

/**
 * Get providers by type
 */
export function useProvidersByType(type: LLMProviderType) {
  return useLLMProviderStore((state) => 
    state.providers.filter((p: LLMProviderSettings) => p.providerType === type)
  );
}

/**
 * Get provider by ID
 */
export function useProvider(providerId: string) {
  return useLLMProviderStore((state) => 
    state.providers.find((p: LLMProviderSettings) => p.id === providerId)
  );
}

/**
 * Get usage data for a provider
 */
export function useProviderUsage(providerId: string) {
  return useLLMProviderStore((state) => 
    state.usageData[providerId]
  );
}

/**
 * Get all usage data
 */
export function useAllProviderUsage() {
  return useLLMProviderStore((state) => 
    Object.values(state.usageData)
  );
}

/**
 * Get phase priorities
 */
export function usePhasePriorities(phase: PipelinePhase) {
  return useLLMProviderStore((state) => 
    state.phaseModelPriorities[phase]
  );
}

/**
 * Get feature priorities
 */
export function useFeaturePriorities(feature: FeatureType) {
  return useLLMProviderStore((state) => 
    state.featureModelPriorities[feature]
  );
}

// Re-export types
export type {
  LLMProviderSettings,
  ProviderUsageData,
  ModelReference,
  RoutingContext,
  RoutingResult,
};
