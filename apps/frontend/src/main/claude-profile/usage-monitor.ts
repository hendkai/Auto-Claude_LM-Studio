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
import { ClaudeUsageSnapshot } from '../../shared/types/agent';
import { loadProfilesFile } from '../services/profile';
import { APIProfile } from '../../shared/types/profile';

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

export class UsageMonitor extends EventEmitter {
  private static instance: UsageMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private currentUsage: ClaudeUsageSnapshot | null = null;
  private isChecking = false;
  private useApiMethod = true; // Try API first, fall back to CLI if it fails

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
      console.warn('[UsageMonitor] Proactive monitoring disabled');
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

      // Check thresholds
      const settings = profileManager.getAutoSwitchSettings();
      const sessionExceeded = usage.sessionPercent >= settings.sessionThreshold;
      const weeklyExceeded = usage.weeklyPercent >= settings.weeklyThreshold;

      if (sessionExceeded || weeklyExceeded) {
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
      }
    } catch (error) {
      console.error('[UsageMonitor] Check failed:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Fetch usage for a custom API Profile
   */
  private async fetchApiProfileUsage(profile: APIProfile): Promise<ClaudeUsageSnapshot | null> {
    // Check if it's a GLM profile
    const isGlm = profile.baseUrl.includes('api.z.ai') || profile.baseUrl.includes('bigmodel.cn');

    if (isGlm) {
      const usage = await this.fetchGlmUsage(profile.apiKey || '', profile.id, profile.name);
      if (usage) return usage;
    }

    // Generic API usage fetch could go here (e.g. standard Anthropic compatible)
    // For now returning null so it doesn't break anything else
    return null;
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
        // Handle potentially wrapped response (Rust impl handles "data" wrapper or direct)
        // We defined interface assuming wrapper or direct check
        const data = (rawData.data || rawData) as { limits: GlmLimit[] };

        if (!data.limits || !Array.isArray(data.limits)) {
          continue;
        }

        // Calculate generic usage stats from limits
        // We find the limit with the highest percentage to represent "Session" (or general) usage
        let maxPercent = 0;
        let weeklyPercent = 0; // GLM doesn't distinguish strictly, so we map primarily to session
        let nextReset: string | undefined;

        for (const limit of data.limits) {
          const pct = limit.percentage || 0;
          if (pct > maxPercent) {
            maxPercent = pct;
            nextReset = limit.nextResetTime
              ? this.formatResetTime(new Date(limit.nextResetTime).toISOString())
              : undefined;
          }
        }

        // Map to snapshot
        const customUsageDetails = data.limits.map(limit => ({
          label: limit.type,
          value: `${limit.currentValue}${limit.unit} / ${limit.number}${limit.unit}`, // e.g. "1500 TOKEN / 10000 TOKEN" - can be refined if units are just strings
          rawLabel: limit.type, // Store original type
          rawValue: typeof limit.currentValue === 'number' && typeof limit.number === 'number'
            ? `${(limit.currentValue / 1000000).toFixed(2)}M / ${(limit.number / 1000000).toFixed(2)}M` // Assume large numbers are tokens
            : `${limit.currentValue} / ${limit.number}`,
          percentage: limit.percentage || 0,
          resetTime: limit.nextResetTime
            ? this.formatResetTime(new Date(limit.nextResetTime).toISOString())
            : undefined
        })).map(detail => ({
          label: detail.rawLabel,
          value: detail.rawLabel === 'TOKEN' ? detail.rawValue : detail.value, // Special formatting for TOKEN if needed, or just use raw strings
          percentage: detail.percentage,
          resetTime: detail.resetTime
        }));

        return {
          sessionPercent: Math.round(maxPercent),
          weeklyPercent: 0, // Not explicitly separate in GLM generic response usually
          sessionResetTime: nextReset || 'Unknown',
          weeklyResetTime: 'Unknown',
          profileId,
          profileName,
          fetchedAt: new Date(),
          limitType: 'session',
          customUsageDetails
        };

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

    // Attempt 1: Direct API call (Antrophic / GLM)
    if (this.useApiMethod && oauthToken) {
      // Try Anthropic first
      let apiUsage = await this.fetchUsageViaAPI(oauthToken, profileId, profile.name);

      // If Anthropic failed, try GLM
      if (!apiUsage) {
        apiUsage = await this.fetchGlmUsage(oauthToken, profileId, profile.name);
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
    profileName: string
  ): Promise<ClaudeUsageSnapshot | null> {
    try {
      const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        }
      });

      if (!response.ok) {
        console.error('[UsageMonitor] API error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json() as {
        five_hour_utilization?: number;
        seven_day_utilization?: number;
        five_hour_reset_at?: string;
        seven_day_reset_at?: string;
      };

      // Expected response format:
      // {
      //   "five_hour_utilization": 0.72,  // 0.0-1.0
      //   "seven_day_utilization": 0.45,  // 0.0-1.0
      //   "five_hour_reset_at": "2025-01-17T15:00:00Z",
      //   "seven_day_reset_at": "2025-01-20T12:00:00Z"
      // }

      return {
        sessionPercent: Math.round((data.five_hour_utilization || 0) * 100),
        weeklyPercent: Math.round((data.seven_day_utilization || 0) * 100),
        sessionResetTime: this.formatResetTime(data.five_hour_reset_at),
        weeklyResetTime: this.formatResetTime(data.seven_day_reset_at),
        profileId,
        profileName,
        fetchedAt: new Date(),
        limitType: (data.seven_day_utilization || 0) > (data.five_hour_utilization || 0)
          ? 'weekly'
          : 'session'
      };
    } catch (error) {
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
   */
  private async performProactiveSwap(
    currentProfileId: string,
    limitType: 'session' | 'weekly'
  ): Promise<void> {
    const profileManager = getClaudeProfileManager();
    const bestProfile = profileManager.getBestAvailableProfile(currentProfileId);

    if (!bestProfile) {
      console.warn('[UsageMonitor] No alternative profile for proactive swap');
      this.emit('proactive-swap-failed', {
        reason: 'no_alternative',
        currentProfile: currentProfileId
      });
      return;
    }

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
