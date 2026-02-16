/**
 * Usage Monitor - Proactive usage monitoring and account switching
 *
 * Monitors Claude account usage at configured intervals and automatically
 * switches to alternative accounts before hitting rate limits.
 *
 * Uses hybrid approach:
 * 1. Primary: Direct OAuth API (https://api.anthropic.com/api/oauth/usage)
 * 2. Fallback: CLI /usage command parsing
 */

import { EventEmitter } from 'events';
import { getClaudeProfileManager } from '../claude-profile-manager';
import { ClaudeUsageSnapshot, AllProfilesUsage, ProfileUsageSummary } from '../../shared/types/agent';
import { loadProfilesFile } from '../services/profile/profile-manager';
import { APIProfile } from '../../shared/types/profile';
import { detectProvider as detectProviderFromUrl } from '../../shared/utils/provider-detection';

interface GlmLimit {
  type: string;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage?: number;
  unit?: number;
  number?: number; // max limit
  nextResetTime?: number; // ms timestamp
}

interface GlmResponse {
  data: {
    limits: GlmLimit[];
  }
}

export type ApiProvider = 'anthropic' | 'zai' | 'zhipu' | 'unknown';

interface ActiveProfileContext {
  isAPIProfile: boolean;
  profileId: string;
  profileName: string;
  baseUrl?: string;
}

export function detectProvider(baseUrl: string): ApiProvider {
  return detectProviderFromUrl(baseUrl);
}

export function getUsageEndpoint(provider: ApiProvider, baseUrl: string): string | null {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch (_error) {
    return null;
  }

  switch (provider) {
    case 'anthropic':
      return `${origin}/api/oauth/usage`;
    case 'zai':
    case 'zhipu':
      return `${origin}/api/monitor/usage/quota/limit`;
    default:
      return null;
  }
}

export class UsageMonitor extends EventEmitter {
  private static instance: UsageMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private currentUsage: ClaudeUsageSnapshot | null = null;
  private isChecking = false;
  private useApiMethod = true; // Try API first, fall back to CLI if it fails
  private apiFailureTimestamps: Map<string, number> = new Map();
  private allProfilesUsageCache: { data: AllProfilesUsage | null; fetchedAtMs: number } = {
    data: null,
    fetchedAtMs: 0
  };
  private static ALL_PROFILES_USAGE_CACHE_MS = 60 * 1000;
  private static API_FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
  
  // Swap loop protection: track profiles that recently failed auth
  private authFailedProfiles: Map<string, number> = new Map(); // profileId -> timestamp
  private static AUTH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown
  
  // Debug flag for verbose logging
  private readonly isDebug = process.env.DEBUG === 'true';

  private constructor() {
    super();
    console.warn('[UsageMonitor] Initialized');
  }

  static getInstance(): UsageMonitor {
    if (!UsageMonitor.instance) {
      UsageMonitor.instance = new UsageMonitor();
    }
    return UsageMonitor.instance;
  }

  /**
   * Start monitoring usage at configured interval
   */
  start(): void {
    const profileManager = getClaudeProfileManager();
    const settings = profileManager.getAutoSwitchSettings();

    if (!settings.enabled || !settings.proactiveSwapEnabled) {
      console.warn('[UsageMonitor] Proactive monitoring disabled. Settings:', JSON.stringify(settings, null, 2));
      return;
    }

    if (this.intervalId) {
      console.warn('[UsageMonitor] Already running');
      return;
    }

    const interval = settings.usageCheckInterval || 30000;
    console.warn('[UsageMonitor] Starting with interval:', interval, 'ms');

    // Check immediately
    this.checkUsageAndSwap();

    // Then check periodically
    this.intervalId = setInterval(() => {
      this.checkUsageAndSwap();
    }, interval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.warn('[UsageMonitor] Stopped');
    }
  }

  /**
   * Get current usage snapshot (for UI indicator)
   */
  getCurrentUsage(): ClaudeUsageSnapshot | null {
    return this.currentUsage;
  }

  /**
   * Force a usage check immediately
   */
  async refresh(): Promise<ClaudeUsageSnapshot | null> {
    await this.checkUsageAndSwap();
    return this.currentUsage;
  }

  /**
   * Clear cached usage data, optionally scoped to one profile.
   */
  clearProfileUsageCache(profileId?: string): void {
    if (!profileId || this.currentUsage?.profileId === profileId) {
      this.currentUsage = null;
    }

    if (this.allProfilesUsageCache.data) {
      if (profileId) {
        this.allProfilesUsageCache.data = {
          ...this.allProfilesUsageCache.data,
          allProfiles: this.allProfilesUsageCache.data.allProfiles.filter(
            (profile) => profile.profileId !== profileId
          )
        };
      } else {
        this.allProfilesUsageCache.data = null;
      }
    }

    this.allProfilesUsageCache.fetchedAtMs = 0;
  }

  /**
   * Clear auth-failure cooldown marker for a profile.
   */
  clearAuthFailedProfile(profileId: string): void {
    this.authFailedProfiles.delete(profileId);
  }

  /**
   * Trigger an immediate usage check.
   */
  async checkNow(): Promise<void> {
    await this.checkUsageAndSwap();
  }

  private shouldUseApiMethod(profileId: string): boolean {
    if (!this.useApiMethod) {
      return false;
    }

    const lastFailure = this.apiFailureTimestamps.get(profileId);
    if (!lastFailure) {
      return true;
    }

    if (Date.now() - lastFailure >= UsageMonitor.API_FAILURE_COOLDOWN_MS) {
      this.apiFailureTimestamps.delete(profileId);
      return true;
    }

    return false;
  }

  private async getCredential(profileId?: string): Promise<string | null> {
    try {
      const profilesFile = await loadProfilesFile();
      const activeApiProfile = profilesFile.activeProfileId
        ? profilesFile.profiles.find((profile) => profile.id === profilesFile.activeProfileId)
        : undefined;

      if (activeApiProfile?.apiKey) {
        return activeApiProfile.apiKey;
      }

      if (profileId) {
        const matchedApiProfile = profilesFile.profiles.find((profile) => profile.id === profileId);
        if (matchedApiProfile?.apiKey) {
          return matchedApiProfile.apiKey;
        }
      }
    } catch (_error) {
      // Fall back to OAuth profile token below.
    }

    const profileManager = getClaudeProfileManager();
    const activeProfile = profileManager.getActiveProfile?.();
    if (!activeProfile) {
      return null;
    }

    return (await profileManager.getProfileToken(activeProfile.id)) ?? null;
  }

  private async resolveActiveProfileContext(
    profileId: string,
    profileName: string,
    activeProfile?: ActiveProfileContext
  ): Promise<ActiveProfileContext> {
    if (activeProfile) {
      return activeProfile;
    }

    try {
      const profilesFile = await loadProfilesFile();
      const matchedProfile = profilesFile.profiles.find((profile) => profile.id === profileId);
      const selectedProfile = matchedProfile || (
        profilesFile.activeProfileId
          ? profilesFile.profiles.find((profile) => profile.id === profilesFile.activeProfileId)
          : undefined
      );

      if (selectedProfile) {
        return {
          isAPIProfile: true,
          profileId: selectedProfile.id,
          profileName: selectedProfile.name,
          baseUrl: selectedProfile.baseUrl
        };
      }
    } catch (_error) {
      // Ignore profile-file read issues and use OAuth defaults below.
    }

    return {
      isAPIProfile: false,
      profileId,
      profileName,
      baseUrl: 'https://api.anthropic.com'
    };
  }

  private normalizeAnthropicResponse(
    rawData: unknown,
    profileId: string,
    profileName: string
  ): ClaudeUsageSnapshot {
    const data = (rawData || {}) as {
      five_hour_utilization?: number;
      seven_day_utilization?: number;
      five_hour_reset_at?: string;
      seven_day_reset_at?: string;
    };

    const sessionUtilization = typeof data.five_hour_utilization === 'number' ? data.five_hour_utilization : 0;
    const weeklyUtilization = typeof data.seven_day_utilization === 'number' ? data.seven_day_utilization : 0;

    return {
      sessionPercent: Math.round(sessionUtilization * 100),
      weeklyPercent: Math.round(weeklyUtilization * 100),
      sessionResetTimestamp: typeof data.five_hour_reset_at === 'string' ? data.five_hour_reset_at : undefined,
      weeklyResetTimestamp: typeof data.seven_day_reset_at === 'string' ? data.seven_day_reset_at : undefined,
      profileId,
      profileName,
      fetchedAt: new Date(),
      limitType: weeklyUtilization > sessionUtilization ? 'weekly' : 'session'
    };
  }

  private normalizeQuotaLimitResponse(
    rawData: unknown,
    profileId: string,
    profileName: string
  ): ClaudeUsageSnapshot | null {
    const limits = (rawData as { limits?: GlmLimit[] } | null)?.limits;
    if (!Array.isArray(limits) || limits.length === 0) {
      return null;
    }

    const tokenLimit = limits.find((limit) => /TOKEN/i.test(limit.type));
    const timeLimit = limits.find((limit) => /TIME/i.test(limit.type));
    if (!tokenLimit && !timeLimit) {
      return null;
    }

    const now = Date.now();
    const sessionResetTimestamp = typeof tokenLimit?.nextResetTime === 'number'
      ? new Date(tokenLimit.nextResetTime).toISOString()
      : new Date(now + 5 * 60 * 60 * 1000).toISOString();
    const weeklyResetTimestamp = typeof timeLimit?.nextResetTime === 'number'
      ? new Date(timeLimit.nextResetTime).toISOString()
      : new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

    const formatNumber = (value?: number): string => {
      if (value === undefined || value === null) {
        return 'N/A';
      }
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(2)}M`;
      }
      if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
      }
      return value.toString();
    };

    const customUsageDetails = limits.map((limit) => ({
      label: limit.type,
      value: `${formatNumber(limit.currentValue)} / ${formatNumber(limit.usage)}`,
      percentage: Math.round(limit.percentage ?? 0),
      resetTime: typeof limit.nextResetTime === 'number'
        ? this.formatResetTime(new Date(limit.nextResetTime).toISOString())
        : undefined
    }));

    const sessionPercent = Math.round(tokenLimit?.percentage ?? 0);
    const weeklyPercent = Math.round(timeLimit?.percentage ?? 0);

    return {
      sessionPercent,
      weeklyPercent,
      sessionResetTimestamp,
      weeklyResetTimestamp,
      sessionUsageValue: typeof tokenLimit?.currentValue === 'number' ? tokenLimit.currentValue : undefined,
      sessionUsageLimit: typeof tokenLimit?.usage === 'number' ? tokenLimit.usage : undefined,
      weeklyUsageValue: typeof timeLimit?.currentValue === 'number' ? timeLimit.currentValue : undefined,
      weeklyUsageLimit: typeof timeLimit?.usage === 'number' ? timeLimit.usage : undefined,
      profileId,
      profileName,
      fetchedAt: new Date(),
      limitType: weeklyPercent > sessionPercent ? 'weekly' : 'session',
      usageWindows: {
        sessionWindowLabel: 'common:usage.window5HoursQuota',
        weeklyWindowLabel: 'common:usage.windowMonthlyToolsQuota'
      },
      customUsageDetails
    };
  }

  private normalizeZAIResponse(
    rawData: unknown,
    profileId: string,
    profileName: string
  ): ClaudeUsageSnapshot | null {
    return this.normalizeQuotaLimitResponse(rawData, profileId, profileName);
  }

  private normalizeZhipuResponse(
    rawData: unknown,
    profileId: string,
    profileName: string
  ): ClaudeUsageSnapshot | null {
    return this.normalizeQuotaLimitResponse(rawData, profileId, profileName);
  }

  /**
   * Fetch usage summaries for all configured OAuth/API profiles.
   * Used by Account Priority UI for per-profile usage visualization.
   */
  async getAllProfilesUsage(forceRefresh: boolean = false): Promise<AllProfilesUsage | null> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.allProfilesUsageCache.data &&
      now - this.allProfilesUsageCache.fetchedAtMs < UsageMonitor.ALL_PROFILES_USAGE_CACHE_MS
    ) {
      return this.allProfilesUsageCache.data;
    }

    const profileManager = getClaudeProfileManager();
    const oauthProfiles = profileManager.getSettings().profiles;

    let apiProfiles: APIProfile[] = [];
    try {
      const profilesFile = await loadProfilesFile();
      apiProfiles = profilesFile.profiles || [];
    } catch (error) {
      console.warn('[UsageMonitor] Failed to load API profiles for all-profiles usage:', error);
    }

    const oauthSummaries = await Promise.all(
      oauthProfiles.map(async (profile): Promise<ProfileUsageSummary> => {
        const fallbackSession = profile.usage?.sessionUsagePercent ?? 0;
        const fallbackWeekly = profile.usage?.weeklyUsagePercent ?? 0;
        const rateLimitStatus = profileManager.isProfileRateLimited(profile.id);

        let usage: ClaudeUsageSnapshot | null = null;
        let needsReauthentication = false;
        const token = profileManager.getProfileToken(profile.id);

        if (token) {
          try {
            usage = await this.fetchUsageViaAPI(token, profile.id, profile.name);
            if (!usage) {
              usage = await this.fetchGlmUsage(token, profile.id, profile.name);
            }
          } catch (error: any) {
            if (error?.statusCode === 401 || error?.statusCode === 403) {
              needsReauthentication = true;
            } else if (this.isDebug) {
              console.warn('[UsageMonitor] OAuth usage fetch failed:', profile.id, error);
            }
          }
        }

        if (usage) {
          profileManager.updateProfileUsageFromAPI(profile.id, usage.sessionPercent, usage.weeklyPercent);
        }

        return {
          profileId: profile.id,
          profileName: profile.name,
          profileType: 'oauth',
          sessionPercent: usage?.sessionPercent ?? fallbackSession,
          weeklyPercent: usage?.weeklyPercent ?? fallbackWeekly,
          isRateLimited: rateLimitStatus.limited,
          rateLimitType: rateLimitStatus.type,
          needsReauthentication,
          customUsageDetails: usage?.customUsageDetails,
          fetchedAt: usage?.fetchedAt ?? new Date()
        };
      })
    );

    const apiSummaries = await Promise.all(
      apiProfiles.map(async (profile): Promise<ProfileUsageSummary> => {
        let usage: ClaudeUsageSnapshot | null = null;
        try {
          usage = await this.fetchApiProfileUsage(profile);
        } catch (error) {
          if (this.isDebug) {
            console.warn('[UsageMonitor] API profile usage fetch failed:', profile.id, error);
          }
        }

        return {
          profileId: profile.id,
          profileName: profile.name,
          profileType: 'api',
          sessionPercent: usage?.sessionPercent,
          weeklyPercent: usage?.weeklyPercent,
          isRateLimited: false,
          customUsageDetails: usage?.customUsageDetails,
          fetchedAt: usage?.fetchedAt ?? new Date()
        };
      })
    );

    const allProfilesUsage: AllProfilesUsage = {
      allProfiles: [...oauthSummaries, ...apiSummaries],
      fetchedAt: new Date()
    };

    this.allProfilesUsageCache = {
      data: allProfilesUsage,
      fetchedAtMs: now
    };

    this.emit('all-profiles-usage-updated', allProfilesUsage);
    return allProfilesUsage;
  }

  /**
   * Check usage and trigger swap if thresholds exceeded
   */
  private async checkUsageAndSwap(): Promise<void> {
    if (this.isChecking) {
      return; // Prevent concurrent checks
    }

    this.isChecking = true;

    try {
      // Check for active custom API Profile first
      const profilesFile = await loadProfilesFile();
      const activeApiProfileId = profilesFile.activeProfileId;
      const activeApiProfile = activeApiProfileId
        ? profilesFile.profiles.find(p => p.id === activeApiProfileId)
        : null;

      if (activeApiProfile) {
        const usage = await this.fetchApiProfileUsage(activeApiProfile);
        if (usage) {
          this.currentUsage = usage;
          this.emit('usage-updated', usage);
          void this.getAllProfilesUsage(false).catch((error) => {
            if (this.isDebug) {
              console.warn('[UsageMonitor] Failed to refresh all-profiles usage cache:', error);
            }
          });
          return;
        }
      }

      // Fallback to Claude Profile (OAuth)
      const profileManager = getClaudeProfileManager();
      const activeProfile = profileManager.getActiveProfile();

      if (!activeProfile) {
        // console.warn('[UsageMonitor] No active profile');
        return;
      }

      // Fetch current usage (hybrid approach)
      // Get decrypted token from ProfileManager (activeProfile.oauthToken is encrypted)
      const decryptedToken = profileManager.getProfileToken(activeProfile.id);
      const usage = await this.fetchUsage(activeProfile.id, decryptedToken ?? undefined);
      if (!usage) {
        console.warn('[UsageMonitor] Failed to fetch usage');
        return;
      }

      this.currentUsage = usage;

      // Emit usage update for UI
      this.emit('usage-updated', usage);
      void this.getAllProfilesUsage(false).catch((error) => {
        if (this.isDebug) {
          console.warn('[UsageMonitor] Failed to refresh all-profiles usage cache:', error);
        }
      });

      // Check thresholds
      const settings = profileManager.getAutoSwitchSettings();
      const sessionExceeded = usage.sessionPercent >= settings.sessionThreshold;
      const weeklyExceeded = usage.weeklyPercent >= settings.weeklyThreshold;

      if (sessionExceeded || weeklyExceeded) {
        if (this.isDebug) {
          console.warn('[UsageMonitor:TRACE] Threshold exceeded', {
            sessionPercent: usage.sessionPercent,
            weekPercent: usage.weeklyPercent,
            activeProfile: activeProfile.id,
            hasToken: !!decryptedToken
          });
        }

        console.warn('[UsageMonitor] Threshold exceeded:', {
          sessionPercent: usage.sessionPercent,
          sessionThreshold: settings.sessionThreshold,
          weeklyPercent: usage.weeklyPercent,
          weeklyThreshold: settings.weeklyThreshold
        });

        // Attempt proactive swap
        await this.performProactiveSwap(
          activeProfile.id,
          sessionExceeded ? 'session' : 'weekly'
        );
      } else {
        if (this.isDebug) {
          console.warn('[UsageMonitor:TRACE] Usage OK', {
            sessionPercent: usage.sessionPercent,
            weekPercent: usage.weeklyPercent
          });
        }
      }
    } catch (error) {
      // Check for auth failure (401/403) from fetchUsageViaAPI
      if ((error as any).statusCode === 401 || (error as any).statusCode === 403) {
        const profileManager = getClaudeProfileManager();
        const activeProfile = profileManager.getActiveProfile();
        
        if (activeProfile) {
          // Mark this profile as auth-failed to prevent swap loops
          this.authFailedProfiles.set(activeProfile.id, Date.now());
          console.warn('[UsageMonitor] Auth failure detected, marked profile as failed:', activeProfile.id);
          
          // Clean up expired entries from the failed profiles map
          const now = Date.now();
          this.authFailedProfiles.forEach((timestamp, profileId) => {
            if (now - timestamp > UsageMonitor.AUTH_FAILURE_COOLDOWN_MS) {
              this.authFailedProfiles.delete(profileId);
            }
          });
          
          try {
            const excludeProfiles = Array.from(this.authFailedProfiles.keys());
            console.warn('[UsageMonitor] Attempting proactive swap (excluding failed profiles):', excludeProfiles);
            await this.performProactiveSwap(
              activeProfile.id,
              'session', // Treat auth failure as session limit for immediate swap
              excludeProfiles
            );
            return;
          } catch (swapError) {
            console.error('[UsageMonitor] Failed to perform auth-failure swap:', swapError);
          }
        }
      }

      console.error('[UsageMonitor] Check failed:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Fetch usage for a custom API Profile
   */
  private async fetchApiProfileUsage(profile: APIProfile): Promise<ClaudeUsageSnapshot | null> {
    if (!profile.apiKey) {
      return null;
    }

    const activeProfile: ActiveProfileContext = {
      isAPIProfile: true,
      profileId: profile.id,
      profileName: profile.name,
      baseUrl: profile.baseUrl
    };

    return this.fetchUsageViaAPI(profile.apiKey, profile.id, profile.name, undefined, activeProfile);
  }

  /**
   * Fetch usage via GLM/Zhipu API
   * Endpoint: https://api.z.ai/api/monitor/usage/quota/limit
   */
  private async fetchGlmUsage(
    token: string,
    profileId: string,
    profileName: string
  ): Promise<ClaudeUsageSnapshot | null> {
    // Try Global (Z.ai) and CN (BigModel) endpoints
    const endpoints = [
      'https://api.z.ai/api/monitor/usage/quota/limit',
      'https://open.bigmodel.cn/api/monitor/usage/quota/limit'
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            // GLM API uses generic Authorization header (often without Bearer prefix based on reference impl)
            // But let's try raw token first as seen in Rust implementation
            'Authorization': token,
            'Accept-Language': 'en-US,en',
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          continue; // Try next endpoint
        }

        const rawData = await response.json();
        const usage = this.normalizeQuotaLimitResponse(rawData.data || rawData, profileId, profileName);
        if (usage) {
          return usage;
        }

      } catch (error) {
        // Ignore and try next
      }
    }

    return null;
  }

  /**
   * Fetch usage - HYBRID APPROACH
   * Tries API first, falls back to CLI if API fails
   */
  private async fetchUsage(
    profileId: string,
    oauthToken?: string
  ): Promise<ClaudeUsageSnapshot | null> {
    const profileManager = getClaudeProfileManager();
    const profile = profileManager.getProfile(profileId);
    if (!profile) {
      return null;
    }

    // Ensure we have a token (either OAuth or manual)
    const tokenToUse = oauthToken || (await profileManager.getProfileToken(profileId));
    if (!tokenToUse) {
      return null;
    }

    // Attempt 1: Direct API call (Anthropic / GLM)
    if (oauthToken && this.shouldUseApiMethod(profileId)) {
      // Try provider endpoint first
      let apiUsage = await this.fetchUsageViaAPI(tokenToUse, profileId, profile.name);

      // If provider endpoint failed, try GLM fallback endpoints
      if (!apiUsage) {
        apiUsage = await this.fetchGlmUsage(tokenToUse, profileId, profile.name);
      }

      if (apiUsage) {
        console.warn('[UsageMonitor] Successfully fetched via API');
        return apiUsage;
      }

      // API failed - switch to CLI method for future calls
      console.warn('[UsageMonitor] API method failed, falling back to CLI');
      this.useApiMethod = false;
    }

    // Attempt 2: CLI /usage command (fallback)
    return await this.fetchUsageViaCLI(profileId, profile.name);
  }

  /**
   * Fetch usage via OAuth API endpoint
   * Endpoint: https://api.anthropic.com/api/oauth/usage
   */
  private async fetchUsageViaAPI(
    oauthToken: string,
    profileId: string,
    profileName: string,
    _email?: string,
    activeProfile?: ActiveProfileContext
  ): Promise<ClaudeUsageSnapshot | null> {
    try {
      const profileContext = await this.resolveActiveProfileContext(profileId, profileName, activeProfile);
      const baseUrl = profileContext.baseUrl || 'https://api.anthropic.com';
      const provider = detectProvider(baseUrl);
      const endpoint = getUsageEndpoint(provider, baseUrl);

      if (!endpoint || provider === 'unknown') {
        this.apiFailureTimestamps.set(profileId, Date.now());
        console.error('[UsageMonitor] Unsupported provider for usage endpoint:', { profileId, baseUrl, provider });
        return null;
      }

      const headers: Record<string, string> = provider === 'anthropic'
        ? {
            'Authorization': `Bearer ${oauthToken}`,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          }
        : {
            'Authorization': oauthToken,
            'Accept-Language': 'en-US,en',
            'Content-Type': 'application/json'
          };

      const response = await fetch(endpoint, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        this.apiFailureTimestamps.set(profileId, Date.now());
        console.error('[UsageMonitor] API error:', response.status, response.statusText);
        // Throw specific error for auth failures so we can trigger a swap
        if (response.status === 401 || response.status === 403) {
          const error = new Error(`API Auth Failure: ${response.status}`);
          (error as any).statusCode = response.status;
          throw error;
        }
        return null;
      }

      const rawData = await response.json();
      if (provider === 'anthropic') {
        return this.normalizeAnthropicResponse(rawData, profileId, profileName);
      }

      if (provider === 'zai') {
        const usage = this.normalizeZAIResponse(rawData?.data || rawData, profileId, profileName);
        if (usage) {
          return usage;
        }
      }

      if (provider === 'zhipu') {
        const usage = this.normalizeZhipuResponse(rawData?.data || rawData, profileId, profileName);
        if (usage) {
          return usage;
        }
      }

      this.apiFailureTimestamps.set(profileId, Date.now());
      return null;
    } catch (error: any) {
      // Re-throw auth failures to be handled by checkUsageAndSwap
      if (error?.statusCode === 401 || error?.statusCode === 403) {
        throw error;
      }

      this.apiFailureTimestamps.set(profileId, Date.now());
      console.error('[UsageMonitor] API fetch failed:', error);
      return null;
    }
  }

  /**
   * Fetch usage via CLI /usage command (fallback)
   * Note: This is a fallback method. The API method is preferred.
   * CLI-based fetching would require spawning a Claude process and parsing output,
   * which is complex. For now, we rely on the API method.
   */
  private async fetchUsageViaCLI(
    _profileId: string,
    _profileName: string
  ): Promise<ClaudeUsageSnapshot | null> {
    // CLI-based usage fetching is not implemented yet.
    // The API method should handle most cases. If we need CLI fallback,
    // we would need to spawn a Claude process with /usage command and parse the output.
    console.warn('[UsageMonitor] CLI fallback not implemented, API method should be used');
    return null;
  }

  /**
   * Format ISO timestamp to human-readable reset time
   */
  private formatResetTime(isoTimestamp?: string): string {
    if (!isoTimestamp) return 'Unknown';

    try {
      const date = new Date(isoTimestamp);
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (diffHours < 24) {
        return `${diffHours}h ${diffMins}m`;
      }

      const diffDays = Math.floor(diffHours / 24);
      const remainingHours = diffHours % 24;
      return `${diffDays}d ${remainingHours}h`;
    } catch (_error) {
      return isoTimestamp;
    }
  }

  /**
   * Perform proactive profile swap
   * @param currentProfileId - The profile to switch from
   * @param limitType - The type of limit that triggered the swap
   * @param additionalExclusions - Additional profile IDs to exclude (e.g., auth-failed profiles)
   */
  private async performProactiveSwap(
    currentProfileId: string,
    limitType: 'session' | 'weekly',
    additionalExclusions: string[] = []
  ): Promise<void> {
    const profileManager = getClaudeProfileManager();
    
    // Get all profiles to swap to, excluding current and any additional exclusions
    const allProfiles = profileManager.getProfilesSortedByAvailability();
    const excludeIds = new Set([currentProfileId, ...additionalExclusions]);
    const eligibleProfiles = allProfiles.filter(p => !excludeIds.has(p.id));
    
    if (eligibleProfiles.length === 0) {
      console.warn('[UsageMonitor] No alternative profile for proactive swap (excluded:', Array.from(excludeIds), ')');
      this.emit('proactive-swap-failed', {
        reason: additionalExclusions.length > 0 ? 'all_alternatives_failed_auth' : 'no_alternative',
        currentProfile: currentProfileId,
        excludedProfiles: Array.from(excludeIds)
      });
      return;
    }
    
    // Use the best available from eligible profiles
    const bestProfile = eligibleProfiles[0];

    console.warn('[UsageMonitor] Proactive swap:', {
      from: currentProfileId,
      to: bestProfile.id,
      reason: limitType
    });

    // Switch profile
    profileManager.setActiveProfile(bestProfile.id);

    // Emit swap event
    this.emit('proactive-swap-completed', {
      fromProfile: { id: currentProfileId, name: profileManager.getProfile(currentProfileId)?.name },
      toProfile: { id: bestProfile.id, name: bestProfile.name },
      limitType,
      timestamp: new Date()
    });

    // Notify UI
    this.emit('show-swap-notification', {
      fromProfile: profileManager.getProfile(currentProfileId)?.name,
      toProfile: bestProfile.name,
      reason: 'proactive',
      limitType
    });

    // Note: Don't immediately check new profile - let normal interval handle it
    // This prevents cascading swaps if multiple profiles are near limits
  }
}

/**
 * Get the singleton UsageMonitor instance
 */
export function getUsageMonitor(): UsageMonitor {
  return UsageMonitor.getInstance();
}
