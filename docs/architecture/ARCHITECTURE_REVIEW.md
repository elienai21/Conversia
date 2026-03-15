# Conversia - Production Architecture Review & Improvements

**Date**: 2026-03-15
**Status**: Architecture Design Phase
**Version**: 2.0 (Enhanced for Production SaaS)

---

## Executive Summary

This document presents a comprehensive architectural review and enhancement of Conversia, transforming it from a basic multilingual chat platform into a **production-grade, multi-tenant AI customer support SaaS**.

### Key Architectural Enhancements

1. **AI Copilot System** - Intelligent agent assistance with context-aware suggestions
2. **Real-Time Communication Layer** - Enterprise-grade WebSocket infrastructure
3. **Multilingual Intelligence** - Advanced language detection, translation, and normalization
4. **Intent Detection & Automation** - Automatic action routing and execution
5. **Integration Framework** - Extensible connections to CRM, PMS, WhatsApp, etc.
6. **Observability Infrastructure** - Production monitoring, logging, and tracing
7. **Analytics & Training Pipeline** - AI improvement through usage data
8. **Multi-Tenant Architecture** - True SaaS with tenant isolation

---

## Revised Project Structure

```
c:\Projetos\Conversia\
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                                      # FastAPI entry point
│   │   ├── config.py                                    # Environment configuration
│   │   ├── dependencies.py                              # Dependency injection
│   │   │
│   │   ├── middleware/
│   │   │   ├── __init__.py
│   │   │   ├── tenant_context.py                       # Multi-tenant middleware
│   │   │   ├── auth_middleware.py                      # JWT authentication
│   │   │   ├── rate_limiting.py                        # Rate limiter
│   │   │   └── logging_middleware.py                   # Request logging
│   │   │
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── endpoints/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── auth.py                        # Authentication endpoints
│   │   │   │   │   ├── tenants.py                     # Tenant management (admin)
│   │   │   │   │   ├── conversations.py               # Conversation CRUD
│   │   │   │   │   ├── messages.py                    # Message endpoints
│   │   │   │   │   ├── agents.py                      # Agent management
│   │   │   │   │   ├── customers.py                   # Customer management
│   │   │   │   │   ├── copilot.py                     # Copilot suggestions API
│   │   │   │   │   ├── analytics.py                   # Analytics endpoints
│   │   │   │   │   ├── integrations.py                # Integration management
│   │   │   │   │   └── webhooks.py                    # Webhook endpoints
│   │   │   │   │
│   │   │   │   └── websocket/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── chat.py                        # WebSocket chat endpoint
│   │   │   │       └── connection_manager.py          # WebSocket connection pool
│   │   │
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── security.py                            # JWT, password hashing
│   │   │   ├── logging.py                             # Structured logging config
│   │   │   ├── redis_client.py                        # Redis connection pool
│   │   │   ├── exceptions.py                          # Custom exceptions
│   │   │   └── tenant_context.py                      # Tenant context manager
│   │   │
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── base.py                                # SQLAlchemy base
│   │   │   ├── session.py                             # Database session factory
│   │   │   │
│   │   │   └── models/
│   │   │       ├── __init__.py
│   │   │       ├── base_model.py                      # Base model with tenant_id
│   │   │       ├── tenant.py                          # Tenant model
│   │   │       ├── user.py                            # User model (agents + customers)
│   │   │       ├── conversation.py                    # Conversation model
│   │   │       ├── message.py                         # Bilingual message model
│   │   │       ├── agent_preference.py                # Agent language & settings
│   │   │       ├── translation_cache.py               # Translation cache
│   │   │       ├── ai_suggestion.py                   # AI copilot suggestions (for analytics)
│   │   │       ├── intent_log.py                      # Intent detection log
│   │   │       ├── action_log.py                      # Automated action log
│   │   │       ├── integration.py                     # Integration configs
│   │   │       ├── webhook_event.py                   # Webhook event log
│   │   │       └── analytics_event.py                 # Analytics tracking
│   │   │
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── tenant.py                              # Tenant Pydantic schemas
│   │   │   ├── user.py                                # User schemas
│   │   │   ├── conversation.py                        # Conversation schemas
│   │   │   ├── message.py                             # Message schemas
│   │   │   ├── websocket.py                           # WebSocket event schemas
│   │   │   ├── language.py                            # Language detection/translation
│   │   │   ├── copilot.py                             # Copilot suggestion schemas
│   │   │   ├── intent.py                              # Intent detection schemas
│   │   │   ├── integration.py                         # Integration schemas
│   │   │   └── analytics.py                           # Analytics schemas
│   │   │
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   │
│   │   │   ├── ai/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── llm_client.py                      # LLM client abstraction (OpenAI, Anthropic, etc.)
│   │   │   │   ├── prompt_manager.py                  # Centralized prompt management
│   │   │   │   ├── conversation_analyzer.py           # Analyze conversation context
│   │   │   │   ├── embedder.py                        # Text embedding service
│   │   │   │   │
│   │   │   │   ├── language/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── language_detector.py          # Language detection (FastText + LLM)
│   │   │   │   │   ├── translator.py                 # Translation service (multi-tier cache)
│   │   │   │   │   └── language_normalizer.py        # Grammar & tone correction
│   │   │   │   │
│   │   │   │   ├── rag/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── rag_pipeline.py               # RAG orchestration
│   │   │   │   │   ├── retriever.py                  # Vector search retrieval
│   │   │   │   │   └── vector_store.py               # Pinecone/Weaviate/Qdrant integration
│   │   │   │   │
│   │   │   │   └── prompt_templates/
│   │   │   │       ├── copilot_prompts.py            # Copilot suggestion prompts
│   │   │   │       ├── translation_prompts.py        # Translation prompts
│   │   │   │       ├── intent_prompts.py             # Intent detection prompts
│   │   │   │       └── summary_prompts.py            # Conversation summary prompts
│   │   │   │
│   │   │   ├── agent/
│   │   │   │   ├── __init__.py
│   │   │   │   │
│   │   │   │   └── copilot/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── context_builder.py            # Build conversation context
│   │   │   │       ├── suggestion_engine.py          # Generate reply suggestions
│   │   │   │       ├── tone_optimizer.py             # Optimize message tone
│   │   │   │       ├── grammar_corrector.py          # Correct grammar
│   │   │   │       └── response_ranker.py            # Rank suggestions by relevance
│   │   │   │
│   │   │   ├── automation/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── intent_detector.py                # Detect user intent
│   │   │   │   ├── intent_classifier.py              # Classify detected intent
│   │   │   │   ├── action_router.py                  # Route to appropriate action
│   │   │   │   │
│   │   │   │   └── action_handlers/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── base_handler.py               # Base action handler
│   │   │   │       ├── booking_actions.py            # Handle booking intents
│   │   │   │       ├── reservation_actions.py        # Handle reservation intents
│   │   │   │       ├── support_actions.py            # Handle support intents
│   │   │   │       └── fallback_handler.py           # Fallback to AI/human
│   │   │   │
│   │   │   ├── realtime/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── websocket_manager.py              # WebSocket connection management
│   │   │   │   ├── presence_service.py               # Online/offline status tracking
│   │   │   │   ├── typing_indicator.py               # Typing indicator service
│   │   │   │   └── message_dispatcher.py             # Dispatch messages to participants
│   │   │   │
│   │   │   ├── integrations/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── integration_hub.py                # Central integration manager
│   │   │   │   ├── webhook_handler.py                # Process incoming webhooks
│   │   │   │   │
│   │   │   │   ├── crm/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── salesforce.py                 # Salesforce integration
│   │   │   │   │   ├── hubspot.py                    # HubSpot integration
│   │   │   │   │   └── zoho.py                       # Zoho CRM integration
│   │   │   │   │
│   │   │   │   ├── hotel_pms/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── opera.py                      # Oracle Opera PMS
│   │   │   │   │   ├── mews.py                       # Mews PMS
│   │   │   │   │   └── cloudbeds.py                  # Cloudbeds PMS
│   │   │   │   │
│   │   │   │   └── messaging/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── whatsapp.py                   # WhatsApp Business API
│   │   │   │       ├── telegram.py                   # Telegram integration
│   │   │   │       └── messenger.py                  # Facebook Messenger
│   │   │   │
│   │   │   ├── observability/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── logging_service.py                # Structured logging (JSON)
│   │   │   │   ├── metrics_collector.py              # Prometheus/StatsD metrics
│   │   │   │   └── tracing_service.py                # OpenTelemetry tracing
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── event_tracker.py                  # Track user/AI events
│   │   │   │   ├── metrics_aggregator.py             # Aggregate metrics
│   │   │   │   └── ai_performance_tracker.py         # Track AI suggestion acceptance
│   │   │   │
│   │   │   ├── conversation_service.py               # Business logic for conversations
│   │   │   ├── message_service.py                    # Business logic for messages
│   │   │   ├── translation_pipeline.py               # Translation orchestration
│   │   │   └── cache_service.py                      # Redis caching service
│   │   │
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── language_codes.py                     # ISO 639-1 language mappings
│   │       ├── validators.py                         # Input validation
│   │       └── tenant_helpers.py                     # Tenant utility functions
│   │
│   ├── alembic/                                      # Database migrations
│   │   ├── versions/
│   │   ├── env.py
│   │   └── alembic.ini
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py                               # Pytest fixtures
│   │   ├── unit/
│   │   │   ├── test_language_detector.py
│   │   │   ├── test_translator.py
│   │   │   ├── test_normalizer.py
│   │   │   ├── test_copilot.py
│   │   │   ├── test_intent_detector.py
│   │   │   └── test_integrations.py
│   │   │
│   │   ├── integration/
│   │   │   ├── test_translation_pipeline.py
│   │   │   ├── test_websocket_chat.py
│   │   │   ├── test_automation_flow.py
│   │   │   └── test_copilot_flow.py
│   │   │
│   │   └── e2e/
│   │       └── test_full_conversation_flow.py
│   │
│   ├── models/                                       # ML model artifacts
│   │   ├── fasttext/
│   │   │   └── lid.176.bin                          # FastText language detection
│   │   └── embeddings/
│   │       └── sentence-transformers/
│   │
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── .env.example
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── frontend/
│   ├── public/
│   │   └── index.html
│   │
│   ├── src/
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Dropdown.tsx
│   │   │   │   └── LanguageBadge.tsx               # Language indicator
│   │   │   │
│   │   │   ├── chat/
│   │   │   │   ├── ChatWindow.tsx                  # Main chat container
│   │   │   │   ├── MessageList.tsx                 # Virtual scrolling message list
│   │   │   │   ├── MessageItem.tsx                 # Individual message
│   │   │   │   ├── BilingualMessage.tsx            # Original + translated display
│   │   │   │   ├── MessageInput.tsx                # Message composition
│   │   │   │   ├── TypingIndicator.tsx             # Typing animation
│   │   │   │   ├── TranslationToggle.tsx           # Toggle translation view
│   │   │   │   │
│   │   │   │   └── copilot/
│   │   │   │       ├── CopilotPanel.tsx            # Copilot suggestion panel
│   │   │   │       ├── SuggestionCard.tsx          # Individual suggestion
│   │   │   │       └── ToneSelector.tsx            # Tone adjustment UI
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── ConversationList.tsx            # Conversation inbox
│   │   │   │   ├── AgentPanel.tsx                  # Agent workspace
│   │   │   │   ├── CustomerPanel.tsx               # Customer interface
│   │   │   │   ├── AnalyticsDashboard.tsx          # Metrics & KPIs
│   │   │   │   └── IntegrationSettings.tsx         # Integration config UI
│   │   │   │
│   │   │   ├── settings/
│   │   │   │   ├── LanguagePreferences.tsx         # Language settings
│   │   │   │   ├── TranslationSettings.tsx         # Translation config
│   │   │   │   ├── CopilotSettings.tsx             # Copilot preferences
│   │   │   │   └── IntegrationManager.tsx          # Manage integrations
│   │   │   │
│   │   │   └── admin/
│   │   │       ├── TenantManagement.tsx            # Multi-tenant admin
│   │   │       ├── UserManagement.tsx              # User admin
│   │   │       └── SystemMetrics.tsx               # System-wide analytics
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts                     # WebSocket connection
│   │   │   ├── useChat.ts                          # Chat state management
│   │   │   ├── useTranslation.ts                   # Translation state
│   │   │   ├── useCopilot.ts                       # Copilot suggestions
│   │   │   ├── usePresence.ts                      # Presence tracking
│   │   │   ├── useAuth.ts                          # Authentication
│   │   │   └── useTenant.ts                        # Tenant context
│   │   │
│   │   ├── contexts/
│   │   │   ├── WebSocketContext.tsx                # WebSocket provider
│   │   │   ├── ChatContext.tsx                     # Chat state provider
│   │   │   ├── AuthContext.tsx                     # Auth state provider
│   │   │   └── TenantContext.tsx                   # Tenant provider
│   │   │
│   │   ├── services/
│   │   │   ├── api.ts                              # Axios HTTP client
│   │   │   ├── websocket.ts                        # WebSocket client
│   │   │   ├── storage.ts                          # LocalStorage wrapper
│   │   │   └── analytics.ts                        # Analytics tracking
│   │   │
│   │   ├── types/
│   │   │   ├── message.ts                          # Message types
│   │   │   ├── conversation.ts                     # Conversation types
│   │   │   ├── user.ts                             # User types
│   │   │   ├── websocket.ts                        # WebSocket event types
│   │   │   ├── copilot.ts                          # Copilot types
│   │   │   ├── intent.ts                           # Intent types
│   │   │   └── tenant.ts                           # Tenant types
│   │   │
│   │   └── utils/
│   │       ├── languageHelpers.ts                  # Language utilities
│   │       ├── dateHelpers.ts                      # Date formatting
│   │       └── tenantHelpers.ts                    # Tenant utilities
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── .env.example
│   └── Dockerfile
│
├── infrastructure/
│   ├── docker-compose.yml                           # Full stack orchestration
│   ├── docker-compose.prod.yml                      # Production config
│   │
│   ├── nginx/
│   │   ├── nginx.conf                               # Reverse proxy config
│   │   └── ssl/                                     # SSL certificates
│   │
│   ├── scripts/
│   │   ├── init-db.sh                               # Database initialization
│   │   ├── seed-data.sh                             # Sample data seeding
│   │   ├── backup-db.sh                             # Database backup
│   │   └── deploy.sh                                # Deployment script
│   │
│   └── monitoring/
│       ├── prometheus/
│       │   └── prometheus.yml                       # Prometheus config
│       ├── grafana/
│       │   └── dashboards/                          # Grafana dashboards
│       └── loki/
│           └── loki-config.yml                      # Log aggregation
│
├── docs/
│   ├── api/
│   │   ├── rest-endpoints.md
│   │   ├── websocket-events.md
│   │   └── webhook-payloads.md
│   │
│   ├── architecture/
│   │   ├── system-design.md
│   │   ├── translation-pipeline.md
│   │   ├── copilot-architecture.md
│   │   ├── automation-engine.md
│   │   ├── multi-tenant-design.md
│   │   └── ARCHITECTURE_REVIEW.md                  # This document
│   │
│   ├── integrations/
│   │   ├── whatsapp-setup.md
│   │   ├── crm-integration.md
│   │   └── pms-integration.md
│   │
│   └── deployment/
│       ├── deployment-guide.md
│       ├── scaling-strategy.md
│       └── security-best-practices.md
│
├── .gitignore
├── README.md
└── LICENSE
```

---

## 1. AI Copilot Architecture

### Overview

The AI Copilot is an intelligent assistant that helps human agents respond to customers more effectively by providing context-aware suggestions, grammar correction, tone optimization, and empathetic response generation.

### Module Structure

```
services/agent/copilot/
├── context_builder.py          # Build conversation context
├── suggestion_engine.py         # Generate reply suggestions
├── tone_optimizer.py            # Optimize message tone
├── grammar_corrector.py         # Correct grammar
└── response_ranker.py           # Rank suggestions by relevance
```

### Component Responsibilities

#### 1. **Context Builder** (`context_builder.py`)
```python
class ContextBuilder:
    """
    Analyzes the full conversation to build context for AI suggestions.

    Responsibilities:
    - Extract conversation history
    - Identify customer sentiment
    - Detect conversation topic
    - Extract key entities (dates, names, order IDs)
    - Build structured context for LLM
    """

    async def build_context(
        self,
        conversation_id: str,
        max_messages: int = 20
    ) -> ConversationContext:
        """
        Returns:
            ConversationContext with:
            - recent_messages: Last N messages
            - customer_sentiment: positive/neutral/negative
            - conversation_topic: booking/support/inquiry
            - extracted_entities: dates, IDs, names
            - customer_language: detected language
            - conversation_summary: brief summary
        """
```

#### 2. **Suggestion Engine** (`suggestion_engine.py`)
```python
class SuggestionEngine:
    """
    Generates multiple reply suggestions based on conversation context.

    Capabilities:
    - Generate 3-5 response options
    - Different tones (professional, friendly, empathetic)
    - Include relevant knowledge base articles
    - Use RAG for factual accuracy
    - Support multilingual suggestions
    """

    async def generate_suggestions(
        self,
        context: ConversationContext,
        num_suggestions: int = 3
    ) -> List[Suggestion]:
        """
        Returns multiple ranked suggestions with metadata.
        """
```

#### 3. **Tone Optimizer** (`tone_optimizer.py`)
```python
class ToneOptimizer:
    """
    Adjusts message tone to match customer sentiment and conversation context.

    Tone Options:
    - Professional: Formal business communication
    - Friendly: Warm and approachable
    - Empathetic: Understanding and compassionate
    - Apologetic: For service failures
    - Enthusiastic: For positive interactions
    """

    async def optimize_tone(
        self,
        message: str,
        target_tone: str,
        customer_sentiment: str
    ) -> str:
        """Adjusts message tone while preserving meaning."""
```

#### 4. **Grammar Corrector** (`grammar_corrector.py`)
```python
class GrammarCorrector:
    """
    Corrects grammar, spelling, and punctuation before sending.

    Features:
    - Real-time grammar checking
    - Spelling correction
    - Punctuation fixes
    - Suggest improvements without forcing changes
    - Support multiple languages
    """

    async def correct(
        self,
        text: str,
        language: str
    ) -> CorrectionResult:
        """
        Returns:
            CorrectionResult with:
            - corrected_text
            - changes: list of corrections made
            - suggestions: optional improvements
        """
```

#### 5. **Response Ranker** (`response_ranker.py`)
```python
class ResponseRanker:
    """
    Ranks AI-generated suggestions by relevance and quality.

    Ranking Criteria:
    - Contextual relevance (semantic similarity)
    - Sentiment match
    - Length appropriateness
    - Professionalism score
    - Previous acceptance rate (ML-based)
    """

    async def rank_suggestions(
        self,
        suggestions: List[Suggestion],
        context: ConversationContext
    ) -> List[RankedSuggestion]:
        """Returns suggestions sorted by relevance score."""
```

### Copilot Workflow

```
Agent views conversation
    ↓
Context Builder analyzes conversation
    ↓
Suggestion Engine generates 3-5 responses
    ↓
Tone Optimizer adjusts tone per suggestion
    ↓
Grammar Corrector validates suggestions
    ↓
Response Ranker sorts by relevance
    ↓
Agent sees ranked suggestions in UI
    ↓
Agent selects, edits, or ignores suggestions
    ↓
Selection tracked in ai_suggestions table
```

### Database Model: `ai_suggestions`

```sql
CREATE TABLE ai_suggestions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    message_id UUID,                    -- If suggestion was sent
    agent_id UUID NOT NULL,

    suggestion_text TEXT NOT NULL,
    suggestion_tone VARCHAR(50),        -- professional, friendly, etc.
    suggestion_rank INTEGER,            -- 1, 2, 3, 4, 5
    relevance_score DECIMAL(5,4),       -- 0.0-1.0

    accepted BOOLEAN DEFAULT FALSE,     -- Did agent use this?
    edited BOOLEAN DEFAULT FALSE,       -- Did agent edit before sending?
    edit_distance INTEGER,              -- Levenshtein distance if edited

    generation_time_ms INTEGER,         -- Latency metric

    created_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP
);

CREATE INDEX idx_ai_suggestions_tenant ON ai_suggestions(tenant_id);
CREATE INDEX idx_ai_suggestions_conversation ON ai_suggestions(conversation_id);
CREATE INDEX idx_ai_suggestions_accepted ON ai_suggestions(accepted) WHERE accepted = true;
```

**Purpose**: Track copilot suggestion quality for:
- Analytics (acceptance rate, edit rate)
- Future ML training
- A/B testing different prompts
- Agent performance insights

---

## 2. Real-Time Communication Layer

### Overview

A dedicated real-time service module handles all WebSocket-based communication, presence tracking, typing indicators, and message dispatching.

### Module Structure

```
services/realtime/
├── websocket_manager.py         # WebSocket connection management
├── presence_service.py          # Online/offline status tracking
├── typing_indicator.py          # Typing indicator service
└── message_dispatcher.py        # Message routing and broadcasting
```

### Component Responsibilities

#### 1. **WebSocket Manager** (`websocket_manager.py`)
```python
class WebSocketManager:
    """
    Manages WebSocket connections with connection pooling and health checks.

    Responsibilities:
    - Accept WebSocket connections
    - Authenticate connections via JWT
    - Maintain connection pool per conversation
    - Handle connection failures and reconnection
    - Support horizontal scaling with Redis Pub/Sub
    - Heartbeat/ping-pong for connection health
    """

    def __init__(self):
        self.connections: Dict[str, List[WebSocket]] = {}  # conversation_id -> [websockets]
        self.user_connections: Dict[str, WebSocket] = {}   # user_id -> websocket
        self.redis_pubsub = RedisPubSub()

    async def connect(
        self,
        websocket: WebSocket,
        conversation_id: str,
        user_id: str,
        tenant_id: str
    ):
        """Register new WebSocket connection."""

    async def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection."""

    async def broadcast(
        self,
        conversation_id: str,
        message: dict,
        exclude_user: str = None
    ):
        """Broadcast message to all participants in conversation."""
```

**Scaling Strategy**: Use Redis Pub/Sub for multi-server WebSocket broadcasting:

```
Server 1: WebSocket connections for users A, B
Server 2: WebSocket connections for users C, D

User A sends message → Server 1 publishes to Redis
→ Server 2 subscribes and broadcasts to users C, D
```

#### 2. **Presence Service** (`presence_service.py`)
```python
class PresenceService:
    """
    Tracks online/offline status and last activity time.

    Features:
    - Set user online/offline status
    - Track last activity timestamp
    - Broadcast presence changes
    - Auto-offline after timeout (5 minutes)
    """

    async def set_online(self, user_id: str, tenant_id: str):
        """Mark user as online (Redis key with TTL)."""

    async def set_offline(self, user_id: str, tenant_id: str):
        """Mark user as offline."""

    async def get_status(self, user_id: str, tenant_id: str) -> str:
        """Get current status: online/offline/away."""

    async def update_last_activity(self, user_id: str):
        """Update last activity timestamp."""
```

**Redis Storage**:
```
Key: presence:{tenant_id}:{user_id}
Value: {"status": "online", "last_activity": "2026-03-15T10:30:00Z"}
TTL: 300 seconds (auto-expire if no heartbeat)
```

#### 3. **Typing Indicator** (`typing_indicator.py`)
```python
class TypingIndicator:
    """
    Shows when users are typing in real-time.

    Features:
    - Show "{User} is typing..." indicator
    - Auto-hide after 5 seconds of inactivity
    - Support multiple users typing simultaneously
    """

    async def start_typing(
        self,
        conversation_id: str,
        user_id: str,
        user_name: str
    ):
        """Broadcast typing indicator to conversation."""

    async def stop_typing(
        self,
        conversation_id: str,
        user_id: str
    ):
        """Stop showing typing indicator."""
```

**Redis Storage**:
```
Key: typing:{conversation_id}:{user_id}
Value: user_name
TTL: 5 seconds
```

#### 4. **Message Dispatcher** (`message_dispatcher.py`)
```python
class MessageDispatcher:
    """
    Routes messages to appropriate participants with transformation.

    Responsibilities:
    - Dispatch message to conversation participants
    - Apply translations based on recipient language
    - Add copilot suggestions for agents
    - Track message delivery status
    - Support streaming AI responses
    """

    async def dispatch_message(
        self,
        message: Message,
        conversation: Conversation
    ):
        """
        Send message to all participants with appropriate translations.

        Flow:
        1. Get conversation participants
        2. For each participant:
           - Get their preferred language
           - Translate message if needed
           - Dispatch via WebSocket
        3. Track delivery
        """
```

### WebSocket Event Flow

```
Customer sends "Hola, necesito ayuda"
    ↓
WebSocket Manager receives message
    ↓
Translation Pipeline:
  - Detect language: ES
  - Translate to agent's language (EN): "Hello, I need help"
    ↓
Message Dispatcher:
  - Send to agent: {"original": "Hola...", "translated": "Hello..."}
  - Send to customer: {"original": "Hola...", "translated": "Hola..."}
    ↓
Copilot generates suggestions for agent (async)
    ↓
Agent sees message + AI suggestions
```

---

## 3. Multilingual Language Services (Enhanced)

### Overview

Already defined in the original plan, but enhanced with:
- Better caching strategies
- Support for streaming translations
- Context-aware translations (use conversation context)
- Quality scoring and confidence thresholds

### Enhancements

#### **Translator** (`services/ai/language/translator.py`)

Add context-aware translation:
```python
class Translator:
    async def translate_contextual(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        conversation_context: ConversationContext = None
    ) -> Dict:
        """
        Translate with conversation context for better accuracy.

        Example:
        - Customer: "I need it by Friday"
        - Context: Previous message mentioned "room booking"
        - Translation: Uses "habitación" (room) instead of "cuarto" (bedroom)
        """
```

#### **Language Normalizer** (`services/ai/language/language_normalizer.py`)

Add tone adaptation:
```python
class LanguageNormalizer:
    async def adapt_tone(
        self,
        text: str,
        source_language: str,
        target_tone: str,
        customer_sentiment: str
    ) -> Dict:
        """
        Adapt message tone based on customer sentiment.

        If customer is frustrated → use empathetic tone
        If customer is happy → use enthusiastic tone
        """
```

---

## 4. Intent Detection and Action Automation Engine

### Overview

Automatically detect customer intent and route to appropriate action handlers. This enables:
- Automated booking confirmations
- Reservation modifications
- FAQ responses
- Ticket creation
- Escalation to human agents

### Module Structure

```
services/automation/
├── intent_detector.py           # Detect user intent from message
├── intent_classifier.py         # Classify detected intent
├── action_router.py             # Route to appropriate action handler
│
└── action_handlers/
    ├── base_handler.py          # Base action handler interface
    ├── booking_actions.py       # Handle booking intents
    ├── reservation_actions.py   # Handle reservation intents
    ├── support_actions.py       # Handle support intents
    └── fallback_handler.py      # Fallback to AI/human
```

### Component Responsibilities

#### 1. **Intent Detector** (`intent_detector.py`)
```python
class IntentDetector:
    """
    Detects user intent from messages using LLM.

    Intents:
    - booking.new: Customer wants to make a booking
    - booking.modify: Modify existing booking
    - booking.cancel: Cancel booking
    - reservation.confirm: Confirm reservation
    - reservation.check_status: Check reservation status
    - support.complaint: File a complaint
    - support.faq: Ask frequently asked question
    - support.technical: Technical support needed
    """

    async def detect_intent(
        self,
        message: str,
        conversation_context: ConversationContext
    ) -> IntentResult:
        """
        Returns:
            IntentResult with:
            - intent: "booking.new"
            - confidence: 0.95
            - entities: {"check_in": "2026-04-15", "nights": 3}
            - requires_human: False
        """
```

#### 2. **Intent Classifier** (`intent_classifier.py`)
```python
class IntentClassifier:
    """
    Classifies intent into categories and determines routing.

    Classification Categories:
    - Automatable: Can be handled by action handler
    - AI-assisted: Can be answered by AI
    - Human-required: Needs human agent
    - Ambiguous: Needs clarification
    """

    async def classify(
        self,
        intent_result: IntentResult,
        conversation: Conversation
    ) -> ClassificationResult:
        """
        Returns:
            ClassificationResult with:
            - category: "automatable"
            - handler: "booking_actions.create_booking"
            - fallback_strategy: "ai_response"
        """
```

#### 3. **Action Router** (`action_router.py`)
```python
class ActionRouter:
    """
    Routes intents to appropriate action handlers.
    """

    def __init__(self):
        self.handlers = {
            "booking": BookingActionHandler(),
            "reservation": ReservationActionHandler(),
            "support": SupportActionHandler(),
            "fallback": FallbackHandler()
        }

    async def route(
        self,
        classification: ClassificationResult,
        message: Message,
        conversation: Conversation
    ) -> ActionResult:
        """
        Route to handler and execute action.
        """
```

#### 4. **Action Handlers**

**Base Handler** (`base_handler.py`):
```python
class BaseActionHandler(ABC):
    """Abstract base class for action handlers."""

    @abstractmethod
    async def can_handle(self, intent: str) -> bool:
        """Check if this handler can process the intent."""

    @abstractmethod
    async def handle(
        self,
        intent_result: IntentResult,
        message: Message,
        conversation: Conversation
    ) -> ActionResult:
        """Execute the action."""

    @abstractmethod
    async def get_confirmation_message(
        self,
        action_result: ActionResult
    ) -> str:
        """Generate confirmation message for customer."""
```

**Booking Handler** (`booking_actions.py`):
```python
class BookingActionHandler(BaseActionHandler):
    """
    Handles booking-related intents.

    Actions:
    - Create new booking
    - Check availability
    - Calculate pricing
    - Confirm booking
    """

    async def handle(self, intent_result, message, conversation):
        if intent_result.intent == "booking.new":
            return await self._create_booking(intent_result.entities)
        elif intent_result.intent == "booking.check_availability":
            return await self._check_availability(intent_result.entities)
```

**Integration**: Action handlers interact with:
- Hotel PMS systems (create bookings)
- CRM systems (create leads)
- Payment gateways (process payments)
- Email services (send confirmations)

### Automation Workflow

```
Customer: "I want to book a room for April 15-18"
    ↓
Intent Detector:
  Intent: booking.new
  Entities: {check_in: "2026-04-15", check_out: "2026-04-18"}
  Confidence: 0.97
    ↓
Intent Classifier:
  Category: automatable
  Handler: booking_actions
  Requires clarification: room_type
    ↓
Action Router → Booking Handler
    ↓
Booking Handler:
  - Check availability via PMS API
  - If available → ask for room preference
  - If not available → suggest alternatives
    ↓
Response: "We have availability! Would you prefer a Standard or Deluxe room?"
    ↓
Customer selects → Complete booking → Send confirmation
```

### Database Models

**intent_log**:
```sql
CREATE TABLE intent_log (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    message_id UUID NOT NULL,

    intent VARCHAR(100) NOT NULL,
    confidence DECIMAL(5,4),
    entities JSONB,

    classification VARCHAR(50),      -- automatable, ai_assisted, human_required
    handler_used VARCHAR(100),       -- which handler processed it

    created_at TIMESTAMP DEFAULT NOW()
);
```

**action_log**:
```sql
CREATE TABLE action_log (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    intent_log_id UUID NOT NULL,

    action_type VARCHAR(100),        -- create_booking, send_email, etc.
    action_status VARCHAR(50),       -- success, failed, pending
    action_result JSONB,             -- handler-specific result data

    integration_used VARCHAR(100),   -- pms, crm, payment_gateway
    execution_time_ms INTEGER,

    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. AI Intelligence Layer Improvements

### Overview

Enhanced AI services with:
- Unified LLM client (support OpenAI, Anthropic, etc.)
- Centralized prompt management
- RAG pipeline for knowledge base
- Conversation analysis

### Module Structure

```
services/ai/
├── llm_client.py                # Multi-provider LLM client
├── prompt_manager.py            # Centralized prompt templates
├── conversation_analyzer.py     # Analyze conversation patterns
├── embedder.py                  # Text embedding service
│
├── rag/
│   ├── rag_pipeline.py         # RAG orchestration
│   ├── retriever.py            # Vector search
│   └── vector_store.py         # Pinecone/Weaviate integration
│
└── prompt_templates/
    ├── copilot_prompts.py      # Copilot prompts
    ├── translation_prompts.py  # Translation prompts
    ├── intent_prompts.py       # Intent detection prompts
    └── summary_prompts.py      # Conversation summary prompts
```

### Key Enhancements

#### **LLM Client** (`llm_client.py`)
```python
class LLMClient:
    """
    Unified LLM client supporting multiple providers.

    Supported:
    - OpenAI (GPT-4, GPT-4o-mini)
    - Anthropic (Claude 3.5 Sonnet, Claude 3 Haiku)
    - Custom models via API
    """

    async def completion(
        self,
        prompt: str,
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> LLMResponse:
        """Unified completion interface."""
```

#### **Prompt Manager** (`prompt_manager.py`)
```python
class PromptManager:
    """
    Centralized prompt template management.

    Benefits:
    - Version control for prompts
    - A/B testing different prompts
    - Reusable prompt components
    - Prompt caching optimization
    """

    def get_prompt(
        self,
        template_name: str,
        variables: Dict[str, str]
    ) -> str:
        """Load and render prompt template."""
```

#### **RAG Pipeline** (`rag/rag_pipeline.py`)
```python
class RAGPipeline:
    """
    Retrieval-Augmented Generation for knowledge base queries.

    Workflow:
    1. Embed user question
    2. Retrieve relevant knowledge base articles
    3. Pass to LLM with context
    4. Generate informed response
    """

    async def query(
        self,
        question: str,
        conversation_context: ConversationContext,
        top_k: int = 5
    ) -> RAGResponse:
        """
        Returns:
            RAGResponse with:
            - answer: Generated answer
            - sources: Retrieved articles
            - confidence: Answer confidence
        """
```

**Vector Store Integration**: Support for:
- Pinecone (managed, scalable)
- Weaviate (open-source, self-hosted)
- Qdrant (high-performance, Rust-based)

---

## 6. Integration Framework

### Overview

Extensible integration system for connecting with external platforms:
- CRM systems (Salesforce, HubSpot, Zoho)
- Hotel PMS (Opera, Mews, Cloudbeds)
- Messaging platforms (WhatsApp, Telegram, Messenger)

### Module Structure

```
services/integrations/
├── integration_hub.py           # Central integration manager
├── webhook_handler.py           # Process incoming webhooks
│
├── crm/
│   ├── salesforce.py           # Salesforce integration
│   ├── hubspot.py              # HubSpot integration
│   └── zoho.py                 # Zoho CRM integration
│
├── hotel_pms/
│   ├── opera.py                # Oracle Opera PMS
│   ├── mews.py                 # Mews PMS
│   └── cloudbeds.py            # Cloudbeds PMS
│
└── messaging/
    ├── whatsapp.py             # WhatsApp Business API
    ├── telegram.py             # Telegram integration
    └── messenger.py            # Facebook Messenger
```

### Component Responsibilities

#### **Integration Hub** (`integration_hub.py`)
```python
class IntegrationHub:
    """
    Central manager for all integrations.

    Features:
    - Register integrations per tenant
    - Store credentials securely
    - Health check integrations
    - Rate limiting per integration
    """

    async def register_integration(
        self,
        tenant_id: str,
        integration_type: str,
        config: Dict
    ):
        """Register new integration for tenant."""

    async def execute_action(
        self,
        tenant_id: str,
        integration_type: str,
        action: str,
        params: Dict
    ) -> IntegrationResult:
        """Execute action on integrated system."""
```

#### **Webhook Handler** (`webhook_handler.py`)
```python
class WebhookHandler:
    """
    Process incoming webhooks from integrated systems.

    Supported Webhooks:
    - WhatsApp: Incoming messages
    - Salesforce: Lead updates
    - PMS: Booking confirmations
    """

    async def handle_webhook(
        self,
        integration_type: str,
        payload: Dict,
        signature: str
    ):
        """Verify signature and process webhook."""
```

#### **WhatsApp Integration** (`messaging/whatsapp.py`)
```python
class WhatsAppIntegration:
    """
    WhatsApp Business API integration.

    Features:
    - Send/receive messages
    - Media support (images, documents)
    - Message templates
    - Webhook verification
    """

    async def send_message(
        self,
        to: str,
        message: str,
        tenant_id: str
    ):
        """Send WhatsApp message."""

    async def handle_incoming_message(
        self,
        webhook_payload: Dict
    ) -> Message:
        """Process incoming WhatsApp message."""
```

### Database Model: `integrations`

```sql
CREATE TABLE integrations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    integration_type VARCHAR(50) NOT NULL,  -- salesforce, whatsapp, opera
    integration_name VARCHAR(255),          -- Custom name

    config JSONB NOT NULL,                  -- API keys, credentials (encrypted)
    is_active BOOLEAN DEFAULT TRUE,

    last_sync_at TIMESTAMP,
    last_error TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX idx_integrations_type ON integrations(integration_type);
```

---

## 7. Observability and Monitoring

### Overview

Production-grade observability with structured logging, metrics, and distributed tracing.

### Module Structure

```
services/observability/
├── logging_service.py           # Structured JSON logging
├── metrics_collector.py         # Prometheus/StatsD metrics
└── tracing_service.py           # OpenTelemetry distributed tracing
```

### Component Responsibilities

#### **Logging Service** (`logging_service.py`)
```python
class LoggingService:
    """
    Structured JSON logging with context propagation.

    Features:
    - JSON formatted logs (Elasticsearch-ready)
    - Correlation IDs for request tracing
    - Tenant context in every log
    - Log levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
    """

    def log(
        self,
        level: str,
        message: str,
        tenant_id: str = None,
        user_id: str = None,
        **kwargs
    ):
        """
        Output:
        {
            "timestamp": "2026-03-15T10:30:00Z",
            "level": "INFO",
            "message": "Translation completed",
            "tenant_id": "uuid",
            "user_id": "uuid",
            "correlation_id": "abc123",
            "source_lang": "es",
            "target_lang": "en",
            "duration_ms": 450
        }
        """
```

#### **Metrics Collector** (`metrics_collector.py`)
```python
class MetricsCollector:
    """
    Collect and export metrics to Prometheus.

    Metrics:
    - Translation latency (histogram)
    - AI suggestion acceptance rate (counter)
    - WebSocket connections (gauge)
    - Intent detection accuracy (counter)
    - API request rate (counter)
    - Cache hit rate (gauge)
    """

    def record_translation_latency(self, duration_ms: int):
        """Record translation duration."""

    def increment_suggestion_accepted(self, tenant_id: str):
        """Track copilot suggestion acceptance."""

    def set_websocket_connections(self, count: int):
        """Current WebSocket connection count."""
```

#### **Tracing Service** (`tracing_service.py`)
```python
class TracingService:
    """
    OpenTelemetry distributed tracing.

    Traces:
    - Full request lifecycle
    - Translation pipeline steps
    - Database queries
    - External API calls
    """

    @trace_span("translate_message")
    async def trace_translation(
        self,
        message_id: str,
        source_lang: str,
        target_lang: str
    ):
        """Trace translation with spans."""
```

### Monitoring Stack

```yaml
# infrastructure/monitoring/prometheus/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'conversia-backend'
    static_configs:
      - targets: ['backend:8000']
```

**Grafana Dashboards**:
- Translation performance
- AI copilot metrics
- WebSocket connections
- Intent detection accuracy
- Multi-tenant usage stats

---

## 8. Analytics and AI Training Data

### Overview

Collect data for analytics and future AI model training.

### Key Entities

#### **ai_suggestions** (Already defined in Copilot section)

Track:
- Suggestion acceptance rate
- Edit distance (how much agents modify suggestions)
- Most accepted suggestion types
- Agent-specific performance

#### **analytics_event**

```sql
CREATE TABLE analytics_event (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,   -- message_sent, copilot_used, intent_detected
    event_data JSONB,
    user_id UUID,
    conversation_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analytics_tenant_type ON analytics_event(tenant_id, event_type);
CREATE INDEX idx_analytics_created ON analytics_event(created_at DESC);
```

**Analytics Use Cases**:
- Daily active users (DAU)
- Messages per conversation
- Translation usage by language
- Copilot acceptance rate over time
- Intent detection accuracy
- Agent response time

**AI Training Data**:
- Collect accepted AI suggestions for fine-tuning
- Store conversation summaries for training
- Track translation corrections for model improvement

---

## 9. Multi-Tenant Architecture Validation

### Tenant Isolation Strategy

#### **Tenant Context Middleware** (`middleware/tenant_context.py`)
```python
class TenantContextMiddleware:
    """
    Extract tenant_id from JWT and inject into request context.

    Flow:
    1. Extract JWT from Authorization header
    2. Decode token to get tenant_id
    3. Inject into request.state.tenant_id
    4. All services use request.state.tenant_id
    """

    async def __call__(self, request: Request, call_next):
        token = request.headers.get("Authorization")
        tenant_id = self.extract_tenant_id(token)
        request.state.tenant_id = tenant_id
        response = await call_next(request)
        return response
```

#### **Base Model** (`db/models/base_model.py`)
```python
class TenantBaseModel(Base):
    """
    Base model with tenant_id for all entities.

    All models inherit from this to ensure tenant isolation.
    """
    __abstract__ = True

    tenant_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        nullable=False,
        index=True
    )
```

#### **Database Queries**
All queries automatically filtered by tenant_id:
```python
# Bad (not tenant-isolated):
conversation = db.query(Conversation).filter(Conversation.id == id).first()

# Good (tenant-isolated):
conversation = db.query(Conversation).filter(
    Conversation.id == id,
    Conversation.tenant_id == request.state.tenant_id
).first()
```

#### **Tenant Model** (`db/models/tenant.py`)
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE,      -- acme.conversia.com
    plan VARCHAR(50),                    -- starter, professional, enterprise
    is_active BOOLEAN DEFAULT TRUE,

    -- Limits
    max_agents INTEGER DEFAULT 10,
    max_conversations INTEGER DEFAULT 1000,

    -- Features
    features JSONB,                      -- {"copilot": true, "integrations": ["whatsapp"]}

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Multi-Tenant Checklist

- [x] All models include `tenant_id`
- [x] Middleware extracts tenant from JWT
- [x] Database queries filtered by tenant
- [x] Redis keys include tenant_id: `cache:{tenant_id}:translation:{hash}`
- [x] WebSocket connections isolated by tenant
- [x] Analytics aggregated per tenant
- [x] Integrations scoped to tenant
- [x] Rate limiting per tenant
- [x] Tenant-level feature flags

---

## Architectural Principles

### 1. **Separation of Concerns**
- Each service has a single responsibility
- Clear boundaries between layers (API, Services, Data)

### 2. **Dependency Injection**
- Services are injected, not instantiated directly
- Easier testing and swapping implementations

### 3. **Scalability**
- Horizontal scaling via Redis Pub/Sub for WebSocket
- Stateless services (all state in database/Redis)
- Connection pooling for database and Redis

### 4. **Observability**
- Structured logging for debugging
- Metrics for performance monitoring
- Distributed tracing for complex flows

### 5. **Extensibility**
- Plugin architecture for integrations
- Abstract base classes for action handlers
- Configurable prompt templates

### 6. **Security**
- Multi-tenant data isolation
- JWT authentication
- Encrypted integration credentials
- Rate limiting per tenant

---

## Phase 3 Readiness Confirmation

### ✅ Architecture Review Complete

The enhanced architecture is **ready for Phase 3: Database Schema Design**.

### What's Next (Phase 3)

1. **Define complete database schema** with:
   - All tables with columns, types, constraints
   - Foreign key relationships
   - Indexes for performance
   - Partitioning strategy for large tables

2. **Create Alembic migrations** for:
   - Initial schema
   - Indexes
   - Constraints
   - Seed data

3. **Validate schema** against:
   - Multi-tenant requirements
   - Performance requirements
   - Data integrity rules

### Architecture Improvements Summary

| Area | Original | Enhanced |
|------|----------|----------|
| AI Services | Basic translation | Copilot, RAG, contextual translation |
| Real-time | WebSocket chat | Presence, typing, message dispatcher |
| Automation | None | Intent detection, action routing |
| Integrations | None | CRM, PMS, WhatsApp framework |
| Observability | Basic logging | Structured logs, metrics, tracing |
| Multi-tenancy | Not considered | Full tenant isolation |
| Analytics | None | Event tracking, AI training data |

### Key Metrics (Expected)

- **Translation Latency**: < 1.5s (uncached), < 50ms (cached)
- **Copilot Suggestion Generation**: < 2s for 3 suggestions
- **WebSocket RTT**: < 200ms end-to-end
- **Intent Detection Accuracy**: > 85%
- **Cache Hit Rate**: > 70%
- **Concurrent WebSocket Connections**: 1000+ per server

---

## Conclusion

The Conversia architecture is now **production-ready** with:

✅ Modular, scalable services
✅ Multi-tenant SaaS support
✅ AI copilot for agent assistance
✅ Multilingual translation pipeline
✅ Intent detection and automation
✅ Integration framework
✅ Observability infrastructure
✅ Analytics and AI training pipeline

**Status**: Ready to proceed to **Phase 3: Database Schema Design**.
