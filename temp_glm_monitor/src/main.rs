//! GLM Usage Monitor - Realtime GLM Coding Plan usage monitor with TUI

#![allow(clippy::doc_markdown)]

mod app;
mod api;
mod config;
mod models;
mod terminal;
mod ui;

use anyhow::{Context, Result};
use clap::Parser;
use std::time::Duration;

/// GLM Usage Monitor - Realtime GLM Coding Plan usage monitor with TUI
#[derive(Debug, Parser)]
struct Cli {
    /// Override refresh interval in seconds (default: from ENV or 300)
    #[arg(short, long)]
    refresh_sec: Option<u64>,

    /// Override HTTP timeout in seconds (default: from ENV or 20)
    #[arg(short, long)]
    timeout_sec: Option<u64>,

    /// Tick rate for the UI in milliseconds (default: 250)
    #[arg(long, default_value_t = 250)]
    tick_rate: u64,

    /// Output in Waybar-compatible JSON format
    #[arg(long)]
    waybar: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Load configuration
    let mut config = config::Config::load()
        .context("Failed to load configuration. Please ensure ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN are set, or create a config file at ~/.config/glm-usage-monitor/config.toml")?;

    // Apply CLI overrides
    if let Some(refresh) = cli.refresh_sec {
        config.refresh_sec = refresh;
    }
    if let Some(timeout) = cli.timeout_sec {
        config.http_timeout_sec = timeout;
    }

    // Create application
    let mut app = app::App::new(config)
        .context("Failed to initialize application")?;

    // Run initial data fetch
    app.refresh_data().await;

    // Handle Waybar output
    if cli.waybar {
        if let Some(quota) = app.get_quota() {
            let mut tooltip = String::new();
            let mut text = String::new();
            let mut class = "normal";

            // Find the most critical limit (highest percentage)
            let mut max_pct = 0.0;

            for limit in &quota.limits {
                // Add to tooltip
                let lines = crate::models::Format::format_limit(limit);
                for line in lines {
                    tooltip.push_str(&line);
                    tooltip.push('\n');
                }
                tooltip.push('\n');

                if let Some(pct) = limit.percentage {
                    if pct > max_pct {
                        max_pct = pct;
                        // Use this limit for the main text
                        text = format!("{}: {:.0}%", limit.limit_type, pct);
                    }
                }
            }

            if text.is_empty() {
                text = "GLM: N/A".to_string();
            }

            // Set class based on usage
            if max_pct > 90.0 {
                class = "critical";
            } else if max_pct > 75.0 {
                class = "warning";
            }

            let output = serde_json::json!({
                "text": text,
                "tooltip": tooltip.trim(),
                "class": class,
                "percentage": max_pct as i64
            });

            println!("{}", output);
        } else {
            let error = app.get_last_error().unwrap_or("No data".to_string());
            let output = serde_json::json!({
                "text": "GLM: Err",
                "tooltip": error,
                "class": "critical"
            });
            println!("{}", output);
        }
        return Ok(());
    }

    // Run TUI
    let tick_rate = Duration::from_millis(cli.tick_rate);
    terminal::run(&mut app, tick_rate)
        .await
        .context("Failed to run TUI")?;

    Ok(())
}
