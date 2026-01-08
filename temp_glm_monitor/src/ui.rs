//! UI rendering with ratatui

use ratatui::{
    layout::{Alignment, Constraint, Layout, Rect},
    style::{Color, Style, Stylize},
    text::{Line, Span},
    widgets::{Block, Padding, Paragraph, Wrap},
    Frame,
};

use crate::app::App;
use crate::models::Format;

/// Color palette for the UI
pub struct Palette;

impl Palette {
    pub const TITLE: Color = Color::Yellow;
    pub const BORDER: Color = Color::Blue;
    pub const HIGHLIGHT: Color = Color::Green;
    pub const WARNING: Color = Color::Yellow;
    pub const ERROR: Color = Color::Red;
    pub const INFO: Color = Color::Blue;
    pub const MUTED: Color = Color::DarkGray;
}

/// Render the main UI
pub fn render(frame: &mut Frame, app: &App) {
    let size = frame.area();

    // Ensure we have enough space
    if size.height < 10 || size.width < 40 {
        render_too_small(frame, size);
        return;
    }

    // Main layout
    let chunks = Layout::vertical([
        Constraint::Length(4), // Header
        Constraint::Min(0),    // Main content
        Constraint::Length(3), // Footer
    ])
    .split(size);

    render_header(frame, app, chunks[0]);
    render_main_content(frame, app, chunks[1]);
    render_footer(frame, app, chunks[2]);
}

/// Render header section
fn render_header(frame: &mut Frame, app: &App, area: Rect) {
    let header_lines = vec![
        Line::from(vec![
            Span::styled("GLM Usage Monitor", Style::default().fg(Palette::TITLE).bold()),
            Span::raw(" | "),
            Span::styled(format!("{}", app.platform), Style::default().fg(Palette::INFO)),
            Span::raw(" | "),
            Span::styled(app.domain(), Style::default().fg(Palette::MUTED)),
        ]),
        Line::from(vec![
            Span::styled("Refresh: ", Style::default().fg(Palette::MUTED)),
            Span::styled(
                app.refresh_interval_str(),
                Style::default().fg(Palette::HIGHLIGHT),
            ),
            Span::raw(" | "),
            Span::styled("Timeout: ", Style::default().fg(Palette::MUTED)),
            Span::styled(app.timeout_str(), Style::default().fg(Palette::HIGHLIGHT)),
        ]),
        Line::from(vec![
            Span::styled("Last update: ", Style::default().fg(Palette::MUTED)),
            match app.state.last_update {
                Some(dt) => Span::styled(
                    dt.format("%Y-%m-%d %H:%M:%S").to_string(),
                    Style::default().fg(Palette::INFO),
                ),
                None => Span::styled("Never", Style::default().fg(Palette::MUTED)),
            },
            Span::raw(" | "),
            Span::styled("Next refresh in: ", Style::default().fg(Palette::MUTED)),
            Span::styled(
                format!("{}s", app.state.seconds_until_refresh()),
                Style::default().fg(Palette::HIGHLIGHT),
            ),
        ]),
    ];

    let header = Paragraph::new(header_lines)
        .block(
            Block::bordered()
                .title(" Header ")
                .title_style(Style::default().fg(Palette::TITLE).bold())
                .title_alignment(Alignment::Center)
                .border_style(Style::default().fg(Palette::BORDER)),
        )
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(header, area);
}

/// Render main content area
fn render_main_content(frame: &mut Frame, app: &App, area: Rect) {
    if app.state.is_loading {
        render_loading(frame, area);
        return;
    }

    if let Some(ref error) = app.state.last_error {
        render_error(frame, error, area);
        return;
    }

    let quota_data = match &app.state.quota_data {
        Some(data) => data,
        None => {
            render_no_data(frame, area);
            return;
        }
    };

    render_quota_limits(frame, quota_data, area);
}

/// Render quota limits section
fn render_quota_limits(frame: &mut Frame, quota_data: &crate::models::QuotaLimitResponse, area: Rect) {
    let block = Block::bordered()
        .title(" Quota Limits ")
        .title_style(Style::default().fg(Palette::TITLE).bold())
        .border_style(Style::default().fg(Palette::BORDER))
        .padding(Padding::uniform(1));

    let inner_area = block.inner(area);
    frame.render_widget(block, area);

    // Calculate vertical chunks for each limit
    let limits_count = quota_data.limits.len().max(1);
    let chunk_height = inner_area.height / limits_count as u16;

    let chunks = Layout::vertical(
        std::iter::repeat(Constraint::Length(chunk_height))
            .take(limits_count)
            .collect::<Vec<_>>(),
    )
    .split(inner_area);

    for (i, limit) in quota_data.limits.iter().enumerate() {
        if i >= chunks.len() {
            break;
        }

        render_limit_item(frame, limit, chunks[i]);
    }
}

/// Render a single limit item
fn render_limit_item(frame: &mut Frame, limit: &crate::models::Limit, area: Rect) {
    let lines = Format::format_limit(limit);

    // Color code based on percentage
    let percentage = limit.percentage.unwrap_or(0.0);
    let status_color = if percentage >= 90.0 {
        Palette::ERROR
    } else if percentage >= 70.0 {
        Palette::WARNING
    } else {
        Palette::HIGHLIGHT
    };

    let styled_lines: Vec<Line> = lines
        .iter()
        .enumerate()
        .map(|(idx, line)| {
            if idx == 0 {
                Line::styled(line.clone(), Style::default().fg(status_color).bold())
            } else {
                Line::styled(line.clone(), Style::default().fg(Color::Reset))
            }
        })
        .collect();

    let paragraph = Paragraph::new(styled_lines)
        .wrap(Wrap { trim: true });

    frame.render_widget(paragraph, area);
}

/// Render loading state
fn render_loading(frame: &mut Frame, area: Rect) {
    let loading_text = vec![
        Line::from(vec![
            Span::styled("Loading", Style::default().fg(Palette::INFO).bold()),
            Span::styled("...", Style::default().fg(Palette::MUTED)),
        ]),
        Line::from(""),
        Line::from("Fetching quota limits from API..."),
    ];

    let paragraph = Paragraph::new(loading_text)
        .block(
            Block::bordered()
                .title(" Status ")
                .title_style(Style::default().fg(Palette::TITLE).bold())
                .border_style(Style::default().fg(Palette::BORDER)),
        )
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(paragraph, area);
}

/// Render error state
fn render_error(frame: &mut Frame, error: &str, area: Rect) {
    let error_lines = vec![
        Line::from(vec![
            Span::styled("ERROR", Style::default().fg(Palette::ERROR).bold()),
            Span::raw(": Failed to fetch data"),
        ]),
        Line::from(""),
        Line::styled(
            error,
            Style::default().fg(Palette::ERROR),
        ),
        Line::from(""),
        Line::from(vec![
            Span::styled("Press ", Style::default().fg(Palette::MUTED)),
            Span::styled("r", Style::default().fg(Palette::HIGHLIGHT).bold()),
            Span::styled(" to retry", Style::default().fg(Palette::MUTED)),
        ]),
    ];

    let paragraph = Paragraph::new(error_lines)
        .block(
            Block::bordered()
                .title(" Error ")
                .title_style(Style::default().fg(Palette::ERROR).bold())
                .border_style(Style::default().fg(Palette::ERROR)),
        )
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(paragraph, area);
}

/// Render no data state
fn render_no_data(frame: &mut Frame, area: Rect) {
    let text = vec![
        Line::from("No data available"),
        Line::from(""),
        Line::from("Waiting for initial data load..."),
    ];

    let paragraph = Paragraph::new(text)
        .block(
            Block::bordered()
                .title(" Status ")
                .title_style(Style::default().fg(Palette::TITLE).bold())
                .border_style(Style::default().fg(Palette::BORDER)),
        )
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(paragraph, area);
}

/// Render footer with key hints
fn render_footer(frame: &mut Frame, app: &App, area: Rect) {
    let footer_text = vec![
        Line::from(vec![
            Span::styled("Keys: ", Style::default().fg(Palette::MUTED)),
            Span::styled("r", Style::default().fg(Palette::HIGHLIGHT).bold()),
            Span::styled("=refresh now ", Style::default().fg(Palette::MUTED)),
            Span::styled("q", Style::default().fg(Palette::HIGHLIGHT).bold()),
            Span::styled("=quit", Style::default().fg(Palette::MUTED)),
        ]),
        Line::from(vec![
            Span::styled("Status: ", Style::default().fg(Palette::MUTED)),
            if app.state.is_loading {
                Span::styled("Loading...", Style::default().fg(Palette::INFO))
            } else if app.state.last_error.is_some() {
                Span::styled("Error", Style::default().fg(Palette::ERROR))
            } else if app.state.quota_data.is_some() {
                Span::styled("Connected", Style::default().fg(Palette::HIGHLIGHT))
            } else {
                Span::styled("Waiting", Style::default().fg(Palette::MUTED))
            },
        ]),
    ];

    let footer = Paragraph::new(footer_text)
        .block(
            Block::bordered()
                .border_style(Style::default().fg(Palette::BORDER)),
        )
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(footer, area);
}

/// Render "terminal too small" message
fn render_too_small(frame: &mut Frame, area: Rect) {
    let text = vec![
        Line::from(vec![
            Span::styled("ERROR", Style::default().fg(Palette::ERROR).bold()),
            Span::raw(": Terminal too small"),
        ]),
        Line::from(""),
        Line::from("Please resize your terminal to at least 40x10"),
    ];

    let paragraph = Paragraph::new(text)
        .alignment(Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(paragraph, area);
}
