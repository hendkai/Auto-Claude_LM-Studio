//! Data models for API responses

use serde::{Deserialize, Serialize};

/// Quota limit response
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct QuotaLimitResponse {
    pub limits: Vec<Limit>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Limit {
    #[serde(rename = "type")]
    pub limit_type: String,

    pub usage: Option<i64>,
    #[serde(rename = "currentValue")]
    pub current_value: Option<i64>,
    pub remaining: Option<i64>,
    pub percentage: Option<f64>,

    pub unit: Option<i64>,
    pub number: Option<i32>,

    #[serde(rename = "usageDetails", default)]
    pub usage_details: Vec<UsageDetail>,

    #[serde(rename = "nextResetTime", default)]
    pub next_reset_time: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UsageDetail {
    #[serde(rename = "modelCode")]
    pub model_code: Option<String>,
    pub usage: Option<i64>,
}

/// Application state for TUI
#[derive(Debug, Clone)]
pub struct AppState {
    pub quota_data: Option<QuotaLimitResponse>,
    pub last_update: Option<chrono::DateTime<chrono::Local>>,
    pub last_error: Option<String>,
    pub next_refresh: std::time::Instant,
    pub refresh_interval: std::time::Duration,
    pub is_loading: bool,
    pub should_quit: bool,
}

impl AppState {
    pub fn new(refresh_interval: std::time::Duration) -> Self {
        Self {
            quota_data: None,
            last_update: None,
            last_error: None,
            next_refresh: std::time::Instant::now(),
            refresh_interval,
            is_loading: true,
            should_quit: false,
        }
    }

    pub fn update_quota(&mut self, data: QuotaLimitResponse) {
        self.quota_data = Some(data);
        self.last_update = Some(chrono::Local::now());
        self.last_error = None;
        self.is_loading = false;
        self.next_refresh = std::time::Instant::now() + self.refresh_interval;
    }

    pub fn set_error(&mut self, error: String) {
        self.last_error = Some(error);
        self.is_loading = false;
        self.next_refresh = std::time::Instant::now() + self.refresh_interval;
    }

    pub fn seconds_until_refresh(&self) -> i64 {
        let duration = self.next_refresh.saturating_duration_since(std::time::Instant::now());
        duration.as_secs() as i64
    }

    pub fn should_refresh_now(&self) -> bool {
        std::time::Instant::now() >= self.next_refresh
    }

    pub fn force_refresh(&mut self) {
        self.next_refresh = std::time::Instant::now();
        self.is_loading = true;
    }
}

/// Format helpers
pub struct Format;

impl Format {
    /// Format integer with thousands separator
    pub fn format_int(val: Option<i64>) -> String {
        match val {
            Some(v) => {
                let s = v.to_string();
                let mut result = String::new();
                let chars = s.chars().rev().enumerate();
                for (i, c) in chars {
                    if i > 0 && i % 3 == 0 {
                        result.push(' ');
                    }
                    result.push(c);
                }
                result.chars().rev().collect()
            }
            None => "N/A".to_string(),
        }
    }

    /// Create a progress bar string
    pub fn progress_bar(percentage: Option<f64>, width: usize) -> String {
        let pct = percentage.unwrap_or(0.0).clamp(0.0, 100.0);
        let filled = (pct / 100.0 * width as f64).round() as usize;
        let filled = filled.clamp(0, width);
        let empty = width - filled;

        format!(
            "[{}{}] {:.0}%",
            "█".repeat(filled),
            "░".repeat(empty),
            pct
        )
    }

    /// Format a limit entry for display
    pub fn format_limit(limit: &Limit) -> Vec<String> {
        let mut lines = vec![];

        let typ = &limit.limit_type;
        let cur = Self::format_int(limit.current_value);
        let usage = Self::format_int(limit.usage);
        let rem = Self::format_int(limit.remaining);
        let bar = Self::progress_bar(limit.percentage, 20);
        let num = limit.number.map(|n| n.to_string()).unwrap_or_else(|| "N/A".to_string());

        lines.push(format!(
            "{}: {}/{} {} ({})",
            typ, cur, usage, bar, num
        ));
        lines.push(format!("    Remaining: {}", rem));

        // Add reset time if present
        if let Some(reset_ms) = limit.next_reset_time {
            if let Ok(reset_time) = Self::format_reset_time(reset_ms) {
                lines.push(format!("    {}", reset_time));
            }
        }

        // Add usage details if present
        if !limit.usage_details.is_empty() {
            lines.push(format!("    Details:"));
            for detail in &limit.usage_details {
                let model = detail.model_code.as_deref().unwrap_or("unknown");
                let usage = Self::format_int(detail.usage);
                lines.push(format!("      - {}: {}", model, usage));
            }
        }

        lines
    }

    /// Format reset time from milliseconds timestamp
    fn format_reset_time(ms: i64) -> Result<String, String> {
        use chrono::{TimeZone, Utc};

        // Convert milliseconds to seconds
        let timestamp_secs = ms / 1000;

        // Parse as UTC then convert to local time
        if let Some(dt) = Utc.timestamp_opt(timestamp_secs, 0).single() {
            let local_dt = dt.with_timezone(&chrono::Local);
            let now = chrono::Local::now();

            let duration = if local_dt > now {
                let secs = (local_dt - now).num_seconds();
                if secs < 60 {
                    format!("in {}s", secs)
                } else if secs < 3600 {
                    format!("in {}m {}s", secs / 60, secs % 60)
                } else {
                    let hours = secs / 3600;
                    let minutes = (secs % 3600) / 60;
                    format!("in {}h {}m", hours, minutes)
                }
            } else {
                "passed".to_string()
            };

            Ok(format!("Resets: {} ({})", local_dt.format("%H:%M:%S"), duration))
        } else {
            Err("Invalid timestamp".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_int() {
        assert_eq!(Format::format_int(Some(1234567)), "1 234 567");
        assert_eq!(Format::format_int(None), "N/A");
    }

    #[test]
    fn test_progress_bar() {
        assert_eq!(Format::progress_bar(Some(50.0), 10), "[██████████] 50%");
        assert_eq!(Format::progress_bar(Some(0.0), 10), "[] 0%");
        assert_eq!(Format::progress_bar(Some(100.0), 10), "[██████████] 100%");
    }
}
