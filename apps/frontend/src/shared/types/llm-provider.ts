/**
 * LLM Provider Types
 * ==================
 * 
 * Erweiterbares Multi-Provider System für beliebige LLM-Backends.
 * Unterstützt Anthropic, OpenAI, Google, Groq, Azure, Ollama, etc.
 */

// ============================================
// Provider Identifiers
// ============================================

export type LLMProviderType = 
  | 'anthropic'      // Claude API
  | 'openai'         // OpenAI API (GPT-4, etc.)
  | 'google'         // Google Gemini API
  | 'groq'           // Groq API
  | 'azure'          // Azure OpenAI
  | 'ollama'         // Ollama (local)
  | 'openrouter'     // OpenRouter
  | 'kimi'           // Moonshot Kimi
  | 'mistral'        // Mistral AI
  | 'cohere'         // Cohere
  | 'ai21'           // AI21 Labs
  | 'custom';        // Custom OpenAI-compatible endpoint

// ============================================
// Authentication Types
// ============================================

export interface ApiKeyAuth {
  type: 'apiKey';
  apiKey: string;
}

export interface OAuthAuth {
  type: 'oauth';
  token: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface AzureAuth {
  type: 'azure';
  apiKey: string;
  endpoint: string;
  deployment?: string;
  apiVersion?: string;
}

export interface OllamaAuth {
  type: 'ollama';
  baseUrl: string;
}

export type ProviderAuthConfig = 
  | ApiKeyAuth 
  | OAuthAuth 
  | AzureAuth 
  | OllamaAuth;

// ============================================
// Provider Configuration
// ============================================

export interface LLMProviderSettings {
  /** Unique provider instance ID (user-defined) */
  id: string;
  /** Display name */
  name: string;
  /** Provider type */
  providerType: LLMProviderType;
  /** Authentication configuration */
  auth: ProviderAuthConfig;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Provider-specific options */
  options?: ProviderOptions;
  /** When the provider was created */
  createdAt: Date;
  /** When the provider was last updated */
  updatedAt: Date;
}

export interface ProviderOptions {
  /** Default model to use if none specified */
  defaultModel?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Max retries for failed requests */
  maxRetries?: number;
  /** Custom headers to send with requests */
  customHeaders?: Record<string, string>;
  /** Whether to verify SSL certificates */
  verifySsl?: boolean;
}

// ============================================
// Model Information
// ============================================

export interface ModelInfo {
  /** Model ID (as used in API calls) */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Provider that offers this model */
  providerId: string;
  /** Context window size in tokens */
  contextWindow?: number;
  /** Whether the model supports vision/images */
  supportsVision?: boolean;
  /** Whether the model supports function calling */
  supportsFunctions?: boolean;
  /** Whether the model supports JSON mode */
  supportsJsonMode?: boolean;
  /** Pricing per 1M tokens (if available) */
  pricing?: {
    input?: number;
    output?: number;
    currency?: string;
  };
  /** Capabilities categorization */
  capabilities?: ModelCapability[];
}

export type ModelCapability = 
  | 'chat'           // General chat
  | 'coding'         // Code generation
  | 'reasoning'      // Complex reasoning
  | 'vision'         // Image understanding
  | 'fast'           // Fast responses
  | 'cheap'          // Cost-effective
  | 'high-quality';  // Best quality

// ============================================
// Usage Tracking
// ============================================

export interface ProviderUsageData {
  /** Provider ID */
  providerId: string;
  /** Provider display name */
  providerName: string;
  /** Whether this provider has usage limits */
  hasLimits: boolean;
  
  // Percentage-based limits (0-100)
  /** Session usage percentage (Claude-specific) */
  sessionPercent?: number;
  /** Daily usage percentage */
  dailyPercent?: number;
  /** Monthly usage percentage */
  monthlyPercent?: number;
  
  // Token-based usage
  /** Input tokens used */
  inputTokensUsed?: number;
  /** Output tokens used */
  outputTokensUsed?: number;
  /** Total tokens used */
  totalTokensUsed?: number;
  
  // Cost tracking
  /** Cost incurred (if available) */
  costIncurred?: number;
  /** Cost currency */
  costCurrency?: string;
  
  // Rate limiting
  /** Whether provider is currently rate limited */
  isRateLimited: boolean;
  /** When rate limit resets */
  rateLimitResetAt?: Date;
  
  // Reset times
  /** When session limit resets */
  sessionResetAt?: Date;
  /** When daily limit resets */
  dailyResetAt?: Date;
  /** When monthly limit resets */
  monthlyResetAt?: Date;
  
  /** When this data was last updated */
  lastUpdated: Date;
}

export interface UsageHistoryEntry {
  id: string;
  providerId: string;
  timestamp: Date;
  sessionPercent?: number;
  dailyPercent?: number;
  monthlyPercent?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
}

// ============================================
// Model Routing & Priority
// ============================================

/**
 * Reference to a specific model on a specific provider.
 * Used in priority lists for phase and feature configuration.
 */
export interface ModelReference {
  /** Provider instance ID */
  providerId: string;
  /** Model ID */
  modelId: string;
  /** Optional display name override */
  displayName?: string;
}

/**
 * Phase-based model priority configuration.
 * Each phase has an ordered list of models to try.
 */
export interface PhaseModelPriorityConfig {
  /** Spec creation phase (discovery, requirements, context) */
  spec: ModelReference[];
  /** Planning phase (implementation planning) */
  planning: ModelReference[];
  /** Coding phase (actual implementation) */
  coding: ModelReference[];
  /** QA phase (review and fixing) */
  qa: ModelReference[];
}

/**
 * Feature-based model priority configuration.
 * Each feature has an ordered list of models to try.
 */
export interface FeatureModelPriorityConfig {
  /** Insights chat feature */
  insights: ModelReference[];
  /** Ideation generation */
  ideation: ModelReference[];
  /** Roadmap generation */
  roadmap: ModelReference[];
  /** GitHub issues automation */
  githubIssues: ModelReference[];
  /** GitHub PR review */
  githubPrs: ModelReference[];
  /** GitLab issues automation */
  gitlabIssues: ModelReference[];
  /** GitLab MR review */
  gitlabMRs: ModelReference[];
  /** Utility operations (commit messages, etc.) */
  utility: ModelReference[];
  /** Changelog generation */
  changelog: ModelReference[];
  /** Release notes generation */
  release: ModelReference[];
}

// ============================================
// Routing Context
// ============================================

export type PipelinePhase = 'spec' | 'planning' | 'coding' | 'qa';

export type FeatureType = 
  | 'insights' 
  | 'ideation' 
  | 'roadmap' 
  | 'githubIssues'
  | 'githubPrs'
  | 'gitlabIssues'
  | 'gitlabMRs'
  | 'utility'
  | 'changelog'
  | 'release';

export interface RoutingContext {
  /** Pipeline phase (if in spec pipeline) */
  phase?: PipelinePhase;
  /** Feature type (if using a feature) */
  feature?: FeatureType;
  /** Project ID for project-specific config */
  projectId?: string;
  /** Task type hint */
  taskType?: string;
  /** Whether this is a high-priority task */
  highPriority?: boolean;
  /** Preferred capabilities */
  requiredCapabilities?: ModelCapability[];
}

export interface RoutingResult {
  /** Selected provider */
  providerId: string;
  /** Selected model */
  modelId: string;
  /** Display name of the selected model */
  modelDisplayName: string;
  /** Whether a fallback was used */
  fallbackUsed: boolean;
  /** Index in priority list (0 = primary) */
  priorityIndex: number;
  /** Reason for selection */
  selectionReason: string;
}

// ============================================
// Fallback Configuration
// ============================================

export interface FallbackConfiguration {
  /** Whether fallback is enabled */
  enabled: boolean;
  /** Retry failed providers after N minutes */
  retryFailedProviders: boolean;
  /** Minutes to wait before retrying a failed provider */
  retryDelayMinutes: number;
  /** Max retries per provider before marking as exhausted */
  maxRetriesPerProvider: number;
  /** Minimum capacity percentage required (0-100) */
  minCapacityPercent: number;
  /** Whether to skip rate-limited providers */
  skipRateLimited: boolean;
}

// ============================================
// Provider Metadata
// ============================================

export interface ProviderMetadata {
  /** Provider type identifier */
  id: LLMProviderType;
  /** Display name */
  name: string;
  /** Provider description */
  description: string;
  /** Icon identifier (Lucide icon name) */
  icon: string;
  /** Whether this provider supports usage tracking */
  supportsUsageTracking: boolean;
  /** Whether this provider supports streaming */
  supportsStreaming: boolean;
  /** Whether this provider is local/self-hosted */
  isLocal: boolean;
  /** Default auth type for this provider */
  defaultAuthType: ProviderAuthConfig['type'];
  /** Required auth fields */
  requiredAuthFields: string[];
  /** URL to provider documentation */
  docsUrl?: string;
  /** URL to get API keys */
  signupUrl?: string;
}

// Provider metadata registry
export const PROVIDER_METADATA: Record<LLMProviderType, ProviderMetadata> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude AI models by Anthropic',
    icon: 'MessageSquare',
    supportsUsageTracking: true,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://docs.anthropic.com',
    signupUrl: 'https://console.anthropic.com',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models by OpenAI',
    icon: 'Brain',
    supportsUsageTracking: true,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://platform.openai.com/docs',
    signupUrl: 'https://platform.openai.com',
  },
  google: {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini models by Google',
    icon: 'Sparkles',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://ai.google.dev',
    signupUrl: 'https://makersuite.google.com',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference by Groq',
    icon: 'Zap',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://console.groq.com/docs',
    signupUrl: 'https://console.groq.com',
  },
  azure: {
    id: 'azure',
    name: 'Azure OpenAI',
    description: 'OpenAI models on Azure',
    icon: 'Cloud',
    supportsUsageTracking: true,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'azure',
    requiredAuthFields: ['apiKey', 'endpoint'],
    docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai',
    signupUrl: 'https://azure.microsoft.com',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local LLM hosting',
    icon: 'Laptop',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: true,
    defaultAuthType: 'ollama',
    requiredAuthFields: ['baseUrl'],
    docsUrl: 'https://github.com/ollama/ollama',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified API for many models',
    icon: 'Globe',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://openrouter.ai/docs',
    signupUrl: 'https://openrouter.ai',
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    description: 'Kimi models by Moonshot AI',
    icon: 'Moon',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://platform.moonshot.cn',
    signupUrl: 'https://platform.moonshot.cn',
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral and Mixtral models',
    icon: 'Wind',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://docs.mistral.ai',
    signupUrl: 'https://console.mistral.ai',
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    description: 'Cohere Command models',
    icon: 'Layers',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://docs.cohere.com',
    signupUrl: 'https://cohere.com',
  },
  ai21: {
    id: 'ai21',
    name: 'AI21 Labs',
    description: 'Jamba and Jurassic models',
    icon: 'Library',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey'],
    docsUrl: 'https://docs.ai21.com',
    signupUrl: 'https://studio.ai21.com',
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    description: 'OpenAI-compatible custom API',
    icon: 'Settings',
    supportsUsageTracking: false,
    supportsStreaming: true,
    isLocal: false,
    defaultAuthType: 'apiKey',
    requiredAuthFields: ['apiKey', 'baseUrl'],
    docsUrl: 'https://platform.openai.com/docs',
  },
};

// ============================================
// Default Configurations
// ============================================

export const DEFAULT_PHASE_MODEL_PRIORITIES: PhaseModelPriorityConfig = {
  spec: [
    { providerId: 'anthropic-default', modelId: 'claude-sonnet-4-20250514' },
    { providerId: 'openai-default', modelId: 'gpt-4o' },
  ],
  planning: [
    { providerId: 'anthropic-default', modelId: 'claude-opus-4-20250514' },
    { providerId: 'openai-default', modelId: 'gpt-4o' },
  ],
  coding: [
    { providerId: 'anthropic-default', modelId: 'claude-sonnet-4-20250514' },
    { providerId: 'openai-default', modelId: 'gpt-4o' },
  ],
  qa: [
    { providerId: 'anthropic-default', modelId: 'claude-haiku-4-5-20251001' },
    { providerId: 'openai-default', modelId: 'gpt-4o-mini' },
  ],
};

export const DEFAULT_FEATURE_MODEL_PRIORITIES: FeatureModelPriorityConfig = {
  insights: [
    { providerId: 'anthropic-default', modelId: 'claude-sonnet-4-20250514' },
  ],
  ideation: [
    { providerId: 'anthropic-default', modelId: 'claude-sonnet-4-20250514' },
  ],
  roadmap: [
    { providerId: 'anthropic-default', modelId: 'claude-opus-4-20250514' },
  ],
  githubIssues: [
    { providerId: 'anthropic-default', modelId: 'claude-haiku-4-5-20251001' },
  ],
  githubPrs: [
    { providerId: 'anthropic-default', modelId: 'claude-sonnet-4-20250514' },
  ],
  gitlabIssues: [
    { providerId: 'anthropic-default', modelId: 'claude-haiku-4-5-20251001' },
  ],
  gitlabMRs: [
    { providerId: 'anthropic-default', modelId: 'claude-sonnet-4-20250514' },
  ],
  utility: [
    { providerId: 'anthropic-default', modelId: 'claude-haiku-4-5-20251001' },
  ],
  changelog: [
    { providerId: 'anthropic-default', modelId: 'claude-sonnet-4-20250514' },
  ],
  release: [
    { providerId: 'anthropic-default', modelId: 'claude-sonnet-4-20250514' },
  ],
};

export const DEFAULT_FALLBACK_CONFIG: FallbackConfiguration = {
  enabled: true,
  retryFailedProviders: true,
  retryDelayMinutes: 5,
  maxRetriesPerProvider: 3,
  minCapacityPercent: 10,
  skipRateLimited: true,
};
