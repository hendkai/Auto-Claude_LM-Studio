/**
 * Provider Templates for API Profiles
 * 
 * Pre-configured templates for popular LLM providers.
 * Users can select a provider and only need to enter their API key.
 */

export interface ProviderTemplate {
    id: string;
    name: string;
    displayName: string;
    description: string;
    baseUrl: string;
    apiKeyPlaceholder: string;
    docsUrl?: string;
    requiresApiKey: boolean;
    category: 'cloud' | 'local' | 'proxy';
}

/**
 * Known LLM Provider Templates
 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
    // Cloud Providers
    {
        id: 'anthropic',
        name: 'claude',
        displayName: 'Claude (Anthropic)',
        description: 'Official Anthropic API - Claude Sonnet, Opus, Haiku',
        baseUrl: 'https://api.anthropic.com',
        apiKeyPlaceholder: 'sk-ant-api03-...',
        docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
        requiresApiKey: true,
        category: 'cloud'
    },
    {
        id: 'openai',
        name: 'openai',
        displayName: 'OpenAI (GPT)',
        description: 'Official OpenAI API - GPT-4, GPT-3.5',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyPlaceholder: 'sk-proj-...',
        docsUrl: 'https://platform.openai.com/docs/api-reference',
        requiresApiKey: true,
        category: 'cloud'
    },
    {
        id: 'glm',
        name: 'glm',
        displayName: 'GLM (z.ai)',
        description: 'Zhipu AI GLM Models - GLM-4-Plus, GLM-4-Flash',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKeyPlaceholder: 'your-glm-api-key',
        docsUrl: 'https://open.bigmodel.cn/dev/api',
        requiresApiKey: true,
        category: 'cloud'
    },
    {
        id: 'groq',
        name: 'groq',
        displayName: 'Groq',
        description: 'Groq API - Ultra-fast inference (Llama, Mixtral)',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyPlaceholder: 'gsk_...',
        docsUrl: 'https://console.groq.com/docs/quickstart',
        requiresApiKey: true,
        category: 'cloud'
    },
    {
        id: 'openrouter',
        name: 'openrouter',
        displayName: 'OpenRouter',
        description: 'Access 100+ models via one API',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKeyPlaceholder: 'sk-or-v1-...',
        docsUrl: 'https://openrouter.ai/docs',
        requiresApiKey: true,
        category: 'cloud'
    },
    {
        id: 'perplexity',
        name: 'perplexity',
        displayName: 'Perplexity',
        description: 'Perplexity AI models with web search',
        baseUrl: 'https://api.perplexity.ai',
        apiKeyPlaceholder: 'pplx-...',
        docsUrl: 'https://docs.perplexity.ai/',
        requiresApiKey: true,
        category: 'cloud'
    },
    {
        id: 'together',
        name: 'together',
        displayName: 'Together AI',
        description: 'Open-source models at scale',
        baseUrl: 'https://api.together.xyz/v1',
        apiKeyPlaceholder: 'your-together-api-key',
        docsUrl: 'https://docs.together.ai/docs/quickstart',
        requiresApiKey: true,
        category: 'cloud'
    },
    {
        id: 'deepseek',
        name: 'deepseek',
        displayName: 'DeepSeek',
        description: 'DeepSeek API - Powerful reasoning models',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKeyPlaceholder: 'sk-...',
        docsUrl: 'https://platform.deepseek.com/api-docs/',
        requiresApiKey: true,
        category: 'cloud'
    },

    // Local Providers (via Proxy)
    {
        id: 'lm-studio',
        name: 'lm-studio',
        displayName: 'LM Studio (Local)',
        description: 'Local LLM via LM Studio',
        baseUrl: 'http://localhost:1234/v1',
        apiKeyPlaceholder: 'lm-studio',
        docsUrl: 'https://lmstudio.ai/',
        requiresApiKey: false,
        category: 'local'
    },
    {
        id: 'ollama',
        name: 'ollama',
        displayName: 'Ollama (Local)',
        description: 'Local LLM via Ollama',
        baseUrl: 'http://localhost:11434/v1',
        apiKeyPlaceholder: 'ollama',
        docsUrl: 'https://ollama.ai/',
        requiresApiKey: false,
        category: 'local'
    },
    {
        id: 'litellm-proxy',
        name: 'litellm',
        displayName: 'LiteLLM Proxy',
        description: 'Unified proxy for multiple providers',
        baseUrl: 'http://localhost:4000',
        apiKeyPlaceholder: 'your-proxy-key',
        docsUrl: 'https://docs.litellm.ai/',
        requiresApiKey: false,
        category: 'proxy'
    },

    // Custom
    {
        id: 'custom',
        name: 'custom',
        displayName: 'Custom API',
        description: 'Enter custom Base URL and API key',
        baseUrl: '',
        apiKeyPlaceholder: 'your-api-key',
        requiresApiKey: true,
        category: 'cloud'
    }
];

/**
 * Get provider template by ID
 */
export function getProviderTemplate(id: string): ProviderTemplate | undefined {
    return PROVIDER_TEMPLATES.find(p => p.id === id);
}

/**
 * Get providers by category
 */
export function getProvidersByCategory(category: ProviderTemplate['category']): ProviderTemplate[] {
    return PROVIDER_TEMPLATES.filter(p => p.category === category);
}

/**
 * Detect provider from base URL
 */
export function detectProviderFromUrl(baseUrl: string): ProviderTemplate | undefined {
    const normalizedUrl = baseUrl.toLowerCase();

    return PROVIDER_TEMPLATES.find(template => {
        const templateUrl = template.baseUrl.toLowerCase();
        return normalizedUrl.includes(templateUrl) || templateUrl.includes(normalizedUrl);
    });
}
