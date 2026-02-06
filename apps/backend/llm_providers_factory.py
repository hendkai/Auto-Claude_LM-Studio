"""
LLM Provider Factory
====================

Factory for creating provider instances.
"""

from typing import Dict, Any, Type, Optional
from .llm_providers_base import LLMProvider

# Provider registry
_provider_registry: Dict[str, Type[LLMProvider]] = {}


class ProviderFactory:
    """Factory for creating LLM provider instances."""
    
    @classmethod
    def register(cls, provider_type: str, provider_class: Type[LLMProvider]):
        """Register a provider class."""
        _provider_registry[provider_type] = provider_class
    
    @classmethod
    def create(cls, provider_type: str, provider_id: str, config: Dict[str, Any]) -> LLMProvider:
        """Create a provider instance."""
        if provider_type not in _provider_registry:
            raise ValueError(f"Unknown provider type: {provider_type}")
        
        provider_class = _provider_registry[provider_type]
        return provider_class(provider_id, config)
    
    @classmethod
    def get_available_types(cls) -> list[str]:
        """Get list of registered provider types."""
        return list(_provider_registry.keys())
    
    @classmethod
    def is_registered(cls, provider_type: str) -> bool:
        """Check if a provider type is registered."""
        return provider_type in _provider_registry


# Import and register providers
try:
    from .llm_providers_anthropic import AnthropicProvider
    ProviderFactory.register("anthropic", AnthropicProvider)
except ImportError:
    pass

# TODO: Register other providers as they are implemented
# from .llm_providers_openai import OpenAIProvider
# ProviderFactory.register("openai", OpenAIProvider)

# from .llm_providers_google import GoogleProvider
# ProviderFactory.register("google", GoogleProvider)

# from .llm_providers_groq import GroqProvider
# ProviderFactory.register("groq", GroqProvider)

# from .llm_providers_azure import AzureProvider
# ProviderFactory.register("azure", AzureProvider)

# from .llm_providers_ollama import OllamaProvider
# ProviderFactory.register("ollama", OllamaProvider)
