import { readSettingsFile } from '../../settings-utils';
import { getClaudeProfileManager } from '../../claude-profile-manager';
import { loadProfilesFile } from './profile-manager';
import { normalizeBaseUrlForSdk } from './profile-service';
import type { ProfileModelPair } from '../../../shared/types/settings';
import type { APIProfile } from '../../../shared/types/profile';
import type { ClaudeProfile } from '../../../shared/types';
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
        // Set the active Claude profile
        await profileManager.setActiveProfile(claudeProfileId);

        // OAuth mode: Clear API profile vars, set model
        return {
            ANTHROPIC_MODEL: model,
            // OAuth token will be loaded by the SDK from the Claude profile's config
        };
    } catch (err) {
        console.error(`[ProfileEnv] Failed to activate OAuth profile ${claudeProfileId}:`, err);
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
        const baseUrl: string = (settings?.localLmStudioUrl) ? String(settings.localLmStudioUrl) : 'http://localhost:1234/v1';
        const apiKey: string = (settings?.localLmStudioApiKey) ? String(settings.localLmStudioApiKey) : 'lm-studio';
        const normalizedUrl = normalizeBaseUrlForSdk(baseUrl);

        // Env vars for OpenAI-compatible local server
        // We set ANTHROPIC_* vars because the python script likely uses Anthropic SDK
        // configured to point to local server.
        // We also set OPENAI_* vars in case the runner supports OpenAI SDK directly (optional improvement)
        return {
            ANTHROPIC_BASE_URL: normalizedUrl,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_API_KEY: apiKey, // redundancy for SDKs
            ANTHROPIC_MODEL: model,
            // Also set generic vars if helpful
            OPENAI_BASE_URL: normalizedUrl,
            OPENAI_API_KEY: apiKey,
        };
    } catch (err) {
        console.error('[ProfileEnv] Failed to load settings for Local LM Studio:', err);
        // Fallback defaults
        return {
            ANTHROPIC_BASE_URL: 'http://localhost:1234/v1',
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
