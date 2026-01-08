//! API client for GLM monitoring endpoints

use anyhow::{Context, Result};
use reqwest::Client;
use std::time::Duration;

use crate::config::Endpoints;
use crate::models::QuotaLimitResponse;

/// HTTP client for GLM API
pub struct GlmApiClient {
    client: Client,
    auth_token: String,
    endpoints: Endpoints,
}

impl GlmApiClient {
    /// Create a new API client
    pub fn new(auth_token: String, endpoints: Endpoints, timeout_sec: u64) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_sec))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            auth_token,
            endpoints,
        }
    }

    /// Fetch quota limit data
    pub async fn fetch_quota_limit(&self) -> Result<QuotaLimitResponse> {
        let url = &self.endpoints.quota_limit_url;

        let response = self
            .client
            .get(url)
            .header("Authorization", &self.auth_token)
            .header("Accept-Language", "en-US,en")
            .header("Content-Type", "application/json")
            .send()
            .await
            .context("Failed to send request to quota limit endpoint")?;

        let status = response.status();
        let body = response
            .text()
            .await
            .context("Failed to read response body")?;

        if !status.is_success() {
            anyhow::bail!(
                "HTTP {}: Failed to fetch quota limit\nURL: {}\nResponse: {}",
                status.as_u16(),
                url,
                body
            );
        }

        // Try to parse as ApiResponse wrapper first
        if let Ok(wrapper) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(data) = wrapper.get("data") {
                let quota: QuotaLimitResponse = serde_json::from_value(data.clone())
                    .context("Failed to parse quota limit data")?;
                return Ok(quota);
            }
        }

        // Try direct parsing
        let quota: QuotaLimitResponse = serde_json::from_str(&body)
            .context("Failed to parse quota limit response")?;
        Ok(quota)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require a real API endpoint and token
    // They are marked as ignore by default

    #[test]
    #[ignore]
    async fn test_fetch_quota_limit() {
        // This test requires valid credentials
        let auth_token = std::env::var("ANTHROPIC_AUTH_TOKEN")
            .expect("ANTHROPIC_AUTH_TOKEN must be set for this test");
        let base_url = std::env::var("ANTHROPIC_BASE_URL")
            .unwrap_or_else(|_| "https://api.z.ai/api/anthropic".to_string());

        let parsed = url::Url::parse(&base_url).unwrap();
        let domain = format!("{}://{}", parsed.scheme(), parsed.netloc());

        let endpoints = Endpoints {
            quota_limit_url: format!("{}/api/monitor/usage/quota/limit", domain),
            domain,
        };

        let client = GlmApiClient::new(auth_token, endpoints, 20);
        let quota = client.fetch_quota_limit().await.unwrap();

        println!("Quota limits: {:#?}", quota.limits);
    }
}
