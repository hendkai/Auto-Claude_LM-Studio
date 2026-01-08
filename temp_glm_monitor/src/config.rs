//! Configuration module
//! Handles loading configuration from environment variables and config file

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const CONFIG_FILE_NAME: &str = "config.toml";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFile {
    #[serde(default)]
    pub api: ApiSection,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ApiSection {
    pub base_url: Option<String>,
    pub auth_token: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub base_url: String,
    pub auth_token: String,
    pub refresh_sec: u64,
    pub http_timeout_sec: u64,
}

impl Config {
    /// Load configuration from config file and environment variables
    /// Environment variables take precedence over config file values
    pub fn load() -> Result<Self> {
        // Try to load config file
        let config_dir = dirs::config_dir()
            .context("Failed to get config directory")?
            .join("glm-usage-monitor");

        let config_path = config_dir.join(CONFIG_FILE_NAME);

        let file_config: Option<ConfigFile> = if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)
                .with_context(|| format!("Failed to read config file: {:?}", config_path))?;
            Some(toml::from_str(&content)
                .with_context(|| format!("Failed to parse config file: {:?}", config_path))?)
        } else {
            None
        };

        // Get values from ENV or config file (ENV takes precedence)
        const DEFAULT_BASE_URL: &str = "https://api.z.ai/api/anthropic";

        let base_url = get_env_or_file(
            "ANTHROPIC_BASE_URL",
            file_config.as_ref().and_then(|c| c.api.base_url.as_ref()),
            "ANTHROPIC_BASE_URL or api.base_url in config file",
            Some(DEFAULT_BASE_URL),
        )?;

        let auth_token = get_env_or_file(
            "ANTHROPIC_AUTH_TOKEN",
            file_config.as_ref().and_then(|c| c.api.auth_token.as_ref()),
            "ANTHROPIC_AUTH_TOKEN or api.auth_token in config file",
            None,
        )?;

        let refresh_sec: u64 = std::env::var("REFRESH_SEC")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(60); // default 1 minute

        let http_timeout_sec: u64 = std::env::var("HTTP_TIMEOUT_SEC")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(20); // default 20 seconds

        Ok(Config {
            base_url,
            auth_token,
            refresh_sec,
            http_timeout_sec,
        })
    }

    /// Get the domain from base_url
    pub fn domain(&self) -> Result<String> {
        let parsed = url::Url::parse(&self.base_url)
            .context("Failed to parse ANTHROPIC_BASE_URL")?;
        let host = parsed.host_str().unwrap_or("unknown");
        let port = parsed.port();
        let authority = if let Some(port) = port {
            format!("{}:{}", host, port)
        } else {
            host.to_string()
        };
        Ok(format!("{}://{}", parsed.scheme(), authority))
    }

    /// Detect platform based on base_url
    pub fn platform(&self) -> Platform {
        if self.base_url.contains("api.z.ai") {
            Platform::Zai
        } else if self.base_url.contains("open.bigmodel.cn") || self.base_url.contains("dev.bigmodel.cn") {
            Platform::Zhipu
        } else {
            Platform::Unknown
        }
    }

    /// Get API endpoints based on platform
    pub fn endpoints(&self) -> Result<Endpoints> {
        let domain = self.domain()?;
        Ok(Endpoints {
            quota_limit_url: format!("{}/api/monitor/usage/quota/limit", domain),
            domain,
        })
    }
}

fn get_env_or_file(env_key: &str, file_value: Option<&String>, description: &str, default: Option<&str>) -> Result<String> {
    let value = std::env::var(env_key).ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| file_value.map(|s| s.trim().to_string()))
        .filter(|v| !v.is_empty())
        .or_else(|| default.map(|s| s.to_string()))
        .with_context(|| format!("{} is not set", description))?;

    Ok(value)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Zai,
    Zhipu,
    Unknown,
}

impl std::fmt::Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Platform::Zai => write!(f, "ZAI"),
            Platform::Zhipu => write!(f, "ZHIPU"),
            Platform::Unknown => write!(f, "UNKNOWN"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Endpoints {
    pub quota_limit_url: String,
    pub domain: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_detection() {
        let config = Config {
            base_url: "https://api.z.ai/api/anthropic".to_string(),
            auth_token: "test".to_string(),
            refresh_sec: 300,
            http_timeout_sec: 20,
        };
        assert_eq!(config.platform(), Platform::Zai);

        let config = Config {
            base_url: "https://open.bigmodel.cn/api/anthropic".to_string(),
            auth_token: "test".to_string(),
            refresh_sec: 300,
            http_timeout_sec: 20,
        };
        assert_eq!(config.platform(), Platform::Zhipu);
    }
}
