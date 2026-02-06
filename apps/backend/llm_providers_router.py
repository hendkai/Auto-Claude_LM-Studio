"""
LLM Model Router
================

Routes completion requests to available providers based on priority lists.
Handles automatic fallback when providers are exhausted or rate-limited.
"""

import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime

from .llm_providers_base import (
    LLMProvider,
    CompletionRequest,
    CompletionResponse,
    ProviderError,
    RateLimitError,
)
from .llm_providers_factory import ProviderFactory

logger = logging.getLogger(__name__)


@dataclass
class RoutingContext:
    """Context for routing decisions."""
    phase: Optional[str] = None  # 'spec', 'planning', 'coding', 'qa'
    feature: Optional[str] = None  # 'insights', 'ideation', etc.
    project_id: Optional[str] = None
    task_type: Optional[str] = None
    high_priority: bool = False


@dataclass
class RoutingResult:
    """Result of a routing decision."""
    provider_id: str
    model_id: str
    model_display_name: str
    fallback_used: bool
    priority_index: int
    selection_reason: str


@dataclass
class ModelReference:
    """Reference to a specific model on a provider."""
    provider_id: str
    model_id: str
    display_name: Optional[str] = None


class ModelRouter:
    """Routes LLM requests to appropriate providers."""
    
    def __init__(self):
        self.providers: Dict[str, LLMProvider] = {}
        self.phase_priorities: Dict[str, List[ModelReference]] = {}
        self.feature_priorities: Dict[str, List[ModelReference]] = {}
        self.rate_limited_until: Dict[str, datetime] = {}
    
    def register_provider(self, provider: LLMProvider):
        """Register a provider instance."""
        self.providers[provider.provider_id] = provider
        logger.info(f"Registered provider: {provider.provider_id}")
    
    def unregister_provider(self, provider_id: str):
        """Unregister a provider."""
        if provider_id in self.providers:
            del self.providers[provider_id]
            logger.info(f"Unregistered provider: {provider_id}")
    
    def set_phase_priorities(self, phase: str, priorities: List[ModelReference]):
        """Set priority list for a phase."""
        self.phase_priorities[phase] = priorities
        logger.debug(f"Set priorities for phase {phase}: {len(priorities)} models")
    
    def set_feature_priorities(self, feature: str, priorities: List[ModelReference]):
        """Set priority list for a feature."""
        self.feature_priorities[feature] = priorities
        logger.debug(f"Set priorities for feature {feature}: {len(priorities)} models")
    
    def _get_priority_list(self, context: RoutingContext) -> List[ModelReference]:
        """Get the priority list based on context."""
        if context.phase and context.phase in self.phase_priorities:
            return self.phase_priorities[context.phase]
        
        if context.feature and context.feature in self.feature_priorities:
            return self.feature_priorities[context.feature]
        
        # Default: use first available provider
        return [
            ModelReference(provider_id=pid, model_id="default")
            for pid in self.providers.keys()
        ]
    
    def _is_available(self, provider_id: str, min_capacity: float = 10.0) -> bool:
        """Check if a provider is available."""
        # Check if provider exists
        if provider_id not in self.providers:
            return False
        
        # Check if rate limited
        if provider_id in self.rate_limited_until:
            if datetime.now() < self.rate_limited_until[provider_id]:
                return False
            # Rate limit expired, remove it
            del self.rate_limited_until[provider_id]
        
        # Check provider capacity
        provider = self.providers[provider_id]
        return provider.has_capacity(min_capacity)
    
    def _mark_rate_limited(self, provider_id: str, reset_at: Optional[datetime] = None):
        """Mark a provider as rate limited."""
        # Default: 1 minute cooldown
        if reset_at is None:
            from datetime import timedelta
            reset_at = datetime.now() + timedelta(minutes=1)
        
        self.rate_limited_until[provider_id] = reset_at
        logger.warning(f"Provider {provider_id} rate limited until {reset_at}")
    
    async def route_completion(
        self,
        context: RoutingContext,
        request: CompletionRequest,
    ) -> tuple[CompletionResponse, RoutingResult]:
        """
        Route a completion request to the best available provider.
        
        Returns:
            Tuple of (completion response, routing result)
        
        Raises:
            ProviderError: If all providers are exhausted.
        """
        priority_list = self._get_priority_list(context)
        
        if not priority_list:
            raise ProviderError("No priority list configured")
        
        # Try each provider in priority order
        for index, ref in enumerate(priority_list):
            provider_id = ref.provider_id
            
            # Check if provider is available
            if not self._is_available(provider_id):
                logger.debug(f"Provider {provider_id} not available, trying next")
                continue
            
            provider = self.providers[provider_id]
            
            try:
                # Update request with model from reference
                request.model = ref.model_id
                
                # Attempt completion
                logger.info(f"Routing to {provider_id}/{ref.model_id} (priority {index})")
                response = await provider.create_completion(request)
                
                # Build routing result
                result = RoutingResult(
                    provider_id=provider_id,
                    model_id=ref.model_id,
                    model_display_name=ref.display_name or ref.model_id,
                    fallback_used=index > 0,
                    priority_index=index,
                    selection_reason=f"Primary model" if index == 0 else f"Fallback {index}",
                )
                
                if index > 0:
                    logger.info(f"Used fallback {index}: {provider_id}/{ref.model_id}")
                
                return response, result
                
            except RateLimitError as e:
                logger.warning(f"Rate limit hit for {provider_id}: {e}")
                self._mark_rate_limited(provider_id)
                continue
                
            except ProviderError as e:
                logger.error(f"Provider {provider_id} failed: {e}")
                continue
        
        # All providers exhausted
        raise ProviderError(
            f"All providers exhausted for {context.phase or context.feature}. "
            f"Tried {len(priority_list)} models."
        )
    
    def get_routing_status(self) -> Dict[str, Any]:
        """Get current routing status."""
        return {
            "registered_providers": list(self.providers.keys()),
            "phase_priorities": {
                phase: [f"{ref.provider_id}/{ref.model_id}" for ref in refs]
                for phase, refs in self.phase_priorities.items()
            },
            "feature_priorities": {
                feature: [f"{ref.provider_id}/{ref.model_id}" for ref in refs]
                for feature, refs in self.feature_priorities.items()
            },
            "rate_limited_providers": {
                pid: reset_at.isoformat()
                for pid, reset_at in self.rate_limited_until.items()
            },
        }


# Global router instance
_router: Optional[ModelRouter] = None


def get_router() -> ModelRouter:
    """Get or create the global router instance."""
    global _router
    if _router is None:
        _router = ModelRouter()
    return _router


def set_router(router: ModelRouter):
    """Set the global router instance."""
    global _router
    _router = router
