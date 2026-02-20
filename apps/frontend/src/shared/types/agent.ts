/**
 * Agent-related types (Claude profiles and authentication)
 */

// ============================================
// Claude Profile Types (Multi-Account Support)
// ============================================

/**
 * Usage data parsed from Claude Code's /usage command
 */
export interface ClaudeUsageData {
  /** Session usage percentage (0-100) */
  sessionUsagePercent: number;
  /** When the session limit resets (ISO string or description like "11:59pm") */
  sessionResetTime: string;
  /** Weekly usage percentage across all models (0-100) */
  weeklyUsagePercent: number;
  /** When the weekly limit resets (ISO string or description) */
  weeklyResetTime: string;
  /** Weekly Opus usage percentage (0-100), if applicable */
  opusUsagePercent?: number;
  /** When this usage data was last updated */
  lastUpdated: Date;
}

/**
 * Real-time usage snapshot for proactive monitoring
 * Returned from API or CLI usage check
 */
export interface ClaudeUsageSnapshot {
  /** Session usage percentage (0-100) */
  sessionPercent: number;
  /** Weekly usage percentage (0-100) */
  weeklyPercent: number;
  /** When the session limit resets (human-readable or ISO) */
  sessionResetTime?: string;
  /** When the weekly limit resets (human-readable or ISO) */
  weeklyResetTime?: string;
  /** ISO timestamp of when the session limit resets */
  sessionResetTimestamp?: string;
  /** ISO timestamp of when the weekly limit resets */
  weeklyResetTimestamp?: string;
  /** Profile ID this snapshot belongs to */
  profileId: string;
  /** Profile name for display */
  profileName: string;
  /** Email associated with the profile */
  profileEmail?: string;
  /** When this snapshot was captured */
  fetchedAt: Date;
  /** Which limit is closest to threshold ('session' or 'weekly') */
  limitType?: 'session' | 'weekly';
  /** Provider-specific usage window labels */
  usageWindows?: {
    sessionWindowLabel: string;
    weeklyWindowLabel: string;
  };
  /** Raw session usage value */
  sessionUsageValue?: number;
  /** Session usage limit */
  sessionUsageLimit?: number;
  /** Raw weekly usage value */
  weeklyUsageValue?: number;
  /** Weekly usage limit */
  weeklyUsageLimit?: number;
  /** True if profile requires re-authentication */
  needsReauthentication?: boolean;
  /** Optional detailed breakdown (e.g. for GLM: Token limits, Request limits) */
  customUsageDetails?: Array<{
    label: string;
    value: string; // e.g. "1.2M / 10M"
    percentage: number;
    resetTime?: string;
  }>;
}

/**
 * Usage summary for a single configured account/profile.
 * Used by account-priority UI to render per-profile usage health.
 */
export interface ProfileUsageSummary {
  /** Profile ID (OAuth profile id or API profile id) */
  profileId: string;
  /** Display name for UI */
  profileName: string;
  /** Email associated with the profile */
  profileEmail?: string;
  /** Source profile type */
  profileType: 'oauth' | 'api';
  /** Session usage percentage (0-100), when available */
  sessionPercent?: number;
  /** Weekly usage percentage (0-100), when available */
  weeklyPercent?: number;
  /** ISO timestamp of when the session limit resets */
  sessionResetTimestamp?: string;
  /** ISO timestamp of when the weekly limit resets */
  weeklyResetTimestamp?: string;
  /** Whether profile is authenticated */
  isAuthenticated?: boolean;
  /** Whether profile is currently rate-limited */
  isRateLimited?: boolean;
  /** Which limit type is currently constraining */
  rateLimitType?: 'session' | 'weekly';
  /** Availability score for ranking/routing */
  availabilityScore?: number;
  /** Whether this is the currently active profile */
  isActive?: boolean;
  /** Timestamp of last successful fetch (ISO) */
  lastFetchedAt?: string;
  /** Optional fetch error */
  fetchError?: string;
  /** Indicates invalid auth/refresh state requiring re-authentication */
  needsReauthentication?: boolean;
  /** Optional provider-specific usage breakdown */
  customUsageDetails?: ClaudeUsageSnapshot['customUsageDetails'];
  /** Timestamp when this profile usage snapshot was generated */
  fetchedAt: Date;
}

/**
 * Aggregated usage snapshot across all configured OAuth/API profiles.
 */
export interface AllProfilesUsage {
  allProfiles: ProfileUsageSummary[];
  fetchedAt: Date;
}

/**
 * Rate limit event recorded for a profile
 */
export interface ClaudeRateLimitEvent {
  /** Type of limit hit: 'session' or 'weekly' */
  type: 'session' | 'weekly';
  /** When the limit was hit */
  hitAt: Date;
  /** When it's expected to reset */
  resetAt: Date;
  /** The reset time string from Claude (e.g., "Dec 17 at 6am") */
  resetTimeString: string;
}

/**
 * A Claude Code subscription profile for multi-account support.
 * Profiles store OAuth tokens for instant switching without browser re-auth.
 */
export interface ClaudeProfile {
  id: string;
  name: string;
  /**
   * OAuth token (sk-ant-oat01-...) for this profile.
   * When set, CLAUDE_CODE_OAUTH_TOKEN env var is used instead of config dir.
   * Token is valid for 1 year from creation.
   */
  oauthToken?: string;
  /** Email address associated with this profile (for display) */
  email?: string;
  /** When the OAuth token was created (for expiry tracking - 1 year validity) */
  tokenCreatedAt?: Date;
  /**
   * Path to the Claude config directory (e.g., ~/.claude or ~/.claude-profiles/work)
   * @deprecated Use oauthToken instead for reliable multi-profile switching
   */
  configDir?: string;
  /** Whether this is the default profile (uses ~/.claude) */
  isDefault: boolean;
  /** Optional description/notes for this profile */
  description?: string;
  /** When the profile was created */
  createdAt: Date;
  /** Last time this profile was used */
  lastUsedAt?: Date;
  /** Current usage data from /usage command */
  usage?: ClaudeUsageData;
  /** Recent rate limit events for this profile */
  rateLimitEvents?: ClaudeRateLimitEvent[];
  /**
   * Whether this profile has valid authentication.
   * Computed server-side and not persisted as a source of truth.
   */
  isAuthenticated?: boolean;
  /** Subscription type from credentials (e.g. "max") */
  subscriptionType?: string;
  /** Rate limit tier from credentials */
  rateLimitTier?: string;
}

/**
 * Settings for Claude profile management
 */
export interface ClaudeProfileSettings {
  /** All configured Claude profiles */
  profiles: ClaudeProfile[];
  /** ID of the currently active profile */
  activeProfileId: string;
  /** Auto-switch settings */
  autoSwitch?: ClaudeAutoSwitchSettings;
}

/**
 * Settings for automatic profile switching
 */
export interface ClaudeAutoSwitchSettings {
  /** Master toggle - enables all auto-switch features */
  enabled: boolean;

  // Proactive monitoring settings
  /** Enable proactive monitoring and swapping before hitting limits */
  proactiveSwapEnabled: boolean;
  /** Interval (ms) to check usage (default: 30000 = 30s, 0 = disabled) */
  usageCheckInterval: number;

  // Threshold settings
  /** Session usage threshold (0-100) to trigger proactive switch (default: 95) */
  sessionThreshold: number;
  /** Weekly usage threshold (0-100) to trigger proactive switch (default: 99) */
  weeklyThreshold: number;

  // Reactive recovery
  /** Whether to automatically switch on unexpected rate limit (vs. prompting user) */
  autoSwitchOnRateLimit: boolean;
  /** Whether to automatically switch on authentication failure (vs. prompting user) */
  autoSwitchOnAuthFailure: boolean;
}

export interface ClaudeAuthResult {
  success: boolean;
  authenticated: boolean;
  error?: string;
}

/**
 * Payload for TERMINAL_PROFILE_CHANGED event.
 */
export interface TerminalProfileChangedEvent {
  previousProfileId: string;
  newProfileId: string;
  terminals: Array<{
    id: string;
    sessionId?: string;
    sessionMigrated?: boolean;
    /** Whether the terminal was in Claude mode (had an active Claude session) */
    isClaudeMode?: boolean;
    /** Whether Claude was invoked with --dangerously-skip-permissions (YOLO mode) */
    dangerouslySkipPermissions?: boolean;
  }>;
}

/**
 * Reason for profile assignment to a task.
 */
export type ProfileAssignmentReason = 'proactive' | 'reactive' | 'manual';

/**
 * Running tasks grouped by profile.
 */
export interface RunningTasksByProfile {
  byProfile: Record<string, string[]>;
  totalRunning: number;
}

/**
 * Profile swap record for routing history.
 */
export interface ProfileSwapRecord {
  fromProfileId: string;
  fromProfileName: string;
  toProfileId: string;
  toProfileName: string;
  swappedAt: string;
  reason: 'capacity' | 'rate_limit' | 'manual' | 'recovery';
  sessionId?: string;
  sessionResumed: boolean;
}
