# Conversia - Final Architecture Review & Refinements

**Date**: 2026-03-15
**Version**: 3.0 - Production-Ready Architecture
**Status**: Final Review - Pre-Phase 3

---

## Executive Summary

This document presents the **final architectural refinements** for Conversia before Phase 3 (Database Schema Design). It addresses structural concerns, clarifies module boundaries, and establishes patterns to prevent technical debt.

### Refinements Applied

1. ✅ **Automation vs Workflows** - Clear separation of concerns
2. ✅ **Canonical Message Model** - Immutable original + derived artifacts
3. ✅ **Policy Engine** - AI governance and compliance layer
4. ✅ **Conversation Lifecycle** - Explicit state machine
5. ✅ **Customer Identity Resolution** - Cross-channel identity merging
6. ✅ **Configuration Versioning** - Audit trail for all configurable components
7. ✅ **Performance SLOs** - Documented latency targets
8. ✅ **Observability Correlation** - Standardized correlation IDs
9. ✅ **Fallback Strategies** - Graceful degradation for dependencies
10. ✅ **AI Feedback Loop** - Enhanced copilot feedback tracking

---

## 1. Automation vs Workflows - Clarified Boundaries

### Problem

Current architecture has potential overlap between:
- `services/automation/` - Intent detection and action routing
- `services/workflows/` - Workflow orchestration

This creates confusion about where logic should live.

### Solution: Clear Separation of Concerns

#### **Workflows Module** = Declarative Rules Engine (WHAT)

**Responsibilities:**
- Load and manage tenant-defined workflow rules
- Evaluate trigger conditions (language, intent, sentiment, etc.)
- **Decide** which actions should execute
- **Delegate** action execution to automation layer
- Track workflow execution for analytics

**What it does NOT do:**
- Execute actions directly
- Call queue manager, message service, or integrations
- Implement business logic

#### **Automation Module** = Action Execution Layer (HOW)

**Responsibilities:**
- Provide reusable action handlers
- Execute actions triggered by workflows OR direct API calls
- Interface with external systems (PMS, CRM, payment gateways)
- Handle action-specific business logic
- Return execution results

**What it does NOT do:**
- Decide when to execute (workflows decide)
- Evaluate conditions (workflows evaluate)

### Architectural Pattern

```
┌─────────────────────────────────────────────────────────┐
│                    WORKFLOW ENGINE                       │
│  (Declarative - WHAT should happen)                     │
│                                                          │
│  1. Load workflow: "Spanish VIP Booking"                │
│  2. Evaluate conditions:                                │
│     ✓ language = "es" → TRUE                            │
│     ✓ customer_type = "vip" → TRUE                      │
│  3. Decide actions to execute:                          │
│     → send_auto_reply                                   │
│     → route_to_queue                                    │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ Delegates to ↓
                   │
┌──────────────────▼──────────────────────────────────────┐
│                AUTOMATION LAYER                          │
│  (Imperative - HOW to execute)                          │
│                                                          │
│  ActionDispatcher.execute():                            │
│    → SendAutoReplyAction.execute()                      │
│       ├─ MessageService.send_message()                  │
│       └─ Translation.translate()                        │
│                                                          │
│    → RouteToQueueAction.execute()                       │
│       ├─ QueueManager.enqueue_conversation()            │
│       ├─ PriorityRouter.classify_priority()             │
│       └─ AssignmentEngine.process_queue()               │
└─────────────────────────────────────────────────────────┘
```

### Refactored Module Structure

```
services/workflows/
├── workflow_engine.py              # Load, manage, trigger workflows
├── workflow_executor.py            # Evaluate conditions, delegate actions
├── rule_parser.py                  # Parse JSON → executable
├── condition_evaluator.py          # Boolean logic evaluation
└── action_delegator.py             # 🔄 RENAMED: Delegates to automation layer

services/automation/
├── action_dispatcher.py            # Central action executor
├── intent_detector.py              # Detect customer intent
├── intent_classifier.py            # Classify intent category
│
└── action_handlers/                # Reusable action implementations
    ├── base_handler.py
    ├── messaging_actions.py        # Send messages, auto-replies
    ├── routing_actions.py          # Queue routing, assignment
    ├── integration_actions.py      # Webhook, CRM, PMS calls
    ├── escalation_actions.py       # Escalate to supervisor
    └── conversation_actions.py     # Update metadata, priority
```

### Example: Workflow Calling Automation

```python
# services/workflows/action_delegator.py

class ActionDelegator:
    """
    Delegates workflow actions to automation layer.

    Workflows define WHAT to do.
    Automation defines HOW to do it.
    """

    def __init__(self):
        # Import automation action dispatcher
        from services.automation.action_dispatcher import ActionDispatcher
        self.action_dispatcher = ActionDispatcher()

    async def delegate(
        self,
        action_def: Dict,
        event_data: Dict,
        tenant_id: str
    ) -> ActionResult:
        """
        Delegate action execution to automation layer.

        Args:
            action_def: Action definition from workflow
            event_data: Conversation/message context
            tenant_id: Tenant identifier

        Returns:
            ActionResult from automation layer
        """

        # Automation layer executes the actual action
        result = await self.action_dispatcher.execute(
            action_type=action_def["type"],
            params=action_def["params"],
            context=event_data,
            tenant_id=tenant_id
        )

        return result
```

### Benefits

✅ **Clear Separation**: Workflows = business rules, Automation = execution
✅ **Reusability**: Automation actions can be called by workflows OR direct API
✅ **Testability**: Test workflow logic separately from action implementation
✅ **Maintainability**: Change action implementation without modifying workflows

---

## 2. Canonical Message Model

### Problem

Multilingual conversations require tracking:
- Original message
- Translations
- Normalized text
- AI suggestions
- Sentiment analysis

Without a clear model, data gets duplicated or lost.

### Solution: Immutable Original + Derived Artifacts

### Core Principle

**The original message is NEVER modified or overwritten.**

All translations, normalizations, and AI-generated content are stored as **separate derived artifacts** linked to the original message.

### Data Model

```
┌─────────────────────────────────────────────────────────┐
│                 MESSAGE (Canonical)                      │
│  Immutable - Original customer/agent message            │
├─────────────────────────────────────────────────────────┤
│  id: UUID                                               │
│  conversation_id: UUID                                  │
│  sender_id: UUID                                        │
│  sender_type: ENUM (customer, agent, system, ai)       │
│  original_text: TEXT  ← IMMUTABLE                       │
│  detected_language: VARCHAR(10)                         │
│  sent_at: TIMESTAMP                                     │
│  metadata: JSONB                                        │
└─────────────────────────────────────────────────────────┘
                           │
                           │ 1:N relationships
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Translations │  │   Metadata   │  │ AI Artifacts │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Derived Artifacts

#### 1. **message_translations**

```sql
CREATE TABLE message_translations (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL,
    target_language VARCHAR(10) NOT NULL,

    -- Translation result
    translated_text TEXT NOT NULL,
    translation_source VARCHAR(50),     -- llm, cache, api
    translation_confidence DECIMAL(5, 4),

    -- Performance
    translation_time_ms INTEGER,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(message_id, target_language),
    FOREIGN KEY (message_id) REFERENCES messages(id)
);
```

**Purpose**: Store translations without modifying original message

#### 2. **message_metadata**

```sql
CREATE TABLE message_metadata (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL,

    -- AI analysis
    sentiment VARCHAR(20),              -- positive, neutral, negative
    sentiment_score DECIMAL(5, 4),

    detected_intent VARCHAR(100),
    intent_confidence DECIMAL(5, 4),

    detected_entities JSONB,            -- dates, names, order IDs

    -- Normalization
    normalized_text TEXT,               -- Grammar-corrected version

    -- Classification
    is_question BOOLEAN,
    urgency_level VARCHAR(20),

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(message_id),
    FOREIGN KEY (message_id) REFERENCES messages(id)
);
```

**Purpose**: Store AI-detected metadata without polluting message table

#### 3. **message_suggestions** (AI Copilot)

```sql
CREATE TABLE message_suggestions (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL,           -- Triggered by this message
    agent_id UUID NOT NULL,

    suggestion_text TEXT NOT NULL,
    suggestion_rank INTEGER,            -- 1, 2, 3, etc.
    suggestion_tone VARCHAR(50),        -- professional, friendly, empathetic

    -- Feedback (NEW: Enhanced tracking)
    feedback_type VARCHAR(50),          -- accepted_without_edits, accepted_with_edits, etc.
    edit_distance INTEGER,              -- Levenshtein distance if edited
    final_sent_text TEXT,               -- What agent actually sent

    created_at TIMESTAMP DEFAULT NOW(),
    feedback_at TIMESTAMP,

    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (agent_id) REFERENCES users(id)
);
```

**Purpose**: Track AI suggestions separately from actual messages

### Message Flow

```
1. Customer sends: "Hola, necesito una habitación"
   ↓
   CREATE messages:
     original_text: "Hola, necesito una habitación"
     detected_language: "es"

2. Translation for agent (preferred language: en)
   ↓
   CREATE message_translations:
     message_id: [original message]
     target_language: "en"
     translated_text: "Hello, I need a room"

3. AI analysis
   ↓
   CREATE message_metadata:
     message_id: [original message]
     sentiment: "neutral"
     detected_intent: "booking.inquiry"
     normalized_text: "Hola, necesito una habitación."

4. AI generates suggestions for agent
   ↓
   CREATE message_suggestions:
     message_id: [original message]
     suggestion_text: "I'd be happy to help..."
     suggestion_rank: 1
```

### Conversation History Rendering

```python
# services/conversations/conversation_service.py

async def get_conversation_messages(
    self,
    conversation_id: str,
    viewer_language: str = "en"
) -> List[MessageView]:
    """
    Get conversation messages with translations for viewer.

    Returns:
        List of messages with:
        - Original text
        - Translation to viewer's language
        - Metadata (sentiment, intent)
        - AI suggestions (if agent)
    """

    messages = await self.db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).all()

    message_views = []

    for message in messages:
        # Get translation for viewer
        translation = await self._get_translation(
            message_id=message.id,
            target_language=viewer_language
        )

        # Get metadata
        metadata = await self._get_metadata(message.id)

        message_views.append(MessageView(
            id=message.id,
            original_text=message.original_text,
            original_language=message.detected_language,
            translated_text=translation.translated_text if translation else None,
            sender_type=message.sender_type,
            sentiment=metadata.sentiment if metadata else None,
            sent_at=message.sent_at
        ))

    return message_views
```

### Benefits

✅ **Data Integrity**: Original message never modified
✅ **Audit Trail**: Full translation and analysis history
✅ **Performance**: Translations cached and reused
✅ **Flexibility**: Add new derived artifacts without schema changes

---

## 3. Policy Engine - AI Governance Layer

### Problem

Without governance policies:
- AI may respond when it shouldn't (sensitive topics, legal issues)
- PII may be logged or sent to external services
- Compliance violations (GDPR, HIPAA) may occur
- Escalation to humans may be delayed

### Solution: Policy Engine

New module: `services/policies/`

### Policy Engine Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    POLICY ENGINE                         │
│  Enforces governance rules before actions               │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│AI Response  │ │ Escalation  │ │    PII      │
│   Policy    │ │   Policy    │ │  Detection  │
└─────────────┘ └─────────────┘ └─────────────┘
        │          │          │
        └──────────┼──────────┘
                   ▼
        Applied BEFORE:
        • AI sends response
        • Workflow executes
        • External integration called
        • Message logged
```

### Module Structure

```
services/policies/
├── __init__.py
├── policy_engine.py                # Central policy orchestrator
├── ai_response_policy.py           # Can AI respond automatically?
├── escalation_policy.py            # When to escalate to human?
├── pii_policy.py                   # Detect and redact PII
├── compliance_policy.py            # Tenant-specific compliance rules
├── content_moderation_policy.py    # Detect inappropriate content
│
└── detectors/
    ├── pii_detector.py             # Email, phone, SSN, credit card detection
    ├── topic_detector.py           # Legal, medical, financial topics
    └── sentiment_threshold.py      # Extreme negative sentiment
```

### Policy Checks

#### 1. **AI Response Policy**

```python
# services/policies/ai_response_policy.py

class AIResponsePolicy:
    """
    Determines whether AI may respond automatically.

    Blocks AI responses for:
    - Legal questions
    - Medical advice
    - Financial decisions
    - Sensitive customer complaints
    - Topics outside knowledge base
    """

    async def can_ai_respond(
        self,
        message: Message,
        conversation: Conversation,
        intent: IntentResult,
        tenant_config: TenantConfig
    ) -> PolicyDecision:
        """
        Check if AI is allowed to respond.

        Returns:
            PolicyDecision with:
            - allowed: bool
            - reason: str
            - alternative_action: str (escalate_to_human, request_clarification)
        """

        # Check 1: Blocked topics
        blocked_topics = ["legal", "medical", "financial_advice"]
        if intent.topic in blocked_topics:
            return PolicyDecision(
                allowed=False,
                reason=f"Blocked topic: {intent.topic}",
                alternative_action="escalate_to_human"
            )

        # Check 2: Low confidence
        if intent.confidence < tenant_config.min_ai_confidence:
            return PolicyDecision(
                allowed=False,
                reason=f"Low confidence: {intent.confidence}",
                alternative_action="escalate_to_human"
            )

        # Check 3: Customer explicitly requests human
        human_request_keywords = ["speak to agent", "human", "representative"]
        if any(kw in message.original_text.lower() for kw in human_request_keywords):
            return PolicyDecision(
                allowed=False,
                reason="Customer requested human agent",
                alternative_action="escalate_to_human"
            )

        # Check 4: Tenant policy
        if not tenant_config.ai_auto_response_enabled:
            return PolicyDecision(
                allowed=False,
                reason="Tenant disabled AI auto-response",
                alternative_action="escalate_to_human"
            )

        # Allow AI response
        return PolicyDecision(
            allowed=True,
            reason="All policy checks passed"
        )
```

#### 2. **PII Detection Policy**

```python
# services/policies/pii_policy.py

class PIIPolicy:
    """
    Detects and redacts personally identifiable information.

    Detects:
    - Email addresses
    - Phone numbers
    - Social Security Numbers
    - Credit card numbers
    - Passport numbers
    - Physical addresses
    """

    async def scan_and_redact(
        self,
        text: str,
        redaction_mode: str = "mask"  # mask, remove, encrypt
    ) -> PIIResult:
        """
        Scan text for PII and apply redaction.

        Returns:
            PIIResult with:
            - pii_detected: bool
            - pii_types: List[str]
            - redacted_text: str
            - entities_found: List[PIIEntity]
        """

        entities_found = []
        redacted_text = text

        # Detect emails
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, text)
        if emails:
            entities_found.append(PIIEntity(
                type="email",
                value=emails,
                positions=...
            ))
            redacted_text = re.sub(email_pattern, "[EMAIL_REDACTED]", redacted_text)

        # Detect credit cards (Luhn algorithm)
        cc_pattern = r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'
        credit_cards = re.findall(cc_pattern, text)
        if credit_cards:
            entities_found.append(PIIEntity(
                type="credit_card",
                value=credit_cards,
                positions=...
            ))
            redacted_text = re.sub(cc_pattern, "[CARD_REDACTED]", redacted_text)

        # ... more detectors

        return PIIResult(
            pii_detected=len(entities_found) > 0,
            pii_types=[e.type for e in entities_found],
            redacted_text=redacted_text,
            entities_found=entities_found
        )
```

#### 3. **Escalation Policy**

```python
# services/policies/escalation_policy.py

class EscalationPolicy:
    """
    Determines when to escalate conversation to human.

    Escalation triggers:
    - Customer dissatisfaction (negative sentiment)
    - AI unable to resolve after N turns
    - Sensitive topics detected
    - Customer explicitly requests human
    - SLA approaching breach
    """

    async def should_escalate(
        self,
        conversation: Conversation,
        latest_message: Message,
        metadata: MessageMetadata
    ) -> EscalationDecision:
        """
        Check if conversation should be escalated.

        Returns:
            EscalationDecision with:
            - should_escalate: bool
            - urgency: low/medium/high/critical
            - reason: str
            - recommended_queue: str
        """

        # Check 1: Negative sentiment streak
        if await self._has_negative_sentiment_streak(conversation, threshold=3):
            return EscalationDecision(
                should_escalate=True,
                urgency="high",
                reason="Customer frustrated - 3+ negative messages",
                recommended_queue="customer_support_queue"
            )

        # Check 2: AI failed to resolve
        ai_turn_count = await self._count_ai_turns(conversation)
        if ai_turn_count >= 5:  # 5 AI responses without resolution
            return EscalationDecision(
                should_escalate=True,
                urgency="medium",
                reason="AI unable to resolve after 5 turns",
                recommended_queue="specialist_queue"
            )

        # Check 3: Sensitive topic
        if metadata.detected_intent in ["complaint.escalation", "refund.request"]:
            return EscalationDecision(
                should_escalate=True,
                urgency="medium",
                reason="Sensitive topic detected",
                recommended_queue="escalations_queue"
            )

        # No escalation needed
        return EscalationDecision(
            should_escalate=False,
            reason="No escalation triggers"
        )
```

### Policy Enforcement Points

```python
# BEFORE AI responds
policy_decision = await ai_response_policy.can_ai_respond(
    message, conversation, intent, tenant_config
)
if not policy_decision.allowed:
    # Escalate to human instead
    await escalate_to_human(conversation, reason=policy_decision.reason)
    return

# BEFORE logging message
pii_result = await pii_policy.scan_and_redact(message.text)
if pii_result.pii_detected:
    # Store redacted version in logs
    log_text = pii_result.redacted_text
    # Flag conversation for compliance review
    await flag_for_compliance_review(conversation)

# BEFORE workflow execution
compliance_check = await compliance_policy.validate_workflow(
    workflow, conversation, tenant
)
if not compliance_check.compliant:
    # Block workflow execution
    raise ComplianceViolation(compliance_check.reason)

# BEFORE external integration
if tenant.gdpr_enabled:
    # Ensure customer consented to data sharing
    consent = await check_customer_consent(customer_id, integration_type)
    if not consent:
        raise ConsentRequired("Customer has not consented to data sharing")
```

### Benefits

✅ **Safety**: Prevents AI from handling sensitive topics
✅ **Compliance**: Enforces GDPR, HIPAA, PCI-DSS requirements
✅ **Privacy**: Redacts PII before logging
✅ **Quality**: Escalates when AI is uncertain
✅ **Trust**: Customers get human help when needed

---

## 4. Conversation Lifecycle - Explicit State Machine

### Problem

Current architecture lacks explicit conversation states, making it difficult to:
- Track conversation progress
- Calculate metrics (time in queue, time to resolution)
- Handle edge cases (reopening, transfers, escalations)

### Solution: Explicit State Machine

### Conversation States

```
┌─────────┐
│   NEW   │ ← Conversation created
└────┬────┘
     │
     ├─────────────┐
     │             │
     ▼             ▼
┌───────────┐ ┌─────────┐
│AI_HANDLING│ │ QUEUED  │ ← Waiting for agent
└─────┬─────┘ └────┬────┘
      │            │
      │            ▼
      │       ┌─────────┐
      │       │ASSIGNED │ ← Agent assigned
      │       └────┬────┘
      │            │
      │            ▼
      │       ┌────────────┐
      └──────▶│IN_PROGRESS │ ← Agent actively responding
              └────┬───────┘
                   │
         ┌─────────┼─────────┬──────────┐
         │         │         │          │
         ▼         ▼         ▼          ▼
    ┌─────────┐ ┌─────┐ ┌────────┐ ┌─────────┐
    │ESCALATED│ │IDLE │ │RESOLVED│ │CANCELLED│
    └────┬────┘ └──┬──┘ └───┬────┘ └─────────┘
         │         │        │
         └────┬────┘        │
              │             │
              └─────┬───────┘
                    │
                    ▼
              ┌──────────┐
              │ REOPENED │ ← Customer replies after resolution
              └──────────┘
```

### State Definitions

| State | Description | Allowed Transitions |
|-------|-------------|---------------------|
| **NEW** | Conversation just created | → AI_HANDLING, QUEUED |
| **AI_HANDLING** | AI is responding automatically | → QUEUED, IN_PROGRESS, RESOLVED |
| **QUEUED** | Waiting for agent assignment | → ASSIGNED, CANCELLED |
| **ASSIGNED** | Assigned to agent, not yet active | → IN_PROGRESS, QUEUED (reassignment) |
| **IN_PROGRESS** | Agent actively responding | → ESCALATED, IDLE, RESOLVED |
| **IDLE** | Waiting for customer response | → IN_PROGRESS, RESOLVED, REOPENED |
| **ESCALATED** | Escalated to supervisor/specialist | → IN_PROGRESS, RESOLVED |
| **RESOLVED** | Successfully closed | → REOPENED |
| **REOPENED** | Customer replied after resolution | → QUEUED, AI_HANDLING |
| **CANCELLED** | Conversation abandoned/cancelled | (terminal state) |

### State Transitions

```python
# services/conversations/conversation_lifecycle.py

class ConversationLifecycle:
    """
    Manages conversation state transitions.

    Ensures valid state transitions and tracks history.
    """

    async def transition_state(
        self,
        conversation_id: str,
        new_state: ConversationState,
        actor_id: str,
        reason: str = None
    ) -> StateTransition:
        """
        Transition conversation to new state.

        Args:
            conversation_id: Conversation ID
            new_state: Target state
            actor_id: User/system triggering transition
            reason: Optional reason for transition

        Returns:
            StateTransition with timestamp and metadata

        Raises:
            InvalidStateTransition if transition not allowed
        """

        conversation = await self._get_conversation(conversation_id)
        current_state = conversation.state

        # Validate transition
        if not self._is_valid_transition(current_state, new_state):
            raise InvalidStateTransition(
                f"Cannot transition from {current_state} to {new_state}"
            )

        # Update conversation state
        old_state = conversation.state
        conversation.state = new_state
        conversation.state_updated_at = datetime.utcnow()

        # Create state history record
        state_history = ConversationStateHistory(
            conversation_id=conversation_id,
            from_state=old_state,
            to_state=new_state,
            actor_id=actor_id,
            reason=reason,
            transitioned_at=datetime.utcnow()
        )

        self.db.add(state_history)
        await self.db.commit()

        # Trigger state-specific actions
        await self._on_state_entered(conversation, new_state)

        return StateTransition(
            from_state=old_state,
            to_state=new_state,
            transitioned_at=state_history.transitioned_at
        )

    def _is_valid_transition(
        self,
        from_state: ConversationState,
        to_state: ConversationState
    ) -> bool:
        """Check if state transition is allowed."""

        valid_transitions = {
            ConversationState.NEW: [
                ConversationState.AI_HANDLING,
                ConversationState.QUEUED
            ],
            ConversationState.AI_HANDLING: [
                ConversationState.QUEUED,
                ConversationState.IN_PROGRESS,
                ConversationState.RESOLVED
            ],
            ConversationState.QUEUED: [
                ConversationState.ASSIGNED,
                ConversationState.CANCELLED
            ],
            ConversationState.ASSIGNED: [
                ConversationState.IN_PROGRESS,
                ConversationState.QUEUED  # Reassignment
            ],
            ConversationState.IN_PROGRESS: [
                ConversationState.ESCALATED,
                ConversationState.IDLE,
                ConversationState.RESOLVED
            ],
            ConversationState.IDLE: [
                ConversationState.IN_PROGRESS,
                ConversationState.RESOLVED,
                ConversationState.REOPENED
            ],
            ConversationState.ESCALATED: [
                ConversationState.IN_PROGRESS,
                ConversationState.RESOLVED
            ],
            ConversationState.RESOLVED: [
                ConversationState.REOPENED
            ],
            ConversationState.REOPENED: [
                ConversationState.QUEUED,
                ConversationState.AI_HANDLING
            ],
            ConversationState.CANCELLED: []  # Terminal state
        }

        return to_state in valid_transitions.get(from_state, [])

    async def _on_state_entered(
        self,
        conversation: Conversation,
        new_state: ConversationState
    ):
        """Execute state-specific actions."""

        if new_state == ConversationState.QUEUED:
            # Add to queue
            await self.queue_manager.enqueue_conversation(
                conversation_id=conversation.id,
                queue_id=await self._select_queue(conversation),
                priority=conversation.priority
            )

        elif new_state == ConversationState.RESOLVED:
            # Track resolution metrics
            await self.analytics.track_resolution(
                conversation_id=conversation.id,
                resolution_time=datetime.utcnow() - conversation.created_at,
                agent_id=conversation.assigned_agent_id
            )

        elif new_state == ConversationState.REOPENED:
            # Notify previously assigned agent
            if conversation.assigned_agent_id:
                await self.notification_service.notify_agent(
                    agent_id=conversation.assigned_agent_id,
                    message="Customer replied to resolved conversation",
                    conversation_id=conversation.id
                )
```

### Database Schema

```sql
-- Add state to conversations table
ALTER TABLE conversations
ADD COLUMN state VARCHAR(50) DEFAULT 'NEW',
ADD COLUMN state_updated_at TIMESTAMP;

CREATE INDEX idx_conversations_state ON conversations(state);

-- State history table
CREATE TABLE conversation_state_history (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,

    from_state VARCHAR(50) NOT NULL,
    to_state VARCHAR(50) NOT NULL,

    actor_id UUID,                      -- Who triggered transition
    actor_type VARCHAR(50),             -- agent, customer, system, ai
    reason TEXT,

    transitioned_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE INDEX idx_state_history_conversation ON conversation_state_history(conversation_id);
CREATE INDEX idx_state_history_transitioned ON conversation_state_history(transitioned_at DESC);
```

### Queue Metrics with States

```python
# Now we can calculate accurate metrics

async def get_queue_metrics(queue_id: str) -> QueueMetrics:
    """
    Calculate queue metrics using state transitions.
    """

    # Conversations currently in QUEUED state
    queued_count = await db.query(Conversation).filter(
        Conversation.queue_id == queue_id,
        Conversation.state == ConversationState.QUEUED
    ).count()

    # Average time from QUEUED → ASSIGNED
    avg_wait_time = await db.query(
        func.avg(
            ConversationStateHistory.transitioned_at -
            (SELECT transitioned_at FROM conversation_state_history
             WHERE to_state = 'QUEUED'
             AND conversation_id = ConversationStateHistory.conversation_id
             ORDER BY transitioned_at DESC LIMIT 1)
        )
    ).filter(
        ConversationStateHistory.to_state == 'ASSIGNED'
    ).scalar()

    return QueueMetrics(
        current_depth=queued_count,
        avg_wait_time=avg_wait_time,
        ...
    )
```

### Benefits

✅ **Clarity**: Explicit states make conversation status clear
✅ **Metrics**: Accurate time-in-state calculations
✅ **Validation**: Prevents invalid transitions
✅ **Audit**: Full state history for compliance
✅ **Automation**: Trigger actions on state changes

---

## 5. Customer Identity Resolution Layer

### Problem

Customers interact across multiple channels:
- Web chat
- WhatsApp
- Email
- Hotel PMS
- CRM system

Without identity resolution:
- Fragmented conversation history
- Poor AI context
- Duplicate customer records
- Lost personalization opportunities

### Solution: Customer Profile Service

New module: `services/customer_profile/`

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│            CUSTOMER IDENTITY RESOLUTION                   │
│                                                           │
│  1. Customer contacts via WhatsApp                        │
│  2. Lookup phone number in identity index                │
│  3. Find existing customer record from CRM                │
│  4. Merge identities (WhatsApp + CRM)                     │
│  5. Load unified conversation history                     │
│  6. AI has full context for personalization              │
└──────────────────────────────────────────────────────────┘
```

### Module Structure

```
services/customer_profile/
├── __init__.py
├── identity_resolver.py            # Merge identities across channels
├── profile_enricher.py             # Enrich with CRM/PMS data
├── customer_timeline.py            # Unified conversation history
└── identity_index.py               # Fast identity lookup
```

### Components

#### 1. **Identity Resolver**

```python
# services/customer_profile/identity_resolver.py

class IdentityResolver:
    """
    Resolves customer identity across multiple channels.

    Matches customers by:
    - Email address
    - Phone number
    - CRM customer ID
    - PMS guest ID
    - OAuth provider ID (Google, Facebook)
    """

    async def resolve_identity(
        self,
        identifiers: Dict[str, str],
        tenant_id: str
    ) -> Customer:
        """
        Resolve customer identity from identifiers.

        Args:
            identifiers: Dict of identifier types → values
                Example: {
                    "email": "john@example.com",
                    "phone": "+1234567890",
                    "whatsapp_id": "wa_123..."
                }
            tenant_id: Tenant identifier

        Returns:
            Unified Customer object with merged identities
        """

        # Step 1: Search for existing customer by any identifier
        customer = await self._find_by_identifiers(identifiers, tenant_id)

        if customer:
            # Step 2: Update with new identifiers
            await self._merge_identifiers(customer, identifiers)
            return customer

        # Step 3: No existing customer → create new
        customer = await self._create_customer(identifiers, tenant_id)

        return customer

    async def _find_by_identifiers(
        self,
        identifiers: Dict[str, str],
        tenant_id: str
    ) -> Optional[Customer]:
        """Find customer by any matching identifier."""

        # Check customer_identifiers table
        for identifier_type, identifier_value in identifiers.items():
            identity = await self.db.query(CustomerIdentifier).filter(
                CustomerIdentifier.identifier_type == identifier_type,
                CustomerIdentifier.identifier_value == identifier_value,
                CustomerIdentifier.tenant_id == tenant_id
            ).first()

            if identity:
                return await self._get_customer(identity.customer_id)

        return None

    async def _merge_identifiers(
        self,
        customer: Customer,
        new_identifiers: Dict[str, str]
    ):
        """Add new identifiers to existing customer."""

        for identifier_type, identifier_value in new_identifiers.items():
            # Check if identifier already exists
            existing = await self.db.query(CustomerIdentifier).filter(
                CustomerIdentifier.customer_id == customer.id,
                CustomerIdentifier.identifier_type == identifier_type
            ).first()

            if not existing:
                # Add new identifier
                new_identity = CustomerIdentifier(
                    customer_id=customer.id,
                    tenant_id=customer.tenant_id,
                    identifier_type=identifier_type,
                    identifier_value=identifier_value,
                    verified=False  # Mark for verification
                )
                self.db.add(new_identity)

        await self.db.commit()
```

#### 2. **Profile Enricher**

```python
# services/customer_profile/profile_enricher.py

class ProfileEnricher:
    """
    Enriches customer profile with data from external systems.

    Data sources:
    - CRM (Salesforce, HubSpot)
    - Hotel PMS (Opera, Mews)
    - Email provider
    - Social profiles
    """

    async def enrich_profile(
        self,
        customer: Customer
    ) -> EnrichedProfile:
        """
        Enrich customer profile with external data.

        Returns:
            EnrichedProfile with:
            - CRM data (company, deal stage, lifetime value)
            - PMS data (loyalty tier, past bookings, preferences)
            - Social data (location, interests)
        """

        enriched_data = {}

        # Enrich from CRM
        if customer.crm_id:
            crm_data = await self._fetch_from_crm(customer.crm_id)
            enriched_data["crm"] = crm_data

        # Enrich from PMS
        if customer.pms_guest_id:
            pms_data = await self._fetch_from_pms(customer.pms_guest_id)
            enriched_data["pms"] = pms_data

        # Update customer profile
        customer.enriched_data = enriched_data
        customer.last_enriched_at = datetime.utcnow()
        await self.db.commit()

        return EnrichedProfile(
            customer=customer,
            enriched_data=enriched_data
        )
```

#### 3. **Customer Timeline**

```python
# services/customer_profile/customer_timeline.py

class CustomerTimeline:
    """
    Builds unified timeline of customer interactions.

    Timeline includes:
    - All conversations across channels
    - CRM interactions (emails, calls)
    - PMS bookings and stays
    - Support tickets
    - Purchases
    """

    async def get_timeline(
        self,
        customer_id: str,
        limit: int = 50
    ) -> List[TimelineEvent]:
        """
        Get unified customer timeline.

        Returns:
            List of TimelineEvents sorted by timestamp (newest first)
        """

        events = []

        # 1. Get conversations
        conversations = await self.db.query(Conversation).filter(
            Conversation.customer_id == customer_id
        ).order_by(Conversation.created_at.desc()).limit(limit).all()

        for conv in conversations:
            events.append(TimelineEvent(
                type="conversation",
                timestamp=conv.created_at,
                channel=conv.channel,  # chat, whatsapp, email
                summary=f"Conversation via {conv.channel}",
                data=conv
            ))

        # 2. Get CRM interactions
        crm_interactions = await self._fetch_crm_interactions(customer_id)
        events.extend(crm_interactions)

        # 3. Get PMS bookings
        pms_bookings = await self._fetch_pms_bookings(customer_id)
        events.extend(pms_bookings)

        # Sort by timestamp
        events.sort(key=lambda e: e.timestamp, reverse=True)

        return events[:limit]
```

### Database Schema

```sql
-- Customer identifiers table
CREATE TABLE customer_identifiers (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,

    identifier_type VARCHAR(50) NOT NULL,   -- email, phone, crm_id, pms_id, whatsapp_id
    identifier_value VARCHAR(255) NOT NULL,

    verified BOOLEAN DEFAULT FALSE,
    primary_identifier BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(tenant_id, identifier_type, identifier_value),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX idx_customer_identifiers_lookup
ON customer_identifiers(tenant_id, identifier_type, identifier_value);

CREATE INDEX idx_customer_identifiers_customer
ON customer_identifiers(customer_id);

-- Enhanced customers table
ALTER TABLE customers
ADD COLUMN enriched_data JSONB,
ADD COLUMN last_enriched_at TIMESTAMP,
ADD COLUMN tier VARCHAR(50),               -- free, premium, vip
ADD COLUMN lifetime_value DECIMAL(10, 2);
```

### Usage Example

```python
# When customer contacts via WhatsApp

# 1. Resolve identity
identity_resolver = IdentityResolver()
customer = await identity_resolver.resolve_identity(
    identifiers={
        "phone": "+1234567890",
        "whatsapp_id": "wa_abc123"
    },
    tenant_id=tenant_id
)

# 2. Enrich profile
profile_enricher = ProfileEnricher()
enriched = await profile_enricher.enrich_profile(customer)

# 3. Get timeline for AI context
timeline = CustomerTimeline()
history = await timeline.get_timeline(customer.id)

# 4. AI now has full context
ai_context = {
    "customer_name": customer.name,
    "tier": enriched.enriched_data.get("pms", {}).get("loyalty_tier"),
    "past_bookings": len([e for e in history if e.type == "booking"]),
    "recent_conversations": [e for e in history if e.type == "conversation"][:5]
}

# AI can provide personalized response
# "Welcome back, John! I see you stayed with us in New York last month..."
```

### Benefits

✅ **Unified Identity**: Single customer view across all channels
✅ **Better AI Context**: AI knows full customer history
✅ **Personalization**: Greet returning customers, reference past interactions
✅ **No Duplicates**: Automatically merge identities
✅ **CRM Sync**: Keep customer data synchronized

---

## 6. Configuration Versioning

### Problem

Without versioning:
- Cannot track what prompt generated a specific response
- Cannot rollback bad workflow changes
- Cannot A/B test different configurations
- Cannot audit compliance issues

### Solution: Version All Configurable Components

### Versioned Components

1. **Prompt Templates**
2. **Workflow Definitions**
3. **Automation Rules**
4. **Integration Configurations**
5. **Queue Routing Policies**

### Versioning Pattern

```sql
-- Generic versioning pattern

CREATE TABLE [component]_versions (
    id UUID PRIMARY KEY,
    [component]_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    version_number INTEGER NOT NULL,

    -- Version content
    content JSONB NOT NULL,

    -- Version metadata
    is_active BOOLEAN DEFAULT FALSE,    -- Only one active version
    created_by UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    activated_at TIMESTAMP,
    deactivated_at TIMESTAMP,

    -- Changelog
    change_description TEXT,

    UNIQUE([component]_id, version_number),
    FOREIGN KEY ([component]_id) REFERENCES [components](id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

### Example: Prompt Template Versioning

```sql
CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    prompt_type VARCHAR(100) NOT NULL,  -- copilot, translation, intent, etc.

    current_version_id UUID,

    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE prompt_template_versions (
    id UUID PRIMARY KEY,
    template_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    version_number INTEGER NOT NULL,

    -- Prompt content
    system_prompt TEXT NOT NULL,
    user_prompt_template TEXT NOT NULL,
    variables JSONB,                    -- Expected variables

    -- Model configuration
    model_name VARCHAR(100),
    temperature DECIMAL(3, 2),
    max_tokens INTEGER,

    -- Version metadata
    is_active BOOLEAN DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    activated_at TIMESTAMP,
    change_description TEXT,

    UNIQUE(template_id, version_number),
    FOREIGN KEY (template_id) REFERENCES prompt_templates(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

### Usage Tracking

```sql
-- Track which version generated each output

CREATE TABLE ai_suggestion_attribution (
    suggestion_id UUID PRIMARY KEY,
    prompt_template_version_id UUID NOT NULL,
    workflow_version_id UUID,

    -- Input context
    input_variables JSONB,

    -- Model used
    model_name VARCHAR(100),
    model_parameters JSONB,

    FOREIGN KEY (suggestion_id) REFERENCES ai_suggestions(id),
    FOREIGN KEY (prompt_template_version_id) REFERENCES prompt_template_versions(id)
);
```

### Version Management Service

```python
# services/versioning/version_manager.py

class VersionManager:
    """
    Manages versioning for configurable components.
    """

    async def create_version(
        self,
        component_type: str,
        component_id: str,
        content: Dict,
        created_by: str,
        change_description: str = None
    ) -> Version:
        """
        Create new version of component.

        Automatically increments version number.
        """

        # Get latest version number
        latest_version = await self._get_latest_version_number(
            component_type, component_id
        )

        new_version_number = (latest_version or 0) + 1

        # Create version
        version = Version(
            component_type=component_type,
            component_id=component_id,
            version_number=new_version_number,
            content=content,
            created_by=created_by,
            change_description=change_description
        )

        self.db.add(version)
        await self.db.commit()

        return version

    async def activate_version(
        self,
        version_id: str,
        activated_by: str
    ):
        """
        Activate version (deactivate current active version).
        """

        version = await self._get_version(version_id)

        # Deactivate current active version
        await self._deactivate_current(
            version.component_type,
            version.component_id
        )

        # Activate new version
        version.is_active = True
        version.activated_at = datetime.utcnow()
        version.activated_by = activated_by

        await self.db.commit()

    async def rollback(
        self,
        component_type: str,
        component_id: str,
        target_version_number: int,
        rolled_back_by: str
    ):
        """
        Rollback to previous version.
        """

        target_version = await self._get_version_by_number(
            component_type,
            component_id,
            target_version_number
        )

        await self.activate_version(target_version.id, rolled_back_by)
```

### Benefits

✅ **Auditability**: Know which version generated each output
✅ **Rollback**: Revert to previous working version
✅ **A/B Testing**: Test new prompts/workflows before full rollout
✅ **Compliance**: Track changes for regulatory audits
✅ **Experimentation**: Safe to iterate on configurations

---

## 7. Performance SLOs (Service Level Objectives)

### Latency Targets

| Service | Operation | Target Latency | P99 Latency |
|---------|-----------|----------------|-------------|
| **Message** | Persist message | <100ms | <200ms |
| **Translation** | Cached translation | <50ms | <100ms |
| **Translation** | Uncached translation (LLM) | <500ms | <1000ms |
| **Workflow** | Evaluate conditions | <50ms | <100ms |
| **Queue** | Assignment decision | <100ms | <200ms |
| **Copilot** | First suggestion | <1.5s | <3s |
| **Copilot** | 3 suggestions | <2s | <4s |
| **Intent Detection** | LLM-based | <800ms | <1500ms |
| **RAG** | Vector search + generation | <1.2s | <2.5s |
| **Real-time** | WebSocket RTT | <200ms | <500ms |
| **API** | REST endpoint response | <300ms | <600ms |

### Throughput Targets

| Service | Target Throughput |
|---------|-------------------|
| **Messages** | 10,000 msg/sec |
| **Translations** | 5,000 translations/sec (cached) |
| **Workflows** | 50,000 evaluations/sec |
| **WebSocket** | 100,000 concurrent connections per server |
| **Queue** | 1,000 assignments/sec |

### Availability Targets

| Service | Target Availability | Max Downtime/Month |
|---------|---------------------|---------------------|
| **Core Platform** | 99.9% | 43 minutes |
| **WebSocket** | 99.95% | 21 minutes |
| **AI Services** | 99.5% | 3.6 hours |
| **Integrations** | 99.0% | 7.2 hours |

### Database Performance

| Operation | Target |
|-----------|--------|
| **Message insert** | <10ms |
| **Conversation lookup by ID** | <5ms |
| **Queue depth query** | <20ms |
| **Workflow lookup (cached)** | <1ms |
| **Customer identity resolution** | <50ms |

### Monitoring

```python
# services/observability/slo_monitor.py

class SLOMonitor:
    """
    Monitors and tracks SLO compliance.
    """

    async def record_latency(
        self,
        service: str,
        operation: str,
        latency_ms: int,
        tenant_id: str = None
    ):
        """
        Record operation latency for SLO tracking.
        """

        # Record in Prometheus histogram
        await self.metrics.histogram(
            name=f"{service}_{operation}_latency_ms",
            value=latency_ms,
            labels={
                "service": service,
                "operation": operation,
                "tenant_id": tenant_id
            }
        )

        # Check if within SLO
        slo_target = SLO_TARGETS.get(f"{service}.{operation}")
        if slo_target and latency_ms > slo_target:
            # Alert if exceeding SLO
            await self.alert_slo_breach(
                service, operation, latency_ms, slo_target
            )
```

### SLO Dashboard

```
┌─────────────────────────────────────────────────────────┐
│              SLO Compliance Dashboard                    │
├─────────────────────────────────────────────────────────┤
│ Message Persistence      ✅ 99.8% < 100ms  (Target: 95%) │
│ Translation (cached)     ✅ 99.9% < 50ms   (Target: 99%) │
│ Workflow Evaluation      ✅ 99.5% < 50ms   (Target: 95%) │
│ Copilot Suggestions      ⚠️  92.3% < 1.5s  (Target: 95%) │
│ Queue Assignment         ✅ 98.7% < 100ms  (Target: 95%) │
│ WebSocket RTT            ✅ 97.2% < 200ms  (Target: 95%) │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Observability Correlation

### Standard Correlation IDs

Every request/event must include:

```json
{
  "tenant_id": "uuid",
  "conversation_id": "uuid",
  "message_id": "uuid",
  "user_id": "uuid",
  "workflow_id": "uuid",
  "suggestion_id": "uuid",
  "integration_request_id": "uuid",
  "trace_id": "opentelemetry-trace-id",
  "span_id": "opentelemetry-span-id"
}
```

### Structured Logging Format

```json
{
  "timestamp": "2026-03-15T10:30:00.123Z",
  "level": "INFO",
  "service": "workflow-engine",
  "operation": "evaluate_workflow",

  "tenant_id": "tenant-uuid",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",
  "workflow_id": "workflow-uuid",
  "trace_id": "trace-abc123",

  "message": "Workflow matched conditions",

  "duration_ms": 45,
  "workflow_name": "Spanish VIP Routing",
  "conditions_matched": true,
  "actions_count": 3
}
```

### Correlation in Practice

```python
# services/core/request_context.py

class RequestContext:
    """
    Maintains correlation IDs throughout request lifecycle.
    """

    def __init__(self):
        self.tenant_id: Optional[str] = None
        self.conversation_id: Optional[str] = None
        self.message_id: Optional[str] = None
        self.user_id: Optional[str] = None
        self.workflow_id: Optional[str] = None
        self.trace_id: Optional[str] = None

    def to_dict(self) -> Dict:
        """Export correlation IDs as dictionary."""
        return {
            k: v for k, v in {
                "tenant_id": self.tenant_id,
                "conversation_id": self.conversation_id,
                "message_id": self.message_id,
                "user_id": self.user_id,
                "workflow_id": self.workflow_id,
                "trace_id": self.trace_id
            }.items() if v is not None
        }

# Usage in logs
logger.info(
    "Workflow executed",
    extra=request_context.to_dict(),
    workflow_name=workflow.name,
    actions_executed=len(actions)
)
```

### Trace Visualization

```
Trace: customer-message-abc123

├─ [1ms] middleware.tenant_context → tenant_id: abc
├─ [5ms] translation.detect_language → es
├─ [45ms] workflow.evaluate
│   ├─ [10ms] workflow.load_workflows
│   ├─ [20ms] workflow.evaluate_conditions
│   └─ [15ms] workflow.execute_actions
│       ├─ [5ms] automation.send_auto_reply
│       └─ [10ms] automation.route_to_queue
├─ [30ms] queue.enqueue_conversation
├─ [20ms] queue.assignment_engine.process
└─ [10ms] websocket.notify_agent

Total: 111ms
```

---

## 9. External Dependency Fallback Strategies

### Dependency Matrix

| Dependency | Impact if Unavailable | Fallback Strategy |
|------------|----------------------|-------------------|
| **LLM (OpenAI/Anthropic)** | No AI responses, no copilot | → Escalate to human immediately<br>→ Use cached responses for common questions |
| **Translation API** | No translations | → Show original message to agent<br>→ Notify agent of customer language<br>→ Suggest agents with language skill |
| **Vector DB (Pinecone)** | No RAG, no knowledge base | → Answer without knowledge base context<br>→ Fallback to general LLM knowledge<br>→ Escalate complex questions |
| **Redis** | No caching, no real-time | → Direct database queries (slower)<br>→ Disable presence/typing indicators<br>→ Polling instead of WebSocket |
| **External CRM** | No customer enrichment | → Proceed with basic customer data<br>→ Queue enrichment for retry |
| **External PMS** | No booking automation | → Collect booking details<br>→ Queue for manual processing |
| **Webhook Endpoints** | Integration fails | → Retry with exponential backoff<br>→ Queue for manual review<br>→ Alert tenant of failure |

### Circuit Breaker Pattern

```python
# services/core/circuit_breaker.py

class CircuitBreaker:
    """
    Prevents cascading failures by stopping requests to failing services.

    States:
    - CLOSED: Normal operation
    - OPEN: Failing, reject requests immediately
    - HALF_OPEN: Testing if service recovered
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        timeout: int = 60,
        expected_exception: Type[Exception] = Exception
    ):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.state = "CLOSED"
        self.opened_at = None

    async def call(self, func, *args, **kwargs):
        """
        Execute function with circuit breaker protection.
        """

        if self.state == "OPEN":
            # Check if timeout expired
            if datetime.utcnow() - self.opened_at > timedelta(seconds=self.timeout):
                self.state = "HALF_OPEN"
            else:
                raise CircuitBreakerOpen("Service unavailable")

        try:
            result = await func(*args, **kwargs)

            # Success - reset failure count
            if self.state == "HALF_OPEN":
                self.state = "CLOSED"
            self.failure_count = 0

            return result

        except Exception as e:
            self.failure_count += 1

            if self.failure_count >= self.failure_threshold:
                self.state = "OPEN"
                self.opened_at = datetime.utcnow()

            raise
```

### Fallback Implementation

```python
# services/ai/llm_client.py

class LLMClient:
    """
    LLM client with fallback strategies.
    """

    def __init__(self):
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            timeout=60
        )
        self.cache = CacheService()

    async def completion(
        self,
        prompt: str,
        context: Dict,
        fallback_enabled: bool = True
    ) -> LLMResponse:
        """
        Get LLM completion with fallback.
        """

        # Try primary LLM
        try:
            response = await self.circuit_breaker.call(
                self._call_primary_llm,
                prompt,
                context
            )
            return response

        except CircuitBreakerOpen:
            if not fallback_enabled:
                raise

            # Fallback 1: Check cache for similar prompts
            cached_response = await self.cache.get_similar_response(
                prompt, similarity_threshold=0.9
            )
            if cached_response:
                return LLMResponse(
                    text=cached_response.text,
                    source="cache",
                    fallback=True
                )

            # Fallback 2: Use pre-defined response templates
            template_response = await self._get_template_response(context)
            if template_response:
                return LLMResponse(
                    text=template_response,
                    source="template",
                    fallback=True
                )

            # Fallback 3: Escalate to human
            await self._escalate_to_human(context, reason="LLM unavailable")
            raise LLMUnavailable("LLM service unavailable, escalated to human")
```

---

## 10. AI Copilot Feedback Collection (Enhanced)

### Extended Feedback Types

| Feedback Type | Description | Use for Training |
|---------------|-------------|------------------|
| **accepted_without_edits** | Agent sends suggestion as-is | ✅ High quality examples |
| **accepted_with_minor_edits** | <10% of text changed | ✅ Good examples, study edits |
| **accepted_with_major_edits** | 10-50% of text changed | ⚠️ Moderate examples, learn patterns |
| **rewritten_completely** | >50% changed or fully rewritten | ❌ Bad examples, avoid pattern |
| **ignored** | Agent didn't use any suggestion | ⚠️ Study context for improvements |
| **rejected_inaccurate** | Factually incorrect | ❌ Critical failure, urgent fix |
| **rejected_inappropriate_tone** | Wrong tone for context | ⚠️ Tone model needs tuning |
| **rejected_other** | Other reason | ⚠️ Requires manual review |

### Enhanced Tracking Schema

```sql
CREATE TABLE ai_suggestion_feedback (
    id UUID PRIMARY KEY,
    suggestion_id UUID NOT NULL,
    agent_id UUID NOT NULL,

    -- Feedback type
    feedback_type VARCHAR(50) NOT NULL,

    -- Edit analysis
    suggestion_text TEXT NOT NULL,
    actual_sent_text TEXT,
    edit_distance INTEGER,                  -- Levenshtein distance
    edit_percentage DECIMAL(5, 2),          -- % of text changed

    -- Categorization
    inaccuracy_category VARCHAR(50),        -- factual, outdated, hallucination
    tone_issue_category VARCHAR(50),        -- too_formal, too_casual, insensitive

    -- Agent comment
    agent_comment TEXT,

    -- Attribution (what generated this suggestion)
    prompt_version_id UUID,
    model_name VARCHAR(100),
    model_parameters JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (suggestion_id) REFERENCES ai_suggestions(id),
    FOREIGN KEY (agent_id) REFERENCES users(id),
    FOREIGN KEY (prompt_version_id) REFERENCES prompt_template_versions(id)
);

CREATE INDEX idx_feedback_type ON ai_suggestion_feedback(feedback_type);
CREATE INDEX idx_feedback_agent ON ai_suggestion_feedback(agent_id);
CREATE INDEX idx_feedback_prompt_version ON ai_suggestion_feedback(prompt_version_id);
```

### Feedback Collection UI

```typescript
// Frontend: Agent feedback UI

interface SuggestionFeedbackProps {
  suggestion: AISuggestion;
  actualText: string;
}

const SuggestionFeedback: FC<SuggestionFeedbackProps> = ({
  suggestion,
  actualText
}) => {
  const [feedbackType, setFeedbackType] = useState<string>();
  const [comment, setComment] = useState<string>("");

  return (
    <Modal title="Provide Feedback">
      <p>AI Suggestion: "{suggestion.text}"</p>
      <p>You sent: "{actualText}"</p>

      <RadioGroup label="What happened?" value={feedbackType} onChange={setFeedbackType}>
        <Radio value="accepted_without_edits">I sent it exactly as suggested ✅</Radio>
        <Radio value="accepted_with_minor_edits">I made minor edits ✏️</Radio>
        <Radio value="accepted_with_major_edits">I made major changes 📝</Radio>
        <Radio value="rewritten_completely">I rewrote it completely ♻️</Radio>
        <Radio value="ignored">I ignored all suggestions ⏭️</Radio>
        <Radio value="rejected_inaccurate">Factually incorrect ❌</Radio>
        <Radio value="rejected_inappropriate_tone">Wrong tone 🔇</Radio>
        <Radio value="rejected_other">Other reason</Radio>
      </RadioGroup>

      {feedbackType === "rejected_inaccurate" && (
        <Select label="What was inaccurate?">
          <option value="hallucination">Made up information</option>
          <option value="outdated">Outdated information</option>
          <option value="wrong_context">Wrong for this customer</option>
        </Select>
      )}

      <TextArea
        label="Additional comments (optional)"
        value={comment}
        onChange={setComment}
        placeholder="Help us improve AI suggestions..."
      />

      <Button onClick={submitFeedback}>Submit Feedback</Button>
    </Modal>
  );
};
```

### Feedback Analysis

```python
# services/analytics/copilot_analytics.py

class CopilotAnalytics:
    """
    Analyzes copilot feedback for improvements.
    """

    async def get_feedback_summary(
        self,
        tenant_id: str,
        time_range: str = "last_7_days"
    ) -> FeedbackSummary:
        """
        Analyze copilot feedback trends.
        """

        # Acceptance rate
        total_suggestions = await self._count_suggestions(tenant_id, time_range)
        accepted = await self._count_by_feedback(
            tenant_id,
            time_range,
            ["accepted_without_edits", "accepted_with_minor_edits"]
        )

        acceptance_rate = accepted / total_suggestions if total_suggestions > 0 else 0

        # Edit rate
        edited = await self._count_by_feedback(
            tenant_id,
            time_range,
            ["accepted_with_minor_edits", "accepted_with_major_edits"]
        )

        edit_rate = edited / total_suggestions if total_suggestions > 0 else 0

        # Rejection reasons
        rejection_breakdown = await self._get_rejection_breakdown(
            tenant_id, time_range
        )

        return FeedbackSummary(
            total_suggestions=total_suggestions,
            acceptance_rate=acceptance_rate,
            edit_rate=edit_rate,
            rejection_breakdown=rejection_breakdown,
            improvement_areas=await self._identify_improvement_areas(
                rejection_breakdown
            )
        )
```

### Training Data Pipeline

```python
# Training data export for fine-tuning

async def export_training_data(
    tenant_id: str,
    min_quality_score: float = 0.8
) -> List[TrainingExample]:
    """
    Export high-quality examples for model fine-tuning.

    Criteria:
    - Accepted without edits (highest quality)
    - Accepted with minor edits (good quality, learn from edits)
    - No inaccuracy feedback
    - Agent rating >= 4/5 (if collected)
    """

    # Get high-quality suggestions
    high_quality = await db.query(AISuggestion).join(
        AISuggestionFeedback
    ).filter(
        AISuggestionFeedback.feedback_type.in_([
            "accepted_without_edits",
            "accepted_with_minor_edits"
        ]),
        AISuggestionFeedback.edit_percentage < 10,
        AISuggestion.tenant_id == tenant_id
    ).all()

    training_examples = []

    for suggestion in high_quality:
        # Build training example
        training_examples.append(TrainingExample(
            input=suggestion.context,
            ideal_output=suggestion.actual_sent_text or suggestion.suggestion_text,
            metadata={
                "tone": suggestion.tone,
                "customer_sentiment": suggestion.customer_sentiment,
                "conversation_topic": suggestion.topic
            }
        ))

    return training_examples
```

---

## Updated Architecture Summary

### System Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                      │
│  Frontend (React), WebSocket, REST API                  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                 🆕 POLICY LAYER                          │
│  AI Response Policy, PII Detection, Compliance          │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              ORCHESTRATION LAYER                         │
│  🆕 Workflow Engine (WHAT) → Automation (HOW)           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  BUSINESS LOGIC LAYER                    │
│  Conversations, Queue, AI Copilot, Identity Resolution  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  INTEGRATION LAYER                       │
│  CRM, PMS, Messaging, Webhooks                          │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    DATA LAYER                            │
│  PostgreSQL, Redis, Vector DB                           │
└─────────────────────────────────────────────────────────┘

                   Cross-Cutting Concerns
        ┌──────────────────────────────────────┐
        │  🆕 Observability (Correlation IDs)  │
        │  🆕 Versioning (All Configs)         │
        │  🆕 Fallback Strategies              │
        │  Multi-Tenant Isolation              │
        └──────────────────────────────────────┘
```

---

## Complete Folder Structure

```
backend/app/
├── main.py
├── config.py
├── dependencies.py
│
├── middleware/
│   ├── tenant_context.py
│   ├── auth_middleware.py
│   ├── rate_limiting.py
│   ├── logging_middleware.py
│   └── correlation_middleware.py        # 🆕 NEW: Inject correlation IDs
│
├── api/
│   └── v1/
│       ├── endpoints/
│       │   ├── auth.py
│       │   ├── conversations.py
│       │   ├── messages.py
│       │   ├── agents.py
│       │   ├── copilot.py
│       │   ├── workflows.py             # 🆕 NEW
│       │   ├── policies.py              # 🆕 NEW
│       │   └── customers.py             # 🆕 NEW: Customer profile API
│       │
│       └── websocket/
│           ├── chat.py
│           └── connection_manager.py
│
├── core/
│   ├── security.py
│   ├── logging.py
│   ├── redis_client.py
│   ├── exceptions.py
│   ├── tenant_context.py
│   ├── request_context.py               # 🆕 NEW: Correlation context
│   └── circuit_breaker.py               # 🆕 NEW: Fallback handling
│
├── db/
│   ├── base.py
│   ├── session.py
│   │
│   └── models/
│       ├── base_model.py
│       ├── tenant.py
│       ├── user.py
│       ├── conversation.py              # 🔄 MODIFIED: Add state field
│       ├── message.py                   # 🔄 MODIFIED: Canonical model
│       ├── message_translation.py       # 🆕 NEW
│       ├── message_metadata.py          # 🆕 NEW
│       ├── customer.py                  # 🔄 MODIFIED: Add enriched_data
│       ├── customer_identifier.py       # 🆕 NEW
│       ├── workflow.py                  # 🆕 NEW
│       ├── workflow_execution.py        # 🆕 NEW
│       ├── ai_suggestion.py             # 🔄 MODIFIED: Add attribution
│       ├── ai_suggestion_feedback.py    # 🆕 NEW: Enhanced feedback
│       ├── prompt_template.py           # 🆕 NEW
│       ├── prompt_template_version.py   # 🆕 NEW
│       ├── conversation_state_history.py # 🆕 NEW
│       └── policy_violation.py          # 🆕 NEW
│
├── schemas/
│   ├── conversation.py                  # 🔄 MODIFIED: Add state
│   ├── message.py                       # 🔄 MODIFIED: Canonical + derived
│   ├── workflow.py                      # 🆕 NEW
│   ├── policy.py                        # 🆕 NEW
│   ├── customer.py                      # 🔄 MODIFIED: Add profile fields
│   └── feedback.py                      # 🆕 NEW
│
├── services/
│   │
│   ├── policies/                        # 🆕 NEW MODULE
│   │   ├── __init__.py
│   │   ├── policy_engine.py
│   │   ├── ai_response_policy.py
│   │   ├── escalation_policy.py
│   │   ├── pii_policy.py
│   │   ├── compliance_policy.py
│   │   ├── content_moderation_policy.py
│   │   │
│   │   └── detectors/
│   │       ├── pii_detector.py
│   │       ├── topic_detector.py
│   │       └── sentiment_threshold.py
│   │
│   ├── workflows/                       # 🔄 MODIFIED: Clarified responsibilities
│   │   ├── __init__.py
│   │   ├── workflow_engine.py          # Loads workflows, triggers execution
│   │   ├── workflow_executor.py        # Evaluates conditions
│   │   ├── rule_parser.py              # Parses JSON → executable
│   │   ├── condition_evaluator.py      # Boolean logic
│   │   ├── action_delegator.py         # 🔄 RENAMED: Delegates to automation
│   │   │
│   │   ├── conditions/
│   │   │   ├── language_condition.py
│   │   │   ├── intent_condition.py
│   │   │   ├── sentiment_condition.py
│   │   │   ├── customer_type_condition.py
│   │   │   ├── priority_condition.py
│   │   │   └── time_condition.py
│   │   │
│   │   └── triggers/
│   │       ├── message_received_trigger.py
│   │       ├── conversation_created_trigger.py
│   │       ├── intent_detected_trigger.py
│   │       └── sla_breach_trigger.py
│   │
│   ├── automation/                      # 🔄 MODIFIED: Execution layer
│   │   ├── __init__.py
│   │   ├── action_dispatcher.py        # Central action executor
│   │   ├── intent_detector.py
│   │   ├── intent_classifier.py
│   │   │
│   │   └── action_handlers/            # 🔄 REFACTORED: All actions here
│   │       ├── base_handler.py
│   │       ├── messaging_actions.py    # Send message, auto-reply
│   │       ├── routing_actions.py      # Route to queue, assign agent
│   │       ├── integration_actions.py  # Webhooks, CRM calls
│   │       ├── escalation_actions.py   # Escalate conversation
│   │       └── conversation_actions.py # Update metadata, priority
│   │
│   ├── conversations/                   # 🔄 CONSOLIDATED
│   │   ├── __init__.py
│   │   ├── conversation_service.py
│   │   ├── message_service.py
│   │   ├── conversation_lifecycle.py   # 🆕 NEW: State machine
│   │   └── message_renderer.py         # 🆕 NEW: Render with translations
│   │
│   ├── customer_profile/                # 🆕 NEW MODULE
│   │   ├── __init__.py
│   │   ├── identity_resolver.py
│   │   ├── profile_enricher.py
│   │   ├── customer_timeline.py
│   │   └── identity_index.py
│   │
│   ├── ai/
│   │   ├── llm_client.py               # 🔄 MODIFIED: Add fallback
│   │   ├── prompt_manager.py           # 🔄 MODIFIED: Add versioning
│   │   ├── conversation_analyzer.py
│   │   ├── embedder.py
│   │   │
│   │   ├── language/
│   │   │   ├── language_detector.py
│   │   │   ├── translator.py           # 🔄 MODIFIED: Add fallback
│   │   │   └── language_normalizer.py
│   │   │
│   │   └── rag/
│   │       ├── rag_pipeline.py         # 🔄 MODIFIED: Add fallback
│   │       ├── retriever.py
│   │       └── vector_store.py
│   │
│   ├── agent/
│   │   └── copilot/
│   │       ├── context_builder.py
│   │       ├── suggestion_engine.py
│   │       ├── tone_optimizer.py
│   │       ├── grammar_corrector.py
│   │       ├── response_ranker.py
│   │       └── feedback_collector.py   # 🆕 NEW: Enhanced feedback
│   │
│   ├── queue/
│   │   ├── queue_manager.py
│   │   ├── assignment_engine.py
│   │   ├── agent_availability_service.py
│   │   ├── priority_router.py
│   │   ├── queue_policies.py
│   │   │
│   │   ├── strategies/
│   │   │   ├── round_robin.py
│   │   │   ├── least_busy.py
│   │   │   └── skills_based.py
│   │   │
│   │   └── escalation/
│   │       ├── escalation_manager.py
│   │       └── escalation_rules.py
│   │
│   ├── realtime/
│   │   ├── websocket_manager.py
│   │   ├── presence_service.py
│   │   ├── typing_indicator.py
│   │   ├── message_dispatcher.py
│   │   └── queue_notifier.py
│   │
│   ├── integrations/
│   │   ├── integration_hub.py
│   │   ├── webhook_handler.py
│   │   │
│   │   ├── crm/
│   │   │   ├── salesforce.py
│   │   │   └── hubspot.py
│   │   │
│   │   ├── hotel_pms/
│   │   │   ├── opera.py
│   │   │   └── mews.py
│   │   │
│   │   └── messaging/
│   │       ├── whatsapp.py
│   │       └── telegram.py
│   │
│   ├── observability/                   # 🔄 MODIFIED: Add SLO monitoring
│   │   ├── logging_service.py
│   │   ├── metrics_collector.py
│   │   ├── tracing_service.py
│   │   ├── slo_monitor.py              # 🆕 NEW
│   │   └── correlation_tracker.py      # 🆕 NEW
│   │
│   ├── analytics/
│   │   ├── event_tracker.py
│   │   ├── metrics_aggregator.py
│   │   ├── ai_performance_tracker.py
│   │   ├── copilot_analytics.py        # 🔄 MODIFIED: Enhanced feedback
│   │   └── queue_analytics.py
│   │
│   ├── versioning/                      # 🆕 NEW MODULE
│   │   ├── __init__.py
│   │   ├── version_manager.py
│   │   ├── prompt_versioning.py
│   │   ├── workflow_versioning.py
│   │   └── config_versioning.py
│   │
│   ├── translation_pipeline.py
│   └── cache_service.py                # 🔄 MODIFIED: Add fallback
│
└── utils/
    ├── language_codes.py
    ├── validators.py
    └── tenant_helpers.py
```

---

## Module Responsibility Matrix

| Module | Primary Responsibility | Calls | Called By |
|--------|------------------------|-------|-----------|
| **Policies** | Enforce governance rules | None | Workflows, Automation, API |
| **Workflows** | Decide WHAT actions to execute | Automation | API, Intent Detection |
| **Automation** | Execute HOW actions work | Queue, Conversations, Integrations | Workflows |
| **Conversations** | Manage conversation lifecycle | Queue, AI, Policies | API, Workflows |
| **Customer Profile** | Resolve and enrich identities | Integrations (CRM/PMS) | Conversations, AI |
| **AI** | AI/LLM operations | Translation, RAG | Copilot, Automation |
| **Queue** | Route to agents | Assignment Engine | Workflows, Automation |
| **Real-time** | WebSocket communication | None | Conversations, Queue |
| **Integrations** | External system connections | None | Automation, Customer Profile |
| **Versioning** | Version configuration | None | All configurable services |
| **Observability** | Logging, metrics, tracing | None | All services |

---

## ✅ Phase 3 Readiness Confirmation

### Architecture Status: PRODUCTION-READY

The Conversia architecture has been **comprehensively refined** and is ready for Phase 3 (Database Schema Design).

### Refinements Applied

✅ **1. Automation vs Workflows** - Clear separation (Workflows = WHAT, Automation = HOW)
✅ **2. Canonical Message Model** - Immutable original + derived artifacts pattern
✅ **3. Policy Engine** - AI governance, PII detection, compliance enforcement
✅ **4. Conversation Lifecycle** - Explicit state machine with 10 states
✅ **5. Customer Identity Resolution** - Cross-channel identity merging
✅ **6. Configuration Versioning** - All configs versioned with audit trail
✅ **7. Performance SLOs** - Documented latency targets for all services
✅ **8. Observability Correlation** - Standard correlation IDs across system
✅ **9. Fallback Strategies** - Graceful degradation for all dependencies
✅ **10. AI Copilot Feedback** - 8 feedback types for training loop

### Technical Debt Prevention

✅ No module responsibility overlap
✅ Clear data ownership (canonical vs derived)
✅ Governance layer prevents AI misbehavior
✅ Explicit state machine prevents invalid transitions
✅ Identity resolution prevents duplicate customers
✅ Versioning enables rollback and A/B testing
✅ SLOs enable performance monitoring
✅ Correlation IDs enable debugging
✅ Fallback strategies ensure high availability
✅ Feedback loop enables continuous AI improvement

### Ready for Phase 3

The architecture is now:
- ✅ **Modular** - Clear boundaries and responsibilities
- ✅ **Scalable** - Performance SLOs and caching strategies
- ✅ **Resilient** - Fallback strategies for all dependencies
- ✅ **Observable** - Correlation IDs and comprehensive monitoring
- ✅ **Compliant** - Policy engine enforces governance
- ✅ **Maintainable** - Versioning and clear documentation
- ✅ **Multi-Tenant** - Full tenant isolation

**Next Step**: Phase 3 - Database Schema Design

All database tables, indexes, constraints, and relationships can now be designed with confidence that the architecture is solid.

---

**Document Status**: ✅ **APPROVED - Ready for Phase 3**
