"""
LLM Provider Base Classes
=========================

Base classes and types for LLM provider implementations.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, Optional, Dict, Any, List
from datetime import datetime


@dataclass
class TokenUsage:
    """Token usage information."""
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


@dataclass
class CompletionRequest:
    """Request for a completion."""
    model: str
    messages: List[Dict[str, str]]
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    stream: bool = False
    system_prompt: Optional[str] = None


@dataclass
class CompletionResponse:
    """Response from a completion."""
    content: str
    usage: TokenUsage
    model: str
    finish_reason: str
    provider_id: str


@dataclass
class ProviderUsageData:
    """Usage data for a provider."""
    provider_id: str
    provider_name: str
    has_limits: bool = False
    session_percent: Optional[float] = None
    daily_percent: Optional[float] = None
    monthly_percent: Optional[float] = None
    input_tokens_used: Optional[int] = None
    output_tokens_used: Optional[int] = None
    total_tokens_used: Optional[int] = None
    cost_incurred: Optional[float] = None
    is_rate_limited: bool = False
    rate_limit_reset_at: Optional[datetime] = None
    last_updated: Optional[datetime] = None


@dataclass
class ModelInfo:
    """Information about a model."""
    id: str
    display_name: str
    provider_id: str
    context_window: Optional[int] = None
    supports_vision: bool = False
    supports_functions: bool = False


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    def __init__(self, provider_id: str, config: Dict[str, Any]):
        self.provider_id = provider_id
        self.config = config
        self.name = config.get("name", provider_id)
    
    @property
    @abstractmethod
    def provider_type(self) -> str:
        """Return the provider type identifier."""
        pass
    
    @abstractmethod
    async def authenticate(self) -> bool:
        """Validate authentication credentials."""
        pass
    
    @abstractmethod
    async def list_models(self) -> List[ModelInfo]:
        """List available models."""
        pass
    
    @abstractmethod
    async def create_completion(self, request: CompletionRequest) -> CompletionResponse:
        """Create a completion."""
        pass
    
    async def create_completion_stream(
        self, request: CompletionRequest
    ) -> AsyncIterator[str]:
        """Create a streaming completion."""
        raise NotImplementedError("Streaming not supported by this provider")
    
    async def get_usage(self) -> Optional[ProviderUsageData]:
        """Get current usage data (if supported)."""
        return None
    
    def has_capacity(self, min_percent: float = 10.0) -> bool:
        """Check if provider has sufficient capacity."""
        return True


class ProviderError(Exception):
    """Base exception for provider errors."""
    pass


class AuthenticationError(ProviderError):
    """Authentication failed."""
    pass


class RateLimitError(ProviderError):
    """Rate limit exceeded."""
    pass


class ModelNotFoundError(ProviderError):
    """Model not found."""
    pass
