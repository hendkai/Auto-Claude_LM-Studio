#!/usr/bin/env python3
"""
Tests for external CLI adapter environment handling.
"""

import os
from pathlib import Path

from core.external_cli_client import ExternalCLIClient


def test_build_env_augments_path_for_codex_node_runtime(monkeypatch, tmp_path):
    """Codex should get an augmented PATH that includes Node runtime locations."""
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    monkeypatch.setattr(
        "core.external_cli_client.get_binary_directories",
        lambda: {"user": ["/Users/test/.local/bin"], "system": ["/opt/homebrew/bin"]},
    )
    monkeypatch.setattr(
        "core.external_cli_client.find_executable",
        lambda name: "/opt/homebrew/bin/node" if name == "node" else None,
    )

    client = ExternalCLIClient(
        cli_tool="codex",
        cli_path="/opt/homebrew/bin/codex",
        project_dir=Path(tmp_path),
    )

    env = client._build_env()
    path_entries = env.get("PATH", "").split(os.pathsep)

    assert "/opt/homebrew/bin" in path_entries
    assert "/usr/bin" in path_entries


def test_build_env_includes_cli_directory_when_node_not_found(monkeypatch, tmp_path):
    """CLI directory should still be added even when node lookup fails."""
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    monkeypatch.setattr(
        "core.external_cli_client.get_binary_directories",
        lambda: {"user": [], "system": []},
    )
    monkeypatch.setattr("core.external_cli_client.find_executable", lambda _name: None)

    cli_dir = Path(tmp_path) / "bin"
    cli_dir.mkdir(parents=True, exist_ok=True)

    client = ExternalCLIClient(
        cli_tool="codex",
        cli_path=str(cli_dir / "codex"),
        project_dir=Path(tmp_path),
    )

    env = client._build_env()
    path_entries = env.get("PATH", "").split(os.pathsep)

    assert str(cli_dir) in path_entries


def test_format_error_adds_node_path_hint_for_exit_127(tmp_path):
    """Node lookup failures should include a user-facing hint."""
    client = ExternalCLIClient(
        cli_tool="codex",
        cli_path="/opt/homebrew/bin/codex",
        project_dir=Path(tmp_path),
    )

    message = client._format_error(127, "env: node: No such file or directory", "")

    assert "External CLI 'codex' failed with exit code 127" in message
    assert "Node.js was not found in PATH" in message
