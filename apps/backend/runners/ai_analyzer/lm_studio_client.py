"""
LM Studio / OpenAI-compatible client wrapper for AI analysis.
"""

import json
import os
import glob
import subprocess
import re
from pathlib import Path
from typing import Any, List, Dict, Optional

try:
    from openai import AsyncOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


class LMStudioAnalysisClient:
    """
    Wrapper for OpenAI-compatible SDK (LM Studio) with manual tool execution.
    Auto-Claude relies on specific tools (Read, Glob, Grep) which we implement here.
    """

    # Default to LM Studio local port
    DEFAULT_BASE_URL = "http://localhost:1234/v1"
    DEFAULT_API_KEY = "lm-studio"
    DEFAULT_MODEL = "model-identifier"  # LM Studio often ignores this provided the model is loaded

    def __init__(self, project_dir: Path):
        """
        Initialize LM Studio client.

        Args:
            project_dir: Root directory of project being analyzed
        """
        if not OPENAI_AVAILABLE:
            raise RuntimeError(
                "openai library not available. Install with: pip install openai"
            )

        self.project_dir = project_dir
        # Support both LM_STUDIO_ specific env vars and generic ANTHROPIC_ ones set by the frontend profile system
        self.base_url = os.getenv("LM_STUDIO_BASE_URL", os.getenv("ANTHROPIC_BASE_URL", self.DEFAULT_BASE_URL))
        if self.base_url.endswith("/v1/"):
             self.base_url = self.base_url[:-1]
        elif not self.base_url.endswith("/v1"):
             # Ensure /v1 is present for LM Studio, as OpenAI client expects it for base_url
             # (It appends /chat/completions, so we need http://host:port/v1/chat/completions)
             self.base_url = f"{self.base_url}/v1"
             
        self.api_key = os.getenv("LM_STUDIO_API_KEY", os.getenv("ANTHROPIC_AUTH_TOKEN", self.DEFAULT_API_KEY))
        self.model = os.getenv("LM_STUDIO_MODEL", os.getenv("ANTHROPIC_MODEL", self.DEFAULT_MODEL))

        print(f"DEBUG: LM Studio Client initialized with base_url: {self.base_url}")
        self.client = AsyncOpenAI(base_url=self.base_url, api_key=self.api_key)

    async def run_analysis_query(self, prompt: str) -> str:
        """
        Run a query for analysis using ReAct-style or Tool-use loop.
        Since we need to support generic models in LM Studio, we'll try to use
        standard function calling if supported, or a very robust system prompt + tool parsing.
        
        For broad compatibility with LM Studio models (which might handle function calling differently),
        we will define tools in the API call.
        """
        
        tools = self._get_tool_definitions()
        
        messages = [
            {"role": "system", "content": self._get_system_prompt()},
            {"role": "user", "content": prompt}
        ]

        # Basic Loop for Tool Use
        # We limit turns to avoid infinite loops
        max_turns = 10
        current_turn = 0

        while current_turn < max_turns:
            current_turn += 1
            
            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=tools,
                    tool_choice="auto"
                )
            except Exception as e:
                return f"Error communicating with LM Studio: {str(e)}"
            
            print(f"DEBUG: Full LM Studio Response: {response}")

            if not response or not response.choices:
                return "Error: Received empty response from LM Studio (no choices returned)."
            
            message = response.choices[0].message
            messages.append(message)

            if not message.tool_calls:
                # No more tools, this is the final response
                return message.content or ""

            # Processor Tool Calls
            for tool_call in message.tool_calls:
                function_name = tool_call.function.name
                arguments_str = tool_call.function.arguments
                
                try:
                    arguments = json.loads(arguments_str)
                except json.JSONDecodeError:
                    # Fallback or error
                    tool_output = f"Error: Invalid JSON arguments for {function_name}"
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": function_name,
                        "content": tool_output
                    })
                    continue

                # Execute
                result = await self._execute_tool(function_name, arguments)
                
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": function_name,
                    "content": str(result)
                })

        return messages[-1].content or "Analysis terminated: Max turns reached."

    def _get_system_prompt(self) -> str:
        return (
            f"You are a senior software architect analyzing this codebase. "
            f"Your working directory is: {self.project_dir.resolve()}\n"
            f"You have access to tools to read files, search files, and find files.\n"
            f"Use these tools to analyze the code based on the user's request. "
            f"Output your final analysis as valid JSON only."
        )

    def _get_tool_definitions(self) -> List[Dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "Read",
                    "description": "Read the contents of a file.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "relative_path": {
                                "type": "string",
                                "description": "The relative path to the file to read."
                            }
                        },
                        "required": ["relative_path"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "Glob",
                    "description": "Find files matching a glob pattern.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "pattern": {
                                "type": "string",
                                "description": "The glob pattern to search for (e.g., '**/*.py')."
                            }
                        },
                        "required": ["pattern"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "Grep",
                    "description": "Search for a text pattern in files.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "pattern": {
                                "type": "string",
                                "description": "The regex or text pattern to search for."
                            },
                            "path": {
                                "type": "string",
                                "description": "The path or glob pattern to search in (default '.')."
                            }
                        },
                        "required": ["pattern"]
                    }
                }
            }
        ]

    async def _execute_tool(self, name: str, args: Dict[str, Any]) -> str:
        if name == "Read":
            return self._tool_read(args.get("relative_path"))
        elif name == "Glob":
            return self._tool_glob(args.get("pattern"))
        elif name == "Grep":
            return self._tool_grep(args.get("pattern"), args.get("path", "."))
        else:
            return f"Error: Unknown tool {name}"

    def _tool_read(self, relative_path: str) -> str:
        if not relative_path:
            return "Error: path is required"
        
        try:
            target_path = (self.project_dir / relative_path).resolve()
            # Security check: ensure path is within project dir
            if not str(target_path).startswith(str(self.project_dir.resolve())):
                 return "Error: Access denied (path outside project directory)"
            
            if not target_path.exists():
                return f"Error: File not found: {relative_path}"
                
            if not target_path.is_file():
                return f"Error: Not a file: {relative_path}"

            try:
                return target_path.read_text(encoding='utf-8')
            except UnicodeDecodeError:
                return "Error: File is binary or not UTF-8 encoded"
                
        except Exception as e:
            return f"Error reading file: {str(e)}"

    def _tool_glob(self, pattern: str) -> str:
        if not pattern:
            return "Error: pattern is required"
            
        try:
            # recursively search if ** is in pattern, otherwise just search
            # We need to be careful with globbing in the correct directory
            # glob.glob in python doesn't strictly adhere to .gitignore, 
            # but for this simple client it should suffice.
            
            # Change to project dir to run glob relative to it
            matched_files = []
            
            # Use rglob if pattern starts with **/ or contains /**/ 
            # actually pathlib.Path.glob is better/safer
            
            results = list(self.project_dir.glob(pattern))
            
            # Convert to relative paths strings
            matched_files = [str(p.relative_to(self.project_dir)) for p in results if p.is_file()]
            
            if not matched_files:
                return "No files found matching the pattern."
            
            # Limit results to avoided Context Window explosion
            if len(matched_files) > 100:
                return "\n".join(matched_files[:100]) + f"\n... ({len(matched_files) - 100} more files truncated)"
            
            return "\n".join(matched_files)

        except Exception as e:
            return f"Error executing glob: {str(e)}"

    def _tool_grep(self, pattern: str, path: str = ".") -> str:
        if not pattern:
            return "Error: pattern is required"
        
        # We'll use grep subprocess for speed and reliability, assuming Linux environment
        # as indicated in user_information.
        
        try:
            # Construct grep command
            # -r: recursive
            # -n: line numbers
            # -I: ignore binary files
            cmd = ["grep", "-rnI", pattern, path]
            
            result = subprocess.run(
                cmd,
                cwd=str(self.project_dir),
                capture_output=True,
                text=True,
                timeout=10 # Avoid hanging forever
            )
            
            output = result.stdout
            if not output:
                return "No matches found."
                
            lines = output.splitlines()
            if len(lines) > 100:
                return "\n".join(lines[:100]) + f"\n... ({len(lines) - 100} more matches truncated)"
                
            return output
            
        except subprocess.TimeoutExpired:
            return "Error: Grep timed out"
        except Exception as e:
            return f"Error executing grep: {str(e)}"
