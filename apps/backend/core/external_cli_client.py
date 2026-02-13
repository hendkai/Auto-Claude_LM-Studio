"""
External CLI Client Adapter
===========================

Adapter for non-Claude CLI tools (e.g. Codex, Kimi) that do not speak the
Claude Agent SDK subprocess protocol.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
from pathlib import Path

from claude_agent_sdk.types import AssistantMessage, TextBlock
from core.platform import find_executable, get_binary_directories

logger = logging.getLogger(__name__)


class ExternalCLIClient:
    """Minimal async client adapter compatible with create_client() callers."""

    def __init__(
        self,
        *,
        cli_tool: str,
        cli_path: str,
        project_dir: Path,
        model: str | None = None,
        env: dict[str, str] | None = None,
    ) -> None:
        self.cli_tool = (cli_tool or "").strip().lower()
        self.cli_path = cli_path
        self.project_dir = Path(project_dir)
        self.model = model.strip() if isinstance(model, str) and model.strip() else None
        self.env = dict(env or {})

        self._response_text = ""
        self._response_emitted = False

    async def __aenter__(self) -> "ExternalCLIClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def query(self, prompt: str) -> None:
        """Execute prompt with the configured external CLI tool."""
        self._response_emitted = False

        if self.cli_tool == "codex":
            self._response_text = await self._run_codex(prompt)
            return

        if self.cli_tool == "kimi-code":
            self._response_text = await self._run_kimi(prompt)
            return

        raise RuntimeError(
            f"Unsupported external CLI tool '{self.cli_tool}'. "
            "Use codex or kimi-code, or configure an API/OAuth provider."
        )

    async def receive_response(self):
        """Yield a synthetic AssistantMessage for compatibility with existing flow."""
        if self._response_emitted:
            return

        self._response_emitted = True
        response_text = self._response_text.strip() or "Task completed."
        yield AssistantMessage(
            content=[TextBlock(text=response_text)],
            model=self.model or self.cli_tool or "external-cli",
        )

    @staticmethod
    def _merge_path_entries(existing_path: str, extra_dirs: list[str]) -> str:
        """Merge path entries while preserving order and removing duplicates."""
        ordered: list[str] = []
        seen: set[str] = set()

        for raw_entry in [*extra_dirs, *existing_path.split(os.pathsep)]:
            entry = raw_entry.strip()
            if not entry or not os.path.isdir(entry):
                continue
            normalized = os.path.normcase(os.path.normpath(entry))
            if normalized in seen:
                continue
            seen.add(normalized)
            ordered.append(entry)

        return os.pathsep.join(ordered)

    def _build_augmented_path(self, current_path: str) -> str:
        """Augment PATH so external CLIs can find their runtime dependencies."""
        extra_dirs: list[str] = []

        cli_dir = str(Path(self.cli_path).expanduser().resolve().parent)
        extra_dirs.append(cli_dir)

        bins = get_binary_directories()
        extra_dirs.extend(bins.get("user", []))
        extra_dirs.extend(bins.get("system", []))

        # Codex/OpenCode CLIs are Node-based and may fail with:
        # `env: node: No such file or directory` when launched from GUI apps
        # with a minimal PATH.
        if self.cli_tool in {"codex", "open-code", "opencode"}:
            node_path = shutil.which("node", path=current_path) or find_executable("node")
            if node_path:
                extra_dirs.insert(
                    0, str(Path(node_path).expanduser().resolve().parent)
                )
            else:
                logger.warning(
                    "Node executable not found while preparing PATH for external CLI '%s'",
                    self.cli_tool,
                )

        merged_path = self._merge_path_entries(current_path, extra_dirs)
        return merged_path or current_path

    def _build_env(self) -> dict[str, str]:
        merged_env = os.environ.copy()
        merged_env.update(self.env)
        current_path = merged_env.get("PATH", "")
        merged_env["PATH"] = self._build_augmented_path(current_path)
        return merged_env

    async def _run_codex(self, prompt: str) -> str:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".txt",
            delete=False,
        ) as handle:
            output_file = Path(handle.name)

        cmd = [
            self.cli_path,
            "exec",
            "--full-auto",
            "--cd",
            str(self.project_dir),
            "--output-last-message",
            str(output_file),
            "-",
        ]
        if self.model:
            cmd.extend(["--model", self.model])

        stdout, stderr, return_code = await self._run_process(cmd, prompt)
        response_text = ""
        try:
            if output_file.exists():
                response_text = output_file.read_text(encoding="utf-8").strip()
        finally:
            output_file.unlink(missing_ok=True)

        if return_code != 0:
            raise RuntimeError(self._format_error(return_code, stderr, stdout))

        if response_text:
            return response_text
        if stdout.strip():
            return stdout.strip()
        return "Codex completed without text output."

    async def _run_kimi(self, prompt: str) -> str:
        cmd = [
            self.cli_path,
            "--print",
            "--input-format",
            "text",
            "--output-format",
            "text",
            "--final-message-only",
            "--work-dir",
            str(self.project_dir),
        ]
        if self.model:
            cmd.extend(["--model", self.model])

        stdout, stderr, return_code = await self._run_process(cmd, prompt)
        if return_code != 0:
            raise RuntimeError(self._format_error(return_code, stderr, stdout))

        if stdout.strip():
            return stdout.strip()
        return "Kimi Code completed without text output."

    async def _run_process(
        self,
        cmd: list[str],
        prompt: str,
    ) -> tuple[str, str, int]:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(self.project_dir),
            env=self._build_env(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout_b, stderr_b = await process.communicate(prompt.encode("utf-8"))
        stdout = stdout_b.decode("utf-8", errors="replace")
        stderr = stderr_b.decode("utf-8", errors="replace")

        logger.debug(
            "External CLI finished",
            extra={
                "cli_tool": self.cli_tool,
                "return_code": process.returncode,
                "stdout_len": len(stdout),
                "stderr_len": len(stderr),
            },
        )

        return stdout, stderr, process.returncode

    def _format_error(self, return_code: int, stderr: str, stdout: str) -> str:
        detail = (stderr or stdout).strip()
        detail_lower = detail.lower()
        if (
            return_code == 127
            and self.cli_tool in {"codex", "open-code", "opencode"}
            and ("env: node: no such file or directory" in detail_lower)
        ):
            detail += (
                "\nHint: Node.js was not found in PATH for the backend process. "
                "Ensure your Node bin directory (for example /opt/homebrew/bin on macOS) "
                "is available to Auto-Claude."
            )
        if len(detail) > 4000:
            detail = detail[:4000] + "\n... (truncated)"
        if not detail:
            detail = "No CLI output captured."
        return (
            f"External CLI '{self.cli_tool}' failed with exit code {return_code}.\n"
            f"{detail}"
        )
