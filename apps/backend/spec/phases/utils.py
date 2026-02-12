"""
Phase Execution Utilities
==========================

Helper functions for phase execution.
"""

import subprocess
import sys
from pathlib import Path

from phase_config import (
    PHASE_PROVIDER_CLI_KIND,
    PHASE_PROVIDER_CLI_PATH_KEY,
    PHASE_PROVIDER_CLI_TOOL_KEY,
    PHASE_PROVIDER_KIND_KEY,
)


def _build_script_env() -> dict[str, str]:
    """Build env for subprocess script execution.

    Some scripts expect Claude CLI protocol and fail if CLAUDE_CLI_PATH points
    to external CLIs such as codex/kimi.
    """
    import os

    env = os.environ.copy()
    provider_kind = env.get(PHASE_PROVIDER_KIND_KEY, "").strip().lower()
    provider_tool = env.get(PHASE_PROVIDER_CLI_TOOL_KEY, "").strip().lower()
    if provider_kind == PHASE_PROVIDER_CLI_KIND and provider_tool not in {
        "",
        "claude-code",
    }:
        env.pop(PHASE_PROVIDER_CLI_PATH_KEY, None)
    return env


def run_script(project_dir: Path, script: str, args: list[str]) -> tuple[bool, str]:
    """
    Run a Python script and return (success, output).

    Args:
        project_dir: Project root directory
        script: Name of the script to run
        args: Command-line arguments for the script

    Returns:
        Tuple of (success: bool, output: str)
    """
    script_path = project_dir / ".auto-claude" / script

    if not script_path.exists():
        return False, f"Script not found: {script_path}"

    cmd = [sys.executable, str(script_path)] + args

    try:
        result = subprocess.run(
            cmd,
            cwd=project_dir,
            env=_build_script_env(),
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode == 0:
            return True, result.stdout
        else:
            return False, result.stderr or result.stdout

    except subprocess.TimeoutExpired:
        return False, "Script timed out"
    except Exception as e:
        return False, str(e)
