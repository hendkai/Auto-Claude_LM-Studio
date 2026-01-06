export type ApiProviderPreset = {
  id: string;
  baseUrl: string;
  labelKey: string;
  description?: string;  // Human-readable description
  apiKeyPlaceholder?: string;  // Placeholder for API key input
  docsUrl?: string;  // Link to provider documentation
  category?: 'cloud' | 'local' | 'proxy';  // Provider category
};

export const API_PROVIDER_PRESETS: readonly ApiProviderPreset[] = [
  // Cloud Providers
  {
    id: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    labelKey: 'settings:apiProfiles.presets.anthropic',
    description: 'Official Anthropic API - Claude Sonnet, Opus, Haiku',
    apiKeyPlaceholder: 'sk-ant-api03-...',
    docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
    category: 'cloud'
  },
  {
    id: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    labelKey: 'settings:apiProfiles.presets.openai',
    description: 'Official OpenAI API - GPT-4, GPT-3.5',
    apiKeyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    category: 'cloud'
  },
  {
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    labelKey: 'settings:apiProfiles.presets.openrouter',
    description: 'Access 100+ models via one API',
    apiKeyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/docs',
    category: 'cloud'
  },
  {
    id: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    labelKey: 'settings:apiProfiles.presets.groq',
    description: 'Ultra-fast inference (Llama, Mixtral)',
    apiKeyPlaceholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/docs/quickstart',
    category: 'cloud'
  },
  {
    id: 'glm-global',
    baseUrl: 'https://api.z.ai/api/anthropic',
    labelKey: 'settings:apiProfiles.presets.glmGlobal',
    description: 'Zhipu AI GLM Models (Global)',
    apiKeyPlaceholder: 'your-glm-api-key',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
    category: 'cloud'
  },
  {
    id: 'glm-cn',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    labelKey: 'settings:apiProfiles.presets.glmChina',
    description: 'Zhipu AI GLM Models (China)',
    apiKeyPlaceholder: 'your-glm-api-key',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
    category: 'cloud'
  },
  {
    id: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    labelKey: 'settings:apiProfiles.presets.deepseek',
    description: 'DeepSeek API - Powerful reasoning models',
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api-docs/',
    category: 'cloud'
  },
  {
    id: 'perplexity',
    baseUrl: 'https://api.perplexity.ai',
    labelKey: 'settings:apiProfiles.presets.perplexity',
    description: 'Perplexity AI with web search',
    apiKeyPlaceholder: 'pplx-...',
    docsUrl: 'https://docs.perplexity.ai/',
    category: 'cloud'
  },
  {
    id: 'together',
    baseUrl: 'https://api.together.xyz/v1',
    labelKey: 'settings:apiProfiles.presets.together',
    description: 'Open-source models at scale',
    apiKeyPlaceholder: 'your-together-api-key',
    docsUrl: 'https://docs.together.ai/docs/quickstart',
    category: 'cloud'
  },

  // Local Providers
  {
    id: 'lm-studio',
    baseUrl: 'http://localhost:1234/v1',
    labelKey: 'settings:apiProfiles.presets.lmStudio',
    description: 'Local LLM via LM Studio',
    apiKeyPlaceholder: 'lm-studio',
    docsUrl: 'https://lmstudio.ai/',
    category: 'local'
  },
  {
    id: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    labelKey: 'settings:apiProfiles.presets.ollama',
    description: 'Local LLM via Ollama',
    apiKeyPlaceholder: 'ollama',
    docsUrl: 'https://ollama.ai/',
    category: 'local'
  },

  // Proxy
  {
    id: 'litellm',
    baseUrl: 'http://localhost:4000',
    labelKey: 'settings:apiProfiles.presets.litellm',
    description: 'Unified proxy for multiple providers',
    apiKeyPlaceholder: 'your-proxy-key',
    docsUrl: 'https://docs.litellm.ai/',
    category: 'proxy'
  }
];
