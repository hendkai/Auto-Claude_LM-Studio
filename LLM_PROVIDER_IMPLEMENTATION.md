# LLM Multi-Provider Implementation

## ✅ Implementierte Komponenten

### 1. Core Types (`/apps/frontend/src/shared/types/llm-provider.ts`)

**Unterstützte Provider:**
- `anthropic` - Claude API
- `openai` - OpenAI (GPT-4, etc.)
- `google` - Gemini
- `groq` - Groq Inference
- `azure` - Azure OpenAI
- `ollama` - Lokale Models
- `openrouter` - Unified API
- `kimi` - Moonshot Kimi
- `mistral` - Mistral AI
- `cohere` - Cohere
- `ai21` - AI21 Labs
- `custom` - OpenAI-kompatible Endpoints

**Key Interfaces:**
```typescript
// Provider Konfiguration
interface LLMProviderSettings {
  id: string;                    // Eindeutige ID (user-definiert)
  name: string;                  // Anzeigename
  providerType: LLMProviderType; // z.B. 'anthropic', 'openai'
  auth: ProviderAuthConfig;      // API Key, OAuth, etc.
  enabled: boolean;
  options?: ProviderOptions;     // Timeout, Retries, etc.
}

// Usage Tracking pro Provider
interface ProviderUsageData {
  providerId: string;
  hasLimits: boolean;
  sessionPercent?: number;       // 0-100
  dailyPercent?: number;
  monthlyPercent?: number;
  isRateLimited: boolean;
  inputTokensUsed?: number;
  outputTokensUsed?: number;
  costIncurred?: number;
  lastUpdated: Date;
}

// Phase-basierte Prio-Liste
interface PhaseModelPriorityConfig {
  spec: ModelReference[];        // [0]=Primary, [1]=Fallback1, ...
  planning: ModelReference[];
  coding: ModelReference[];
  qa: ModelReference[];
}

// Feature-basierte Prio-Liste
interface FeatureModelPriorityConfig {
  insights: ModelReference[];
  ideation: ModelReference[];
  roadmap: ModelReference[];
  githubIssues: ModelReference[];
  githubPrs: ModelReference[];
  gitlabIssues: ModelReference[];
  gitlabMRs: ModelReference[];
  utility: ModelReference[];
  changelog: ModelReference[];
  release: ModelReference[];
}
```

### 2. Zustand-Management (`/apps/frontend/src/renderer/stores/llm-provider-store.ts`)

**Store Actions:**
```typescript
// Provider Management
addProvider(provider)
updateProvider(providerId, updates)
removeProvider(providerId)
toggleProvider(providerId)

// Usage Tracking
updateUsageData(providerId, usage)
refreshAllUsage()

// Prio-Listen Konfiguration
setPhasePriorities(phase, priorities)
addModelToPhasePriority(phase, reference, index)
removeModelFromPhasePriority(phase, index)
movePhasePriority(phase, fromIndex, toIndex)

// Routing
getAvailableModel(context) → RoutingResult | null
```

**Usage im React:**
```typescript
// Alle Provider abrufen
const providers = useLLMProviderStore(state => state.providers);

// Aktivierte Provider
const enabledProviders = useEnabledProviders();

// Usage Daten
const usage = useProviderUsage(providerId);

// Phase-Prioritäten
const specPriorities = usePhasePriorities('spec');

// Routing
const router = useLLMProviderStore();
const result = router.getAvailableModel({ phase: 'coding' });
// → { providerId, modelId, fallbackUsed, priorityIndex }
```

### 3. UI Komponenten

**ProviderCard** (`/apps/frontend/src/renderer/components/settings/LLMProviderCard.tsx`)
- Zeigt Provider-Info, Status, Usage-Balken
- Enable/Disable Toggle
- Edit/Delete Actions
- Refresh Usage Button

## 🔄 Fallback-Logik

Die Fallback-Logik ist im Store implementiert:

```typescript
getAvailableModel(context) {
  // 1. Prio-Liste basierend auf Context (phase/feature)
  const priorityList = context.phase 
    ? phaseModelPriorities[context.phase]
    : featureModelPriorities[context.feature];
  
  // 2. Ersten verfügbaren Provider finden
  for (let i = 0; i < priorityList.length; i++) {
    const ref = priorityList[i];
    const provider = providers.find(p => p.id === ref.providerId);
    
    // Checks:
    // - Provider enabled?
    // - Nicht rate-limited?
    // - Genug Kapazität (z.B. <90% usage)?
    
    if (available) {
      return {
        providerId: ref.providerId,
        modelId: ref.modelId,
        fallbackUsed: i > 0,  // True wenn nicht Primary
        priorityIndex: i,
      };
    }
  }
  
  // 3. Alle Provider erschöpft
  return null;
}
```

## 📊 Usage Tracking

**Pro-Provider Usage-Überwachung:**

1. **Automatische Updates:**
   - Bei jedem API Call → Usage aktualisieren
   - Periodischer Refresh (z.B. alle 30 Sekunden)
   - On-demand Refresh durch User

2. **Visualisierung:**
   - Progress Bars für Session/Daily/Monthly Usage
   - Farb-Codierung: Grün → Gelb → Rot
   - Token-Zähler & Kosten (falls verfügbar)
   - Rate-Limit Warnings

3. **Konfigurierbare Thresholds:**
   ```typescript
   fallbackConfig: {
     minCapacityPercent: 10,  // Warnung bei <10% verbleibend
     skipRateLimited: true,   // Rate-limited Provider überspringen
   }
   ```

## ⚙️ Integration mit bestehendem System

### Settings Integration

Die neuen Settings müssen in `AppSettings` ergänzt werden:

```typescript
// In types/settings.ts
interface AppSettings {
  // ... bestehende Settings ...
  
  // NEU: Multi-Provider Konfiguration
  llmProviders: LLMProviderSettings[];
  
  // Phase & Feature Prioritäten (V3 bereits vorhanden!)
  customPhaseModelsV3?: PhaseModelConfigV3;
  featureModelsV3?: FeatureModelConfigV3;
  
  // Fallback Konfiguration
  fallbackConfig?: FallbackConfiguration;
}
```

### Phase-Integration

In der Spec-Pipeline die bestehende `PhaseModelConfigV3` verwenden:

```typescript
// Bestehend (bereits vorhanden!)
interface PhaseModelConfigV3 {
  spec: ProfileModelPair[];
  planning: ProfileModelPair[];
  coding: ProfileModelPair[];
  qa: ProfileModelPair[];
}

// Migration zu neuem System:
// ProfileModelPair → ModelReference
// profileId verweist auf LLMProviderSettings.id
```

### Backend-Integration

Die Python-Backend muss erweitert werden:

```python
# backend/llm_providers/router.py
class LLMProviderRouter:
    def route_completion(self, context: RoutingContext) -> RoutingResult:
        # 1. Hole Prio-Liste aus Frontend-Settings
        priority_list = self.get_priority_list(context)
        
        # 2. Probiere jeden Provider
        for ref in priority_list:
            provider = self.get_provider(ref.provider_id)
            
            if provider.has_capacity():
                try:
                    response = provider.complete(
                        model=ref.model_id,
                        messages=messages
                    )
                    return RoutingResult(
                        response=response,
                        provider_id=ref.provider_id,
                        model=ref.model_id,
                        fallback_used=ref != priority_list[0]
                    )
                except RateLimitError:
                    provider.mark_rate_limited()
                    continue
        
        raise AllProvidersExhaustedError()
```

## 🚀 Nächste Schritte

### 1. UI Komplettieren

Noch zu implementieren:
- `ProviderList` - Liste aller Provider mit "Add" Button
- `ProviderConfigModal` - Provider hinzufügen/bearbeiten
  - Provider-Type Select
  - Auth-Form (API Key, OAuth, Azure, etc.)
  - Model Discovery/Test
- `PhaseModelConfiguration` - Drag & Drop Prio-Listen pro Phase
- `FeatureModelConfiguration` - Prio-Listen pro Feature
- `ProviderUsageDashboard` - Übersicht aller Provider Usage

### 2. Backend-Provider implementieren

Python-Provider für:
- Anthropic (Claude)
- OpenAI
- Google (Gemini)
- Groq
- Azure
- Ollama
- etc.

### 3. IPC Channels erweitern

```typescript
// Neue IPC Channels:
LLM_PROVIDER_LIST: 'llmProvider:list'
LLM_PROVIDER_ADD: 'llmProvider:add'
LLM_PROVIDER_UPDATE: 'llmProvider:update'
LLM_PROVIDER_DELETE: 'llmProvider:delete'
LLM_PROVIDER_TEST: 'llmProvider:test'
LLM_PROVIDER_GET_MODELS: 'llmProvider:getModels'
LLM_PROVIDER_GET_USAGE: 'llmProvider:getUsage'

LLM_ROUTE_COMPLETION: 'llm:routeCompletion'
```

### 4. Migration

Bestehende `APIProfile` → `LLMProviderSettings`:

```typescript
function migrateAPIProfiles(profiles: APIProfile[]): LLMProviderSettings[] {
  return profiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    providerType: 'anthropic', // oder aus URL ableiten
    auth: { type: 'apiKey', apiKey: profile.apiKey },
    enabled: true,
    options: {
      defaultModel: profile.models?.default,
    },
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
  }));
}
```

## 📝 Beispiel: Provider hinzufügen

```typescript
import { useLLMProviderStore } from '../stores/llm-provider-store';

function AddProviderExample() {
  const addProvider = useLLMProviderStore(state => state.addProvider);
  
  const handleAddOpenAI = () => {
    addProvider({
      id: 'openai-main',
      name: 'OpenAI Production',
      providerType: 'openai',
      auth: {
        type: 'apiKey',
        apiKey: 'sk-...', // Aus sicherer Quelle
      },
      enabled: true,
      options: {
        defaultModel: 'gpt-4o',
        timeout: 30000,
        maxRetries: 3,
      },
    });
  };
  
  return <button onClick={handleAddOpenAI}>Add OpenAI</button>;
}
```

## 📝 Beispiel: Phase-Priorität konfigurieren

```typescript
function ConfigurePhasePrioritiesExample() {
  const { 
    phaseModelPriorities,
    addModelToPhasePriority,
    movePhasePriority 
  } = useLLMProviderStore();
  
  // Füge GPT-4 als Fallback für Coding hinzu
  const addFallback = () => {
    addModelToPhasePriority('coding', {
      providerId: 'openai-main',
      modelId: 'gpt-4o',
      displayName: 'GPT-4o (Fallback)',
    });
  };
  
  return (
    <div>
      <h3>Coding Phase Models</h3>
      {phaseModelPriorities.coding.map((ref, index) => (
        <div key={index}>
          {index + 1}. {ref.displayName || ref.modelId}
          {index === 0 && <span> (Primary)</span>}
        </div>
      ))}
      <button onClick={addFallback}>Add Fallback</button>
    </div>
  );
}
```

## 📝 Beispiel: Routing mit Fallback

```typescript
async function generateSpec(task: string) {
  const router = useLLMProviderStore.getState();
  
  // Finde verfügbares Model für Spec-Phase
  const routing = router.getAvailableModel({ phase: 'spec' });
  
  if (!routing) {
    throw new Error('No LLM provider available - all exhausted!');
  }
  
  if (routing.fallbackUsed) {
    console.warn(`Using fallback ${routing.priorityIndex}: ${routing.modelDisplayName}`);
  }
  
  // Sende Request an Backend mit Routing-Info
  const response = await window.electronAPI.createCompletion({
    providerId: routing.providerId,
    modelId: routing.modelId,
    messages: [{ role: 'user', content: task }],
  });
  
  return response;
}
```

## 🎨 UI Mockup

```
┌─────────────────────────────────────────────────────────────┐
│ LLM Provider Management                           [+ Add]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Claude Pro ───────────────────────────────────────────┐ │
│ │  🤖 Claude (Anthropic)                    [🔄][⚙️][🗑️] │ │
│ │  Session: ████████████░░░░ 78% (resets in 2h)          │ │
│ │  Daily:   ██████░░░░░░░░░░ 45%                        │ │
│ │  1,234,567 tokens • $12.34                  [Refresh] │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ OpenAI Production ────────────────────────────────────┐ │
│ │  🧠 OpenAI                                [🔄][⚙️][🗑️] │ │
│ │  Rate limited (resets at 14:30)           [Refresh]   │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Local Ollama (DISABLED) ──────────────────────────────┐ │
│ │  💻 Ollama                                [▶️][⚙️][🗑️] │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Phase Model Priorities                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Spec Phase                                          [Edit] │
│ 1. Claude Sonnet (Claude Pro)                              │
│ 2. GPT-4o (OpenAI Production)                              │
│ 3. Gemini Pro (Google)                                     │
│                                                             │
│ Coding Phase                                        [Edit] │
│ 1. Claude Opus (Claude Pro)                                │
│ 2. GPT-4o (OpenAI Production)                              │
│ 3. Qwen 2.5 (Local Ollama)                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## ✅ Zusammenfassung

- ✅ Core Types für 12+ Provider
- ✅ Provider Store mit Zustand-Management
- ✅ Phase & Feature Prio-Listen
- ✅ Usage Tracking pro Provider
- ✅ Fallback-Logik implementiert
- ✅ ProviderCard UI Komponente
- 🔄 ProviderList & Config Modal (pending)
- 🔄 Phase/Feature Configuration UI (pending)
- 🔄 Backend Provider Implementierung (pending)
- 🔄 IPC Integration (pending)

Das System ist erweiterbar, sauber strukturiert und integriert sich nahtlos mit der bestehenden `PhaseModelConfigV3`.
