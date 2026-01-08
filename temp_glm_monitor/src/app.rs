//! Application state and logic

use crate::api::GlmApiClient;
use crate::config::{Config, Platform};
use crate::models::AppState;
use crossterm::event::{KeyCode, KeyEvent};

/// Main application struct
pub struct App {
    pub config: Config,
    pub api_client: GlmApiClient,
    pub state: AppState,
    pub platform: Platform,
}

impl App {
    /// Create a new application instance
    pub fn new(config: Config) -> anyhow::Result<Self> {
        let endpoints = config.endpoints()?;
        let api_client = GlmApiClient::new(
            config.auth_token.clone(),
            endpoints,
            config.http_timeout_sec,
        );

        let platform = config.platform();
        let refresh_interval = std::time::Duration::from_secs(config.refresh_sec);

        Ok(Self {
            config,
            api_client,
            state: AppState::new(refresh_interval),
            platform,
        })
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Char('q') | KeyCode::Char('Q') => {
                self.state.should_quit = true;
            }
            KeyCode::Char('r') | KeyCode::Char('R') => {
                self.state.force_refresh();
            }
            _ => {}
        }
    }

    /// Check if it's time to refresh data and do so if needed
    pub async fn tick(&mut self) {
        if self.state.should_refresh_now() {
            self.refresh_data().await;
        }
    }

    /// Refresh data from API
    pub async fn refresh_data(&mut self) {
        match self.api_client.fetch_quota_limit().await {
            Ok(data) => {
                self.state.update_quota(data);
            }
            Err(e) => {
                self.state.set_error(format!("{}", e));
            }
        }
    }

    /// Get domain string
    pub fn domain(&self) -> String {
        self.config.endpoints()
            .map(|e| e.domain)
            .unwrap_or_else(|_| "unknown".to_string())
    }

    /// Get refresh interval string
    pub fn refresh_interval_str(&self) -> String {
        format!("{}s", self.config.refresh_sec)
    }

    /// Get timeout string
    pub fn timeout_str(&self) -> String {
        format!("{}s", self.config.http_timeout_sec)
    }

    /// Get current quota data
    pub fn get_quota(&self) -> Option<&crate::models::QuotaLimitResponse> {
        self.state.quota_data.as_ref()
    }

    /// Get last error message
    pub fn get_last_error(&self) -> Option<String> {
        self.state.last_error.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_creation() {
        // Test with mock config
        let config = Config {
            base_url: "https://api.z.ai/api/anthropic".to_string(),
            auth_token: "test-token".to_string(),
            refresh_sec: 300,
            http_timeout_sec: 20,
        };

        let app = App::new(config);
        assert!(app.is_ok());

        let app = app.unwrap();
        assert_eq!(app.platform, Platform::Zai);
        assert!(!app.state.should_quit);
    }
}
