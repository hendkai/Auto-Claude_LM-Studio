# Multi-Provider LLM Architecture

## Überblick

Erweiterbares System für beliebige LLM-Provider mit Phase-basierter Model-Auswahl, Fallback-Chains und Usage-Tracking.

## Bestehende Struktur (bereits vorhanden)

```typescript
// PhaseModelConfigV3 - Bereits mit Fallback-Chains!
interface PhaseModelConfigV3 {
  spec: ProfileModelPair[];      // [0]=Primary, [1]=Fallback1, ...
  planning: ProfileModelPair[];
  coding: ProfileModelPair[];
  qa: ProfileModelPair[];
}

interface ProfileModelPair {
  profileId: string;  // Referenziert APIProfile
  model: string;      // Model Name
}
```

## Neue Architektur-Komponenten

### 1. LLMProvider Interface (Universal)

```typescript
// Jeder Provider implementiert dieses Interface
interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  
  // Authentifizierung
  authenticate(config: ProviderAuthConfig): Promise<AuthResult>;
  validateAuth(config: ProviderAuthConfig): Promise<boolean>;
  
  // Models
  listModels(config: ProviderAuthConfig): Promise<ModelInfo[]>;
  
  // Usage (falls verfügbar)
  getUsage?(config: ProviderAuthConfig): Promise<UsageData | null>;
  
  // Completion (unified interface)
  createCompletion(
    request: CompletionRequest,
    config: ProviderAuthConfig
  ): Promise<CompletionResponse>;
  
  // Streaming support
  createCompletionStream?(
    request: CompletionRequest,
    config: ProviderAuthConfig
  ): AsyncIterable<CompletionChunk>;
}
```

### 2. Provider Registry

```typescript
// Zentrale Registry für alle Provider
class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  
  register(provider: LLMProvider): void;
  get(id: string): LLMProvider | undefined;
  getAll(): LLMProvider[];
  getSupportedProviders(): SupportedProvider[];
}

// Provider-Implementierungen:
// - AnthropicProvider (Claude)
// - OpenAIProvider (GPT-4, Codex)
// - GoogleProvider (Gemini)
// - GroqProvider
// - AzureProvider
// - OllamaProvider (lokal)
// - OpenRouterProvider
// - KimiProvider (Moonshot)
```

### 3. Unified Auth Config

```typescript
// Einheitliche Auth-Struktur für alle Provider
interface ProviderAuthConfig {
  providerId: string;
  // Provider-spezifische Auth-Daten
  credentials: 
    | { type: 'apiKey'; apiKey: string }
    | { type: 'oauth'; token: string; refreshToken?: string }
    | { type: 'azure'; apiKey: string; endpoint: string; deployment: string }
    | { type: 'ollama'; baseUrl: string };
}

// In Settings gespeichert:
interface LLMProviderSettings {
  providerId: string;
  name: string;
  auth: ProviderAuthConfig;
  enabled: boolean;
  // Provider-spezifische Optionen
  options?: {
    defaultModel?: string;
    timeout?: number;
    maxRetries?: number;
  };
}
```

### 4. Usage Tracker

```typescript
// Pro-Provider Usage Tracking
interface ProviderUsageData {
  providerId: string;
  profileName: string;
  
  // Limits
  hasLimits: boolean;
  sessionPercent?: number;      // 0-100
  dailyPercent?: number;        // 0-100
  monthlyPercent?: number;      // 0-100
  
  // Tokens (falls verfügbar)
  inputTokensUsed?: number;
  outputTokensUsed?: number;
  totalTokensUsed?: number;
  
  // Costs (falls verfügbar)
  costIncurred?: number;
  costCurrency?: string;
  
  // Reset Zeiten
  sessionResetAt?: Date;
  dailyResetAt?: Date;
  monthlyResetAt?: Date;
  
  // Status
  isRateLimited: boolean;
  rateLimitResetAt?: Date;
  
  lastUpdated: Date;
}

// Usage Tracker Service
interface UsageTracker {
  // Für alle konfigurierten Provider Usage abrufen
  getAllUsage(): Promise<ProviderUsageData[]>;
  
  // Einzelnen Provider aktualisieren
  updateUsage(providerId: string): Promise<ProviderUsageData>;
  
  // Prüfen ob Provider noch Kapazität hat
  hasCapacity(providerId: string, minPercent?: number): boolean;
  
  // Nächsten verfügbaren Provider aus Prio-Liste finden
  findNextAvailable(
    priorityList: ProfileModelPair[],
    minCapacity?: number
  ): ProfileModelPair | null;
}
```

### 5. Model Router

```typescript
// Zentrale Routing-Logik
class ModelRouter {
  constructor(
    private providerRegistry: ProviderRegistry,
    private usageTracker: UsageTracker
  ) {}
  
  // Haupt-Routing-Methode
  async route(
    context: RoutingContext
  ): Promise<RoutingResult> {
    // 1. Prio-Liste basierend auf Context bestimmen
    const priorityList = this.getPriorityList(context);
    
    // 2. Ersten verfügbaren Provider finden
    const available = await this.findAvailableProvider(priorityList);
    
    // 3. Falls keiner verfügbar → Error oder Warteschlange
    if (!available) {
      throw new AllProvidersExhaustedError();
    }
    
    return available;
  }
  
  private getPriorityList(context: RoutingContext): ProfileModelPair[] {
    // Phase-basiert?
    if (context.phase) {
      return settings.customPhaseModelsV3?.[context.phase] || 
             defaultPhaseModels[context.phase];
    }
    
    // Feature-basiert?
    if (context.feature) {
      return settings.featureModelsV3?.[context.feature] ||
             defaultFeatureModels[context.feature];
    }
    
    // Default
    return defaultPriorityList;
  }
}

interface RoutingContext {
  phase?: 'spec' | 'planning' | 'coding' | 'qa';
  feature?: 'insights' | 'ideation' | 'roadmap' | 'githubIssues' | ...;
  taskType?: string;
  projectId?: string;
  // ... weitere Kontext-Daten
}
```

### 6. Configuration Schema

```typescript
// Erweiterte Settings
interface AppSettings {
  // ... bestehende Settings ...
  
  // === NEU: Multi-Provider Konfiguration ===
  
  // Alle konfigurierten Provider
  llmProviders: LLMProviderSettings[];
  
  // Phase-basierte Model-Prio-Listen (V3 bereits vorhanden!)
  customPhaseModelsV3?: PhaseModelConfigV3;
  
  // Feature-basierte Model-Prio-Listen (V3 bereits vorhanden!)
  featureModelsV3?: FeatureModelConfigV3;
  
  // Usage-Tracking Einstellungen
  usageTracking?: {
    enabled: boolean;
    autoRefreshInterval: number;  // ms
    lowUsageThreshold: number;    // 0-100, Warnung bei < X%
  };
  
  // Fallback-Verhalten
  fallbackConfig?: {
    enabled: boolean;
    retryFailedProviders: boolean;  // Nach X Minuten wieder versuchen
    retryDelayMinutes: number;
    maxRetriesPerProvider: number;
  };
}

// Default Konfigurationen
const defaultPhaseModels: PhaseModelConfigV3 = {
  spec: [
    { profileId: 'claude-pro', model: 'claude-sonnet-4-20250514' },
    { profileId: 'openai', model: 'gpt-4o' },
    { profileId: 'claude-free', model: 'claude-haiku-4-5-20251001' },
  ],
  planning: [
    { profileId: 'claude-pro', model: 'claude-opus-4-20250514' },
    { profileId: 'openai', model: 'gpt-4o' },
    { profileId: 'groq', model: 'llama-3.1-70b' },
  ],
  coding: [
    { profileId: 'claude-pro', model: 'claude-sonnet-4-20250514' },
    { profileId: 'openai', model: 'gpt-4o' },
    { profileId: 'groq', model: 'llama-3.1-70b' },
  ],
  qa: [
    { profileId: 'claude-pro', model: 'claude-haiku-4-5-20251001' },
    { profileId: 'groq', model: 'llama-3.1-8b' },
    { profileId: 'ollama-local', model: 'qwen2.5-coder:14b' },
  ],
};
```

## UI-Komponenten

### 1. Provider Management

```typescript
// Hauptkomponente für Provider-Verwaltung
<LLMProviderManager>
  // Liste aller Provider
  <ProviderList>
    <ProviderCard 
      provider={provider}
      usage={usageData}
      onEdit={() => openEditModal(provider)}
      onDelete={() => deleteProvider(provider.id)}
    />
  </ProviderList>
  
  // "Neuen Provider hinzufügen" Button
  <AddProviderButton onClick={() => openAddModal()} />
</LLMProviderManager>

// Provider-Konfiguration Modal
<ProviderConfigModal
  provider={selectedProvider}
  onSave={(config) => saveProvider(config)}
>
  // Provider-Typ Auswahl
  <ProviderTypeSelect />
  
  // Auth-Form (provider-spezifisch)
  <ProviderAuthForm />
  
  // Modelle testen/auswählen
  <ModelSelector />
</ProviderConfigModal>
```

### 2. Phase-Model Configuration

```typescript
// Phase-Model-Prio Konfiguration
<PhaseModelConfiguration>
  {['spec', 'planning', 'coding', 'qa'].map(phase => (
    <PhaseConfigCard key={phase} phase={phase}>
      <PhaseHeader 
        title={getPhaseDisplayName(phase)}
        icon={getPhaseIcon(phase)}
      />
      
      // Prio-Liste (Drag & Drop)
      <PriorityList
        items={config[phase]}
        onReorder={(newOrder) => updatePhaseConfig(phase, newOrder)}
        renderItem={(pair, index) => (
          <ModelPriorityItem
            rank={index + 1}
            provider={getProvider(pair.profileId)}
            model={pair.model}
            usage={getUsage(pair.profileId)}
            onRemove={() => removeFromPriority(phase, index)}
          />
        )}
      />
      
      // Model hinzufügen
      <AddModelButton 
        onClick={() => openModelSelector(phase)}
      />
    </PhaseConfigCard>
  ))}
</PhaseModelConfiguration>
```

### 3. Feature-Model Configuration

```typescript
// Ähnlich wie Phase-Config, aber für Features
<FeatureModelConfiguration>
  {['insights', 'ideation', 'roadmap', 'githubIssues', ...].map(feature => (
    <FeatureConfigCard key={feature} feature={feature}>
      // ... gleiche Struktur wie PhaseConfigCard
    </FeatureConfigCard>
  ))}
</FeatureModelConfiguration>
```

### 4. Usage Dashboard

```typescript
// Usage-Anzeige für alle Provider
<ProviderUsageDashboard>
  <UsageOverviewGrid>
    {providers.map(provider => (
      <ProviderUsageCard
        key={provider.id}
        provider={provider}
        usage={usageData[provider.id]}
        onRefresh={() => refreshUsage(provider.id)}
      />
    ))}
  </UsageOverviewGrid>
  
  // Detaillierte Usage-History
  <UsageHistoryChart providerId={selectedProvider} />
</ProviderUsageDashboard>
```

## Backend-Integration

### Python Provider Interface

```python
# backend/llm_providers/base.py
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional
from pydantic import BaseModel

class CompletionRequest(BaseModel):
    model: str
    messages: list[dict]
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    # ... weitere Parameter

class CompletionResponse(BaseModel):
    content: str
    usage: TokenUsage
    model: str
    finish_reason: str

class TokenUsage(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int

class LLMProvider(ABC):
    """Base class for all LLM providers."""
    
    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique provider identifier."""
        pass
    
    @abstractmethod
    async def authenticate(self, config: dict) -> AuthResult:
        """Validate authentication credentials."""
        pass
    
    @abstractmethod
    async def list_models(self, config: dict) -> list[ModelInfo]:
        """List available models."""
        pass
    
    @abstractmethod
    async def create_completion(
        self, 
        request: CompletionRequest,
        config: dict
    ) -> CompletionResponse:
        """Create a completion."""
        pass
    
    @abstractmethod
    async def get_usage(self, config: dict) -> Optional[UsageData]:
        """Get current usage data (if supported)."""
        pass

# Konkrete Implementierungen:
# - AnthropicProvider
# - OpenAIProvider
# - GoogleProvider
# - GroqProvider
# - AzureProvider
# - OllamaProvider
# - etc.
```

### Provider Factory

```python
# backend/llm_providers/factory.py
from typing import Type

class ProviderFactory:
    _providers: dict[str, Type[LLMProvider]] = {}
    
    @classmethod
    def register(cls, provider_id: str, provider_class: Type[LLMProvider]):
        cls._providers[provider_id] = provider_class
    
    @classmethod
    def create(cls, provider_id: str) -> LLMProvider:
        if provider_id not in cls._providers:
            raise ValueError(f"Unknown provider: {provider_id}")
        return cls._providers[provider_id]()
    
    @classmethod
    def get_available_providers(cls) -> list[str]:
        return list(cls._providers.keys())

# Registrierung der Provider
ProviderFactory.register("anthropic", AnthropicProvider)
ProviderFactory.register("openai", OpenAIProvider)
ProviderFactory.register("google", GoogleProvider)
ProviderFactory.register("groq", GroqProvider)
ProviderFactory.register("azure", AzureProvider)
ProviderFactory.register("ollama", OllamaProvider)
```

### Model Router Service

```python
# backend/llm_providers/router.py
class ModelRouterService:
    """Routes LLM requests based on phase/feature priority lists."""
    
    def __init__(
        self,
        provider_factory: ProviderFactory,
        usage_tracker: UsageTracker
    ):
        self.factory = provider_factory
        self.usage_tracker = usage_tracker
    
    async def route_completion(
        self,
        context: RoutingContext,
        request: CompletionRequest
    ) -> CompletionResult:
        """Route completion to best available provider."""
        
        # 1. Prio-Liste bestimmen
        priority_list = self._get_priority_list(context)
        
        # 2. Verfügbaren Provider finden
        for pair in priority_list:
            provider = self.factory.create(pair.profile_id)
            
            # Prüfen ob Provider Kapazität hat
            if await self._has_capacity(pair.profile_id):
                try:
                    # Attempt completion
                    config = self._get_provider_config(pair.profile_id)
                    response = await provider.create_completion(
                        request.with_model(pair.model),
                        config
                    )
                    
                    return CompletionResult(
                        response=response,
                        provider_id=pair.profile_id,
                        model=pair.model,
                        fallback_used=False
                    )
                    
                except RateLimitError:
                    # Markiere Provider als rate-limited
                    await self.usage_tracker.mark_rate_limited(pair.profile_id)
                    continue
                except Exception as e:
                    # Log error, try next provider
                    logger.error(f"Provider {pair.profile_id} failed: {e}")
                    continue
        
        # Alle Provider erschöpft
        raise AllProvidersExhaustedError(
            f"No provider available for {context}"
        )
```

## Datenbank-Schema (falls nötig)

```sql
-- Provider Konfigurationen
CREATE TABLE llm_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL,  -- 'anthropic', 'openai', etc.
    auth_config JSONB NOT NULL,   -- Verschlüsselte Auth-Daten
    options JSONB,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage-History
CREATE TABLE provider_usage_history (
    id SERIAL PRIMARY KEY,
    provider_id TEXT REFERENCES llm_providers(id),
    session_percent INTEGER,
    daily_percent INTEGER,
    monthly_percent INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost DECIMAL(10, 4),
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- Phase-Model-Prio Konfiguration (pro Projekt)
CREATE TABLE phase_model_config (
    project_id TEXT,
    phase TEXT,  -- 'spec', 'planning', 'coding', 'qa'
    priority_order INTEGER,
    provider_id TEXT,
    model TEXT,
    PRIMARY KEY (project_id, phase, priority_order)
);

-- Feature-Model-Prio Konfiguration (pro Projekt)
CREATE TABLE feature_model_config (
    project_id TEXT,
    feature TEXT,  -- 'insights', 'ideation', etc.
    priority_order INTEGER,
    provider_id TEXT,
    model TEXT,
    PRIMARY KEY (project_id, feature, priority_order)
);
```

## Implementierungs-Reihenfolge

1. **Phase 1: Core Types & Interfaces**
   - `LLMProvider` Interface
   - `ProviderAuthConfig` Types
   - `UsageData` Types

2. **Phase 2: Provider Registry**
   - `ProviderRegistry` Klasse
   - 3-4 Basis-Provider implementieren (Anthropic, OpenAI, Ollama)

3. **Phase 3: Usage Tracking**
   - `UsageTracker` Service
   - Usage-UI Komponenten

4. **Phase 4: Model Router**
   - `ModelRouter` Implementierung
   - Integration mit bestehendem Phase-System

5. **Phase 5: Configuration UI**
   - Provider Management UI
   - Phase-Model Configuration
   - Feature-Model Configuration

6. **Phase 6: Backend-Integration**
   - Python Provider Interface
   - Provider Factory
   - Router Service

7. **Phase 7: Migration & Testing**
   - Bestehende Config migrieren
   - Fallback-Logik testen
   - Performance-Optimierung

## Zusammenfassung

Diese Architektur bietet:

✅ **Erweiterbarkeit** - Neue Provider durch Interface-Implementierung
✅ **Phase-basierte Prio-Listen** - Jede Phase eigene Fallback-Kette
✅ **Feature-basierte Prio-Listen** - Features unabhängig konfigurierbar
✅ **Pro-Provider Usage** - Vollständige Transparenz
✅ **Auto-Fallback** - Automatischer Wechsel bei Token-Limit
✅ **Einheitliches Interface** - Gleiche API für alle Provider
✅ **Saubere Trennung** - Frontend/Backend klare Schnittstellen
