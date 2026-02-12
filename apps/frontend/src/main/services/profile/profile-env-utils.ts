import { readSettingsFile } from '../../settings-utils';
import { getClaudeProfileManager } from '../../claude-profile-manager';
import { loadProfilesFile } from './profile-manager';
import { normalizeBaseUrlForSdk } from './profile-service';
import type { PhaseModelConfigV3, ProfileModelPair } from '../../../shared/types/settings';
import type { APIProfile } from '../../../shared/types/profile';

type PhaseKey = 'spec' | 'planning' | 'coding' | 'qa';
const PHASE_KEYS: PhaseKey[] = ['spec', 'planning', 'coding', 'qa'];
const PHASE_PROVIDER_AUTH_KEYS = [
    'CLAUDE_CONFIG_DIR',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY'
] as const;
const CLI_KIMI_PROVIDER_HINTS = ['moonshot.ai', 'moonshot.cn'];
const CLI_CODEX_PROVIDER_HINTS = ['api.openai.com', 'openrouter.ai', 'opencode.ai'];
const CLI_OPENCODE_PROVIDER_HINTS = ['opencode.ai'];

export interface PhaseProviderEnvEntry {
    profileId: string;
    model: string;
    env: Record<string, string>;
}

export type PhaseProviderEnvConfig = Record<PhaseKey, PhaseProviderEnvEntry[]>;

export function hasProviderAuthEnv(env: Record<string, string> | undefined): boolean {
    if (!env) {
        return false;
    }

    return PHASE_PROVIDER_AUTH_KEYS.some((key) => {
        const value = env[key];
        return typeof value === 'string' && value.trim().length > 0;
    });
}

export function hasProviderAuthInConfig(config: PhaseProviderEnvConfig | null | undefined): boolean {
    if (!config) {
        return false;
    }

    return PHASE_KEYS.some((phase) => config[phase].some((entry) => hasProviderAuthEnv(entry.env)));
}
export async function getProfileEnvForPair(
    pair: ProfileModelPair
): Promise<Record<string, string>> {
    const { profileId, model } = pair;

    // Check prefix to determine profile type
    if (profileId.startsWith('oauth:')) {
        // OAuth Claude Account
        const claudeProfileId = profileId.replace('oauth:', '');
        return getOAuthProfileEnv(claudeProfileId, model);
    } else if (profileId.startsWith('api:')) {
        // API Profile
        const apiProfileId = profileId.replace('api:', '');
        return getAPIProfileEnvById(apiProfileId, model);
    } else if (profileId.startsWith('local:lm-studio')) {
        // Local LM Studio
        return getLocalLMStudioEnv(model);
    } else if (profileId.startsWith('cli:')) {
        // Local CLI tools (Claude Code, Kimi Code, Codex, OpenCode)
        const cliToolId = profileId.replace('cli:', '');
        return getCLIProfileEnv(cliToolId, model);
    } else {
        // Fallback: Assume it's an API profile ID without prefix (backward compat)
        return getAPIProfileEnvById(profileId, model);
    }
}

/**
 * Get environment variables for OAuth Claude account
 * 
 * @param claudeProfileId - Claude profile ID (without 'oauth:' prefix)
 * @param model - Model name to use
 * @returns Environment variables for OAuth mode
 */
async function getOAuthProfileEnv(
    claudeProfileId: string,
    model: string
): Promise<Record<string, string>> {
    const profileManager = getClaudeProfileManager();

    try {
        // Return env for the explicitly selected OAuth account.
        // Do not mutate global active profile here.
        const profileEnv = profileManager.getProfileEnv(claudeProfileId);
        return {
            ...profileEnv,
            ANTHROPIC_MODEL: model,
        };
    } catch (err) {
        console.error(`[ProfileEnv] Failed to resolve OAuth profile ${claudeProfileId}:`, err);
        return {};
    }
}

/**
 * Get environment variables for Local LM Studio
 * 
 * @param model - Model name to use
 * @returns Environment variables for Local LM Studio
 */
async function getLocalLMStudioEnv(
    model: string
): Promise<Record<string, string>> {
    try {
        const settings = await readSettingsFile();
        // Ensure values are strings, handling undefined/null from settings
        // User provides base URL without /v1 (e.g., http://localhost:1234)
        const rawUrl: string = (settings?.localLmStudioUrl) ? String(settings.localLmStudioUrl) : 'http://localhost:1234';
        const apiKey: string = (settings?.localLmStudioApiKey) ? String(settings.localLmStudioApiKey) : 'lm-studio';

        // Normalize and strip /v1 suffix if user accidentally included it
        // The SDK will add /v1/messages itself
        let normalizedUrl = normalizeBaseUrlForSdk(rawUrl);
        normalizedUrl = normalizedUrl.replace(/\/v1\/?$/, ''); // Strip trailing /v1 if present

        // Env vars for OpenAI-compatible local server
        // IMPORTANT: ANTHROPIC_BASE_URL should NOT include /v1 - the SDK adds it!
        // We set ANTHROPIC_* vars because the python script uses Anthropic SDK
        // configured to point to local server.
        return {
            ANTHROPIC_BASE_URL: normalizedUrl,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_API_KEY: apiKey, // redundancy for SDKs
            ANTHROPIC_MODEL: model,
            // Also set generic vars if helpful (OpenAI SDK also adds /v1 itself)
            OPENAI_BASE_URL: normalizedUrl,
            OPENAI_API_KEY: apiKey,
        };
    } catch (err) {
        console.error('[ProfileEnv] Failed to load settings for Local LM Studio:', err);
        // Fallback defaults (without /v1 - SDK adds it)
        return {
            ANTHROPIC_BASE_URL: 'http://localhost:1234',
            ANTHROPIC_AUTH_TOKEN: 'lm-studio',
            ANTHROPIC_API_KEY: 'lm-studio',
            ANTHROPIC_MODEL: model
        };
    }
}

/**
 * Get environment variables for API profile by ID
 * 
 * @param apiProfileId - API profile ID (without 'api:' prefix)
 * @param model - Model name to use (overrides profile default)
 * @returns Environment variables for API mode
 */
async function getAPIProfileEnvById(
    apiProfileId: string,
    model: string
): Promise<Record<string, string>> {
    const file = await loadProfilesFile();

    // Find the profile by ID
    const profile = file.profiles.find((p: APIProfile) => p.id === apiProfileId);

    if (!profile) {
        console.warn(`[ProfileEnv] API profile ${apiProfileId} not found`);
        return {};
    }

    return buildAPIProfileEnv(profile, model);
}

function buildAPIProfileEnv(profile: APIProfile, model: string): Record<string, string> {
    // Build environment variables
    const envVars: Record<string, string> = {
        ANTHROPIC_BASE_URL: normalizeBaseUrlForSdk(profile.baseUrl || ''),
        ANTHROPIC_AUTH_TOKEN: profile.apiKey || '',
        ANTHROPIC_API_KEY: profile.apiKey || '', // redundancy
        ANTHROPIC_MODEL: model, // Use model from ProfileModelPair, not profile default
        ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.models?.haiku || '',
        ANTHROPIC_DEFAULT_SONNET_MODEL: profile.models?.sonnet || '',
        ANTHROPIC_DEFAULT_OPUS_MODEL: profile.models?.opus || '',
    };

    // Filter out empty values
    const filteredEnvVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(envVars)) {
        const trimmedValue = value?.trim();
        if (trimmedValue && trimmedValue !== '') {
            filteredEnvVars[key] = trimmedValue;
        }
    }

    return filteredEnvVars;
}

function isModelLikelyCompatibleWithBaseUrl(model: string, baseUrl: string): boolean {
    const normalizedModel = model.trim().toLowerCase();
    const normalizedBaseUrl = (baseUrl || '').toLowerCase();

    if (!normalizedModel || !normalizedBaseUrl) {
        return false;
    }

    const isMoonshotProvider =
        normalizedBaseUrl.includes('moonshot.ai') ||
        normalizedBaseUrl.includes('moonshot.cn');
    const isGlmProvider =
        normalizedBaseUrl.includes('z.ai') ||
        normalizedBaseUrl.includes('bigmodel.cn');

    // Kimi model IDs are Moonshot-specific and must not be routed to GLM endpoints.
    if (normalizedModel.startsWith('kimi')) {
        return isMoonshotProvider;
    }

    // GLM model IDs should only be routed to z.ai / BigModel endpoints.
    if (normalizedModel.startsWith('glm')) {
        return isGlmProvider;
    }

    // Claude model IDs are typically incompatible with GLM endpoints.
    if (normalizedModel.startsWith('claude-')) {
        return !isGlmProvider;
    }

    return true;
}

async function getFirstMatchingAPIProfileEnv(
    model: string,
    baseUrlHints: string[]
): Promise<Record<string, string>> {
    const file = await loadProfilesFile();

    const matchingProfile = file.profiles.find((profile: APIProfile) => {
        const baseUrl = (profile.baseUrl || '').toLowerCase();
        const hasAuth = Boolean(profile.apiKey?.trim());
        return (
            hasAuth &&
            baseUrlHints.some((hint) => baseUrl.includes(hint)) &&
            isModelLikelyCompatibleWithBaseUrl(model, baseUrl)
        );
    });

    if (!matchingProfile) {
        return {};
    }

    return buildAPIProfileEnv(matchingProfile, model);
}

async function getCLIProfileEnv(
    cliToolId: string,
    model: string
): Promise<Record<string, string>> {
    try {
        if (cliToolId === 'claude-code') {
            const profileManager = getClaudeProfileManager();
            const activeProfileEnv = profileManager.getActiveProfileEnv();
            if (!activeProfileEnv || Object.keys(activeProfileEnv).length === 0) {
                return {};
            }
            return {
                ...activeProfileEnv,
                ANTHROPIC_MODEL: model,
            };
        }

        if (cliToolId === 'kimi-code') {
            return getFirstMatchingAPIProfileEnv(model, CLI_KIMI_PROVIDER_HINTS);
        }

        if (cliToolId === 'codex') {
            return getFirstMatchingAPIProfileEnv(model, CLI_CODEX_PROVIDER_HINTS);
        }

        if (cliToolId === 'open-code') {
            return getFirstMatchingAPIProfileEnv(model, CLI_OPENCODE_PROVIDER_HINTS);
        }
    } catch (err) {
        console.warn(`[ProfileEnv] Failed to resolve CLI profile ${cliToolId}:`, err);
    }

    return {};
}

function isUsablePair(pair: ProfileModelPair | undefined): pair is ProfileModelPair {
    return Boolean(
        pair &&
        typeof pair.profileId === 'string' &&
        typeof pair.model === 'string' &&
        pair.profileId.trim() &&
        pair.model.trim()
    );
}

/**
 * Build phase-specific provider env chains from V3 config.
 * Empty/invalid providers are skipped, which implements automatic "use next valid provider" behavior.
 */
export async function buildPhaseProviderEnvConfig(
    phaseModelsV3?: PhaseModelConfigV3
): Promise<PhaseProviderEnvConfig | null> {
    if (!phaseModelsV3) {
        return null;
    }

    const config: PhaseProviderEnvConfig = {
        spec: [],
        planning: [],
        coding: [],
        qa: []
    };

    for (const phase of PHASE_KEYS) {
        const chain = phaseModelsV3[phase] || [];
        for (const pair of chain) {
            if (!isUsablePair(pair)) {
                continue;
            }

            try {
                const env = await getProfileEnvForPair(pair);
                if (!env || Object.keys(env).length === 0) {
                    continue;
                }
                config[phase].push({
                    profileId: pair.profileId.trim(),
                    model: pair.model.trim(),
                    env: {
                        ...env,
                        ANTHROPIC_MODEL: pair.model.trim()
                    }
                });
            } catch (error) {
                console.warn(`[ProfileEnv] Failed to build provider env for ${phase}:`, error);
            }
        }
    }

    const hasAnyEntry = PHASE_KEYS.some((phase) => config[phase].length > 0);
    return hasAnyEntry ? config : null;
}
