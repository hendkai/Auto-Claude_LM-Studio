/**
 * MultiProfileModelSelect - Model selector supporting multiple API profiles
 *
 * Allows selecting models from any configured API profile (e.g., Claude API + LiteLLM).
 * Displays models grouped by profile in a searchable dropdown.
 */
import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown, Search, Check, RefreshCw, Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import type { ModelInfo } from '@shared/types/profile';
import type { ProfileModelPair } from '@shared/types/settings';

interface MultiProfileModelSelectProps {
    /** Currently selected profile + model pair */
    value: ProfileModelPair;
    /** Callback when model is selected */
    onChange: (pair: ProfileModelPair) => void;
    /** Placeholder text when no model selected */
    placeholder?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Additional CSS classes */
    className?: string;
}

interface ProfileModels {
    profileId: string;
    profileName: string;
    models: ModelInfo[];
}

/**
 * MultiProfileModelSelect Component
 *
 * @example
 * ```tsx
 * <MultiProfileModelSelect
 *   value={{ profileId: "claude-api", model: "claude-sonnet-4" }}
 *   onChange={(pair) => setModel(pair)}
 *   placeholder="Select a model"
 * />
 * ```
 */
export function MultiProfileModelSelect({
    value,
    onChange,
    placeholder = 'Select a model',
    disabled = false,
    className
}: MultiProfileModelSelectProps) {
    const { t } = useTranslation();
    const { profiles, discoverModels, settings } = useSettingsStore();

    // Dropdown state
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [profileModels, setProfileModels] = useState<ProfileModels[]>([]);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    /**
     * Fetch models from all profiles (both API profiles and OAuth accounts)
     */
    /**
     * Fetch models from all profiles (both API profiles and OAuth accounts)
     * AND auto-detect local LM Studio instance
     */
    const fetchAllProfileModels = async () => {
        setIsLoading(true);
        const results: ProfileModels[] = [];

        // Helper to safely fetch models for a profile
        const fetchProfileModels = async (profile: any) => {
            try {
                const models = await discoverModels(
                    profile.baseUrl,
                    profile.apiKey,
                    undefined
                );

                if (models && Array.isArray(models) && models.length > 0) {
                    return {
                        profileId: `api:${profile.id}`,
                        profileName: `${profile.name} (API)`,
                        models
                    };
                }
            } catch (err) {
                console.warn(`[MultiProfileModelSelect] Failed to fetch models from API profile ${profile.name}:`, err);
            }
            return null;
        };

        // Helper for local LM Studio detection
        const fetchLocalLMStudioModels = async () => {
            try {
                // Use configured URL or default
                const url = settings.localLmStudioUrl || 'http://localhost:1234/v1';
                const key = settings.localLmStudioApiKey || 'lm-studio';

                const models = await discoverModels(url, key, undefined);

                if (models && Array.isArray(models) && models.length > 0) {
                    console.log('[MultiProfileModelSelect] Auto-detected local LM Studio models');
                    return {
                        profileId: 'local:lm-studio',
                        profileName: 'Local (LM Studio)',
                        models
                    };
                }
            } catch (err) {
                // Ignore errors (not running)
            }
            return null;
        };

        // 1. Fetch from API Profiles (Parallel)
        const apiPromises = profiles.map(p => fetchProfileModels(p));

        // 2. Auto-detect LM Studio (Parallel)
        // Always try to fetch local models using settings provided
        const localPromise = fetchLocalLMStudioModels();

        // 3. Fetch from OAuth Claude Accounts (Parallel-ish logic)
        const oauthPromise = (async () => {
            try {
                const claudeProfilesResult = await window.electronAPI.getClaudeProfiles();
                if (claudeProfilesResult.success && claudeProfilesResult.data) {
                    const authenticatedOAuthProfiles = claudeProfilesResult.data.profiles.filter(
                        (p: any) => p.oauthToken || (p.isDefault && p.configDir)
                    );

                    const oauthResults: ProfileModels[] = [];
                    for (const oauthProfile of authenticatedOAuthProfiles) {
                        const claudeModels: ModelInfo[] = [
                            { id: 'claude-sonnet-4-5-20250929', display_name: 'Claude Sonnet 4.5' },
                            { id: 'claude-code', display_name: 'Claude Code' },
                            { id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5' },
                            { id: 'claude-opus-4-5-20251101', display_name: 'Claude Opus 4.5' }
                        ];

                        oauthResults.push({
                            profileId: `oauth:${oauthProfile.id}`,
                            profileName: `${oauthProfile.name} (OAuth)${oauthProfile.email ? ` - ${oauthProfile.email}` : ''}`,
                            models: claudeModels
                        });
                    }
                    return oauthResults;
                }
            } catch (err) {
                console.warn('[MultiProfileModelSelect] Failed to fetch OAuth Claude accounts:', err);
            }
            return [];
        })();

        // Wait for all
        const [apiResults, localResult, oauthResults] = await Promise.all([
            Promise.all(apiPromises),
            localPromise,
            oauthPromise
        ]);

        // Combine results
        const validApiResults = apiResults.filter((r): r is ProfileModels => r !== null);
        const validLocalResult = localResult ? [localResult] : [];
        const validOauthResults = oauthResults || [];

        setProfileModels([...validOauthResults, ...validApiResults, ...validLocalResult]);
        setIsLoading(false);
    };

    /**
     * Handle dropdown open
     */
    const handleOpen = () => {
        if (disabled) return;
        setIsOpen(true);

        // Fetch models if not already loaded
        if (profileModels.length === 0) {
            fetchAllProfileModels();
        }
    };

    /**
     * Handle dropdown close
     */
    const handleClose = () => {
        setIsOpen(false);
        setSearchQuery('');
    };

    /**
     * Handle refresh button
     */
    const handleRefresh = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await fetchAllProfileModels();
    };

    /**
     * Handle model selection
     */
    const handleSelect = (profileId: string, modelId: string) => {
        onChange({ profileId, model: modelId });
        handleClose();
    };

    /**
     * Click outside to close
     */
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                handleClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    /**
     * Filter models by search query
     */
    const filteredProfileModels = profileModels.map(pm => ({
        ...pm,
        models: pm.models.filter(model =>
            model.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            model.id.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(pm => pm.models.length > 0);

    /**
     * Get display text for selected value
     * Shows only model name for compact display
     */
    const getDisplayText = () => {
        if (!value.profileId || !value.model) return placeholder;

        // Just show the model name for compact display
        // Profile info is visible in the dropdown when opened
        return value.model;
    };

    return (
        <div className={cn('relative', className)} ref={containerRef}>
            {/* Trigger Button */}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={handleOpen}
                    disabled={disabled}
                    className={cn(
                        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                        'hover:bg-accent hover:text-accent-foreground transition-colors'
                    )}
                >
                    <span className={cn(!value.model && 'text-muted-foreground')}>
                        {getDisplayText()}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </button>

                {/* Refresh Button */}
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleRefresh}
                    disabled={disabled || isLoading}
                    title="Refresh models from all profiles"
                >
                    <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                </Button>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-2 w-full min-w-[300px] rounded-md border bg-popover p-0 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
                    {/* Search Input */}
                    <div className="flex items-center border-b px-3 py-2">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <Input
                            ref={inputRef}
                            placeholder="Search models..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 border-0 bg-transparent p-0 placeholder:text-muted-foreground focus-visible:ring-0"
                            autoFocus
                        />
                    </div>

                    {/* Model List */}
                    <div className="max-h-[300px] overflow-y-auto p-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading models...</span>
                            </div>
                        ) : filteredProfileModels.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                {searchQuery ? 'No models found matching your search.' : 'No models available.'}
                            </div>
                        ) : (
                            filteredProfileModels.map((pm) => (
                                <div key={pm.profileId} className="mb-2">
                                    {/* Profile Header */}
                                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                        <Folder className="h-3 w-3" />
                                        {pm.profileName}
                                    </div>

                                    {/* Models */}
                                    {pm.models.map((model) => {
                                        const isSelected = value.profileId === pm.profileId && value.model === model.id;
                                        return (
                                            <button
                                                key={model.id}
                                                type="button"
                                                onClick={() => handleSelect(pm.profileId, model.id)}
                                                className={cn(
                                                    'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 pl-8 text-sm outline-none transition-colors',
                                                    isSelected
                                                        ? 'bg-accent text-accent-foreground'
                                                        : 'hover:bg-accent hover:text-accent-foreground'
                                                )}
                                            >
                                                {isSelected && (
                                                    <Check className="absolute left-2 h-4 w-4" />
                                                )}
                                                <span>{model.display_name || model.id}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
