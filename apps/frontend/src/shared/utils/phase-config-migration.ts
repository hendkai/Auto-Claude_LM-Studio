/**
 * Migration utilities for converting between Phase Model Config versions
 */

import type {
    PhaseModelConfig,
    PhaseModelConfigV2,
    PhaseModelConfigV3,
    ProfileModelPair,
    ModelTypeShort
} from '../types/settings';

/**
 * Migrate V2 config (single model per phase) to V3 (fallback chain per phase)
 * Converts each single ProfileModelPair into an array with one element
 */
export function migrateV2ToV3(v2: PhaseModelConfigV2): PhaseModelConfigV3 {
    return {
        spec: [v2.spec],
        planning: [v2.planning],
        coding: [v2.coding],
        qa: [v2.qa]
    };
}

/**
 * Migrate V1 config (ModelTypeShort) to V3 (fallback chain)
 * Requires active profile ID to construct ProfileModelPair
 */
export function migrateV1ToV3(
    v1: PhaseModelConfig,
    activeProfileId: string
): PhaseModelConfigV3 {
    const modelMap: Record<ModelTypeShort, string> = {
        'haiku': 'claude-haiku-4-5-20251001',
        'sonnet': 'claude-sonnet-4-5-20250929',
        'opus': 'claude-opus-4-5-20251101'
    };

    const toPair = (modelType: ModelTypeShort): ProfileModelPair => ({
        profileId: `api:${activeProfileId}`,
        model: modelMap[modelType]
    });

    return {
        spec: [toPair(v1.spec)],
        planning: [toPair(v1.planning)],
        coding: [toPair(v1.coding)],
        qa: [toPair(v1.qa)]
    };
}

/**
 * Get current phase config in V3 format, migrating if needed
 * Priority: V3 > V2 > V1 > defaults
 */
export function getCurrentPhaseConfigV3(
    settings: {
        customPhaseModelsV3?: PhaseModelConfigV3;
        customPhaseModelsV2?: PhaseModelConfigV2;
        customPhaseModels?: PhaseModelConfig;
    },
    profileDefaults: PhaseModelConfig,
    activeProfileId: string
): PhaseModelConfigV3 {
    // If V3 exists, use it directly
    if (settings.customPhaseModelsV3) {
        return settings.customPhaseModelsV3;
    }

    // If V2 exists, migrate to V3
    if (settings.customPhaseModelsV2) {
        return migrateV2ToV3(settings.customPhaseModelsV2);
    }

    // If V1 exists, migrate to V3
    if (settings.customPhaseModels) {
        return migrateV1ToV3(settings.customPhaseModels, activeProfileId);
    }

    // Use profile defaults
    return migrateV1ToV3(profileDefaults, activeProfileId);
}
