"""
Anthropic Provider
==================

Implementation of the Anthropic Claude API provider.
"""

import os
from typing import Dict, Any, List, Optional
from datetime import datetime

try:
    from anthropic import AsyncAnthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

from .llm_providers_base import (
    LLMProvider,
    CompletionRequest,
    CompletionResponse,
    TokenUsage,
    ModelInfo,
    ProviderUsageData,
    AuthenticationError,
    RateLimitError,
    ProviderError,
)


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""
    
    MODELS = {
        "claude-opus-4-20250514": {
            "display_name": "Claude Opus 4",
            "context_window": 200000,
        },
        "claude-sonnet-4-20250514": {
            "display_name": "Claude Sonnet 4",
            "context_window": 200000,
        },
        "claude-haiku-4-5-20251001": {
            "display_name": "Claude Haiku 4.5",
            "context_window": 200000,
        },
    }
    
    def __init__(self, provider_id: str, config: Dict[str, Any]):
        super().__init__(provider_id, config)
        self.api_key = self._get_api_key()
        self.client = None
        if ANTHROPIC_AVAILABLE and self.api_key:
            self.client = AsyncAnthropic(api_key=self.api_key)
    
    @property
    def provider_type(self) -> str:
        return "anthropic"
    
    def _get_api_key(self) -> Optional[str]:
        """Get API key from config or environment."""
        auth = self.config.get("auth", {})
        if auth.get("type") == "apiKey":
            return auth.get("apiKey") or os.environ.get("ANTHROPIC_API_KEY")
        return os.environ.get("ANTHROPIC_API_KEY")
    
    async def authenticate(self) -> bool:
        """Validate authentication by making a test request."""
        if not self.api_key:
            raise AuthenticationError("No API key configured")
        
        if not ANTHROPIC_AVAILABLE:
            raise ProviderError("Anthropic SDK not installed")
        
        try:
            # Make a minimal request to validate
            response = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1,
                messages=[{"role": "user", "content": "Hi"}],
            )
            return True
        except Exception as e:
            raise AuthenticationError(f"Authentication failed: {e}")
    
    async def list_models(self) -> List[ModelInfo]:
        """List available Anthropic models."""
        return [
            ModelInfo(
                id=model_id,
                display_name=data["display_name"],
                provider_id=self.provider_id,
                context_window=data["context_window"],
            )
            for model_id, data in self.MODELS.items()
        ]
    
    async def create_completion(self, request: CompletionRequest) -> CompletionResponse:
        """Create a completion using Anthropic API."""
        if not self.client:
            raise ProviderError("Anthropic client not initialized")
        
        try:
            # Convert messages format if needed
            messages = request.messages
            system = request.system_prompt
            
            # Make the API call
            response = await self.client.messages.create(
                model=request.model,
                max_tokens=request.max_tokens or 4096,
                temperature=request.temperature,
                messages=messages,
                system=system,
            )
            
            # Extract usage
            usage = TokenUsage(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            )
            
            # Get content
            content = ""
            if response.content:
                content = response.content[0].text if hasattr(response.content[0], 'text') else str(response.content[0])
            
            return CompletionResponse(
                content=content,
                usage=usage,
                model=request.model,
                finish_reason=response.stop_reason or "stop",
                provider_id=self.provider_id,
            )
            
        except Exception as e:
            if "rate_limit" in str(e).lower():
                raise RateLimitError(f"Rate limit exceeded: {e}")
            raise ProviderError(f"Completion failed: {e}")
    
    async def get_usage(self) -> Optional[ProviderUsageData]:
        """
        Get usage data for Anthropic.
        
        Note: Anthropic doesn't provide a direct usage API.
        This would need to be tracked manually or via their console.
        """
        # TODO: Implement actual usage tracking
        # This could be done by:
        # 1. Tracking tokens locally
        # 2. Scraping the Anthropic console
        # 3. Using their admin API (if available)
        
        return ProviderUsageData(
            provider_id=self.provider_id,
            provider_name=self.name,
            has_limits=True,
            last_updated=datetime.now(),
        )


def create_anthropic_provider(provider_id: str, config: Dict[str, Any]) -> AnthropicProvider:
    """Factory function for creating Anthropic provider."""
    return AnthropicProvider(provider_id, config)
