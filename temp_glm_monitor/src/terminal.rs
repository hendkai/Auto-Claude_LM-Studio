//! Terminal management and event loop

use anyhow::Result;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io::{self, Stdout};
use std::time::Duration;

use crate::app::App;
use crate::ui::render;

/// Run the TUI application
pub async fn run(app: &mut App, tick_rate: Duration) -> Result<()> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Run the application
    let result = run_app(&mut terminal, app, tick_rate).await;

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    result
}

/// Main application loop
async fn run_app(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &mut App,
    tick_rate: Duration,
) -> Result<()> {
    let mut last_tick = std::time::Instant::now();

    loop {
        // Render UI
        terminal.draw(|frame| render(frame, app))?;

        // Calculate timeout for event polling
        let timeout = tick_rate.saturating_sub(last_tick.elapsed());

        // Wait for event or timeout
        if event::poll(timeout)? {
            if let event::Event::Key(key) = event::read()? {
                app.handle_key_event(key);

                if app.state.should_quit {
                    return Ok(());
                }
            }
        } else {
            // Timeout - tick the application
            last_tick = std::time::Instant::now();
            app.tick().await;

            if app.state.should_quit {
                return Ok(());
            }
        }
    }
}
