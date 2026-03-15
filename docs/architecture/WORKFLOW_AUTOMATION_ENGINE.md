# Conversia - Workflow Automation Engine Architecture

**Date**: 2026-03-15
**Version**: 2.2 - Workflow Automation Extension
**Status**: Architecture Design Phase

---

## Executive Summary

This document extends the Conversia architecture with a **Workflow Automation Engine** that enables multi-tenant SaaS customers to create custom conversation routing and automation rules without code.

### Workflow Engine Goals

1. **No-Code Automation** - Visual rule builder for non-technical users
2. **Flexible Conditions** - Support complex boolean logic (AND/OR/NOT)
3. **Multi-Action Execution** - Execute multiple actions per triggered workflow
4. **Real-Time Processing** - Sub-100ms workflow evaluation latency
5. **Multi-Tenant Isolation** - Workflows scoped to tenants with secure execution
6. **Audit & Analytics** - Track workflow execution for compliance and optimization

---

## Architecture Overview

The Workflow Automation Engine is an **orchestration layer** that intercepts conversation events and applies tenant-defined business rules before routing to the existing automation/queue systems.

### Position in Architecture

```
Customer Message
    ↓
Translation Pipeline (detect language)
    ↓
🆕 Workflow Automation Engine ← YOU ARE HERE
    ↓
    ├── If workflow matches → Execute workflow actions
    │   ├── Route to specific queue
    │   ├── Set priority
    │   ├── Send auto-reply
    │   ├── Trigger webhook
    │   ├── Assign specific agent
    │   └── Escalate conversation
    │
    └── Fallback → Existing automation layer
        ↓
    Intent Detection (services/automation/)
        ↓
    Queue Management (services/queue/)
        ↓
    Agent Assignment
```

### Key Concept: Workflows as Rules

A **Workflow** is a tenant-defined rule with:
- **Trigger**: When should this workflow run? (message_received, conversation_created, etc.)
- **Conditions**: What must be true? (language=es AND intent=booking)
- **Actions**: What should happen? (route_to_queue, set_priority, send_auto_reply)
- **Priority**: Execution order when multiple workflows match

---

## Updated Folder Structure

```
backend/app/services/
│
├── workflows/                                      # 🆕 NEW: Workflow Automation Engine
│   ├── __init__.py
│   ├── workflow_engine.py                         # Core orchestration engine
│   ├── workflow_executor.py                       # Execute matched workflows
│   ├── rule_parser.py                             # Parse workflow JSON → executable
│   ├── condition_evaluator.py                     # Evaluate conditions
│   ├── action_dispatcher.py                       # Dispatch workflow actions
│   │
│   ├── conditions/                                # Condition evaluators
│   │   ├── __init__.py
│   │   ├── base_condition.py                     # Abstract condition interface
│   │   ├── language_condition.py                 # Language matching
│   │   ├── intent_condition.py                   # Intent matching
│   │   ├── sentiment_condition.py                # Sentiment analysis
│   │   ├── customer_type_condition.py            # Customer tier/type
│   │   ├── priority_condition.py                 # Current priority level
│   │   └── time_condition.py                     # Time of day / business hours
│   │
│   ├── actions/                                   # Workflow actions
│   │   ├── __init__.py
│   │   ├── base_action.py                        # Abstract action interface
│   │   ├── route_to_queue_action.py              # Queue routing
│   │   ├── assign_agent_action.py                # Direct agent assignment
│   │   ├── set_priority_action.py                # Priority adjustment
│   │   ├── send_auto_reply_action.py             # Auto-response
│   │   ├── trigger_webhook_action.py             # External webhook
│   │   └── escalate_conversation_action.py       # Escalation
│   │
│   └── triggers/                                  # Event triggers
│       ├── __init__.py
│       ├── message_received_trigger.py           # On new message
│       ├── conversation_created_trigger.py       # On new conversation
│       ├── intent_detected_trigger.py            # After intent detection
│       └── sla_breach_trigger.py                 # On SLA warning
│
├── automation/                                     # Existing automation layer
│   ├── intent_detector.py
│   ├── intent_classifier.py
│   ├── action_router.py
│   ├── queue_router.py                           # 🔄 MODIFIED: Integrates with workflows
│   └── action_handlers/
│
├── queue/                                          # Existing queue system
│   ├── queue_manager.py                          # 🔄 MODIFIED: Called by workflow actions
│   ├── assignment_engine.py
│   ├── agent_availability_service.py
│   ├── priority_router.py                        # 🔄 MODIFIED: Integrates with workflows
│   └── ...
│
├── conversations/                                  # 🆕 NEW: Consolidated conversation services
│   ├── __init__.py
│   ├── conversation_service.py                   # Moved from services/
│   ├── message_service.py                        # Moved from services/
│   └── conversation_lifecycle.py                 # 🆕 NEW: Lifecycle management
│
├── realtime/                                       # Existing real-time services
│   ├── websocket_manager.py
│   ├── message_dispatcher.py
│   └── queue_notifier.py                         # 🔄 MODIFIED: Workflow notifications
│
└── ...
```

---

## 1. Workflow Engine (`workflow_engine.py`)

### Overview

The **Workflow Engine** is the central orchestrator that loads, manages, and triggers workflows for each tenant.

### Responsibilities

1. **Workflow Lifecycle Management**
   - Load active workflows for tenant from database
   - Cache workflows in Redis for fast lookup
   - Handle workflow activation/deactivation
   - Validate workflow definitions

2. **Event Processing**
   - Listen for trigger events (message_received, conversation_created)
   - Find matching workflows for event
   - Trigger workflow execution
   - Handle workflow failures gracefully

3. **Multi-Tenant Management**
   - Scope workflows to tenants
   - Enforce tenant workflow limits (e.g., max 50 workflows per tenant)
   - Prevent cross-tenant workflow execution

4. **Performance Optimization**
   - Cache workflows in Redis
   - Index workflows by trigger type
   - Parallel workflow evaluation

### Architecture

```python
class WorkflowEngine:
    """
    Central workflow orchestration engine.

    Manages workflow lifecycle and triggers execution
    when events occur.
    """

    def __init__(self):
        self.db = get_database_session()
        self.redis_client = get_redis_client()
        self.executor = WorkflowExecutor()
        self.rule_parser = RuleParser()

    # ==================== Workflow Lifecycle ====================

    async def load_workflows(
        self,
        tenant_id: str,
        force_reload: bool = False
    ) -> List[Workflow]:
        """
        Load active workflows for tenant.

        Steps:
        1. Check Redis cache
        2. If cache miss or force_reload → load from database
        3. Parse workflow definitions
        4. Cache in Redis (TTL: 5 minutes)
        5. Index by trigger type for fast lookup

        Returns:
            List of parsed and validated workflows
        """

        cache_key = f"workflows:{tenant_id}"

        # Check cache
        if not force_reload:
            cached_workflows = await self.redis_client.get(cache_key)
            if cached_workflows:
                return json.loads(cached_workflows)

        # Load from database
        workflows = await self.db.query(Workflow).filter(
            Workflow.tenant_id == tenant_id,
            Workflow.is_active == True
        ).order_by(
            Workflow.priority.desc()  # Higher priority first
        ).all()

        # Parse workflow definitions
        parsed_workflows = []
        for workflow in workflows:
            try:
                parsed = await self.rule_parser.parse(workflow)
                parsed_workflows.append(parsed)
            except WorkflowParseError as e:
                # Log error, skip invalid workflow
                logger.error(f"Failed to parse workflow {workflow.id}: {e}")
                continue

        # Cache in Redis
        await self.redis_client.setex(
            cache_key,
            300,  # 5 minutes TTL
            json.dumps([w.dict() for w in parsed_workflows])
        )

        return parsed_workflows

    async def create_workflow(
        self,
        tenant_id: str,
        name: str,
        trigger_type: str,
        conditions: Dict,
        actions: List[Dict],
        priority: int = 0,
        is_active: bool = True
    ) -> Workflow:
        """
        Create new workflow for tenant.

        Args:
            tenant_id: Tenant identifier
            name: Human-readable workflow name
            trigger_type: When to trigger (message_received, conversation_created, etc.)
            conditions: Condition definition (JSON)
            actions: List of actions to execute
            priority: Execution priority (higher = executes first)
            is_active: Whether workflow is active

        Returns:
            Created workflow object
        """

        # Validate workflow definition
        await self._validate_workflow_definition(
            trigger_type,
            conditions,
            actions
        )

        # Check tenant workflow limit
        workflow_count = await self.db.query(Workflow).filter(
            Workflow.tenant_id == tenant_id,
            Workflow.is_active == True
        ).count()

        tenant = await self._get_tenant(tenant_id)
        if workflow_count >= tenant.max_workflows:
            raise WorkflowLimitExceeded(
                f"Tenant has reached max workflows ({tenant.max_workflows})"
            )

        # Create workflow
        workflow = Workflow(
            tenant_id=tenant_id,
            name=name,
            trigger_type=trigger_type,
            conditions=conditions,
            actions=actions,
            priority=priority,
            is_active=is_active
        )

        self.db.add(workflow)
        await self.db.commit()

        # Invalidate cache
        await self._invalidate_cache(tenant_id)

        return workflow

    async def update_workflow(
        self,
        workflow_id: str,
        tenant_id: str,
        updates: Dict
    ) -> Workflow:
        """Update existing workflow."""

        workflow = await self.db.query(Workflow).filter(
            Workflow.id == workflow_id,
            Workflow.tenant_id == tenant_id
        ).first()

        if not workflow:
            raise WorkflowNotFound(f"Workflow {workflow_id} not found")

        # Apply updates
        for key, value in updates.items():
            if hasattr(workflow, key):
                setattr(workflow, key, value)

        workflow.updated_at = datetime.utcnow()
        await self.db.commit()

        # Invalidate cache
        await self._invalidate_cache(tenant_id)

        return workflow

    async def delete_workflow(
        self,
        workflow_id: str,
        tenant_id: str
    ):
        """Soft-delete workflow (set is_active = False)."""

        await self.update_workflow(
            workflow_id,
            tenant_id,
            {"is_active": False}
        )

    # ==================== Event Processing ====================

    async def process_event(
        self,
        event_type: str,
        event_data: Dict,
        tenant_id: str
    ) -> List[WorkflowResult]:
        """
        Process event and trigger matching workflows.

        Args:
            event_type: Type of event (message_received, conversation_created, etc.)
            event_data: Event payload with conversation/message data
            tenant_id: Tenant identifier

        Flow:
        1. Load workflows for tenant
        2. Filter workflows by trigger type
        3. Evaluate conditions for each workflow
        4. Execute actions for matched workflows
        5. Track execution metrics

        Returns:
            List of workflow execution results
        """

        # Load workflows
        workflows = await self.load_workflows(tenant_id)

        # Filter by trigger type
        matching_workflows = [
            w for w in workflows
            if w.trigger_type == event_type
        ]

        if not matching_workflows:
            # No workflows for this trigger
            return []

        # Evaluate and execute
        results = []

        for workflow in matching_workflows:
            try:
                # Execute workflow
                result = await self.executor.execute(
                    workflow=workflow,
                    event_data=event_data,
                    tenant_id=tenant_id
                )

                results.append(result)

                # Track execution
                await self._track_execution(workflow, result)

            except Exception as e:
                logger.error(f"Workflow {workflow.id} execution failed: {e}")
                results.append(WorkflowResult(
                    workflow_id=workflow.id,
                    success=False,
                    error=str(e)
                ))

        return results

    async def _invalidate_cache(self, tenant_id: str):
        """Invalidate workflow cache for tenant."""
        cache_key = f"workflows:{tenant_id}"
        await self.redis_client.delete(cache_key)

    async def _track_execution(
        self,
        workflow: Workflow,
        result: WorkflowResult
    ):
        """Track workflow execution for analytics."""

        execution_log = WorkflowExecution(
            workflow_id=workflow.id,
            tenant_id=workflow.tenant_id,
            conversation_id=result.conversation_id,
            matched=result.matched,
            success=result.success,
            actions_executed=result.actions_executed,
            execution_time_ms=result.execution_time_ms,
            error=result.error
        )

        self.db.add(execution_log)
        await self.db.commit()

    async def _validate_workflow_definition(
        self,
        trigger_type: str,
        conditions: Dict,
        actions: List[Dict]
    ):
        """
        Validate workflow definition.

        Checks:
        - Trigger type is valid
        - Conditions are well-formed
        - Actions are valid and have required parameters
        """

        # Validate trigger
        valid_triggers = [
            "message_received",
            "conversation_created",
            "intent_detected",
            "sla_breach_warning"
        ]

        if trigger_type not in valid_triggers:
            raise InvalidWorkflowDefinition(
                f"Invalid trigger type: {trigger_type}"
            )

        # Validate conditions
        await self.rule_parser.validate_conditions(conditions)

        # Validate actions
        await self.rule_parser.validate_actions(actions)
```

---

## 2. Workflow Executor (`workflow_executor.py`)

### Overview

The **Workflow Executor** evaluates workflow conditions and executes actions when conditions match.

### Responsibilities

1. **Condition Evaluation**
   - Parse condition tree (AND/OR/NOT logic)
   - Evaluate conditions against event data
   - Short-circuit evaluation for performance

2. **Action Execution**
   - Execute actions in order
   - Handle action failures gracefully
   - Support parallel action execution
   - Rollback on critical failures

3. **Result Tracking**
   - Track which actions succeeded/failed
   - Measure execution time
   - Return detailed results

### Architecture

```python
class WorkflowExecutor:
    """
    Executes workflows by evaluating conditions and dispatching actions.
    """

    def __init__(self):
        self.condition_evaluator = ConditionEvaluator()
        self.action_dispatcher = ActionDispatcher()

    async def execute(
        self,
        workflow: Workflow,
        event_data: Dict,
        tenant_id: str
    ) -> WorkflowResult:
        """
        Execute workflow.

        Steps:
        1. Evaluate conditions
        2. If conditions match → execute actions
        3. Track execution metrics
        4. Return result

        Returns:
            WorkflowResult with execution details
        """

        start_time = time.time()

        # Evaluate conditions
        conditions_matched = await self.condition_evaluator.evaluate(
            conditions=workflow.conditions,
            event_data=event_data
        )

        if not conditions_matched:
            # Conditions didn't match, skip execution
            return WorkflowResult(
                workflow_id=workflow.id,
                matched=False,
                success=True,
                actions_executed=[],
                execution_time_ms=int((time.time() - start_time) * 1000)
            )

        # Execute actions
        action_results = []

        for action_def in workflow.actions:
            try:
                action_result = await self.action_dispatcher.dispatch(
                    action_def=action_def,
                    event_data=event_data,
                    tenant_id=tenant_id
                )

                action_results.append({
                    "action_type": action_def["type"],
                    "success": action_result.success,
                    "result": action_result.result
                })

            except Exception as e:
                logger.error(f"Action {action_def['type']} failed: {e}")
                action_results.append({
                    "action_type": action_def["type"],
                    "success": False,
                    "error": str(e)
                })

        # Calculate execution time
        execution_time_ms = int((time.time() - start_time) * 1000)

        return WorkflowResult(
            workflow_id=workflow.id,
            conversation_id=event_data.get("conversation_id"),
            matched=True,
            success=all(r["success"] for r in action_results),
            actions_executed=action_results,
            execution_time_ms=execution_time_ms
        )
```

---

## 3. Rule Parser (`rule_parser.py`)

### Overview

The **Rule Parser** converts workflow JSON definitions into executable condition trees and action lists.

### Responsibilities

1. **Parse Conditions**
   - Convert JSON conditions to executable tree
   - Support AND/OR/NOT operators
   - Validate condition syntax

2. **Parse Actions**
   - Validate action types
   - Check required parameters
   - Build action execution plan

3. **Validation**
   - Ensure workflow definitions are valid
   - Check for circular references
   - Validate parameter types

### Architecture

```python
class RuleParser:
    """
    Parses workflow definitions from JSON into executable structures.
    """

    async def parse(self, workflow: Workflow) -> ParsedWorkflow:
        """
        Parse workflow definition.

        Args:
            workflow: Database workflow object

        Returns:
            ParsedWorkflow with executable conditions and actions
        """

        # Parse conditions
        condition_tree = await self.parse_conditions(workflow.conditions)

        # Parse actions
        action_list = await self.parse_actions(workflow.actions)

        return ParsedWorkflow(
            id=workflow.id,
            tenant_id=workflow.tenant_id,
            name=workflow.name,
            trigger_type=workflow.trigger_type,
            priority=workflow.priority,
            condition_tree=condition_tree,
            actions=action_list
        )

    async def parse_conditions(self, conditions: Dict) -> ConditionNode:
        """
        Parse condition JSON into executable tree.

        Example condition JSON:
        {
            "operator": "AND",
            "conditions": [
                {
                    "type": "language",
                    "operator": "equals",
                    "value": "es"
                },
                {
                    "operator": "OR",
                    "conditions": [
                        {
                            "type": "intent",
                            "operator": "equals",
                            "value": "booking.new"
                        },
                        {
                            "type": "intent",
                            "operator": "equals",
                            "value": "booking.modify"
                        }
                    ]
                }
            ]
        }

        This represents:
        language = "es" AND (intent = "booking.new" OR intent = "booking.modify")
        """

        if "operator" in conditions and conditions["operator"] in ["AND", "OR", "NOT"]:
            # Compound condition
            return CompoundCondition(
                operator=conditions["operator"],
                conditions=[
                    await self.parse_conditions(c)
                    for c in conditions.get("conditions", [])
                ]
            )
        else:
            # Leaf condition
            return LeafCondition(
                type=conditions["type"],
                operator=conditions.get("operator", "equals"),
                value=conditions["value"],
                field=conditions.get("field")
            )

    async def parse_actions(self, actions: List[Dict]) -> List[Action]:
        """
        Parse action definitions.

        Example actions:
        [
            {
                "type": "route_to_queue",
                "params": {
                    "queue_id": "abc-123",
                    "priority": "high"
                }
            },
            {
                "type": "send_auto_reply",
                "params": {
                    "message": "Gracias por contactarnos. Un agente se comunicará pronto."
                }
            }
        ]
        """

        parsed_actions = []

        for action_def in actions:
            action_type = action_def["type"]
            params = action_def.get("params", {})

            # Validate action type
            if action_type not in ACTION_REGISTRY:
                raise InvalidWorkflowDefinition(
                    f"Unknown action type: {action_type}"
                )

            # Validate params
            action_class = ACTION_REGISTRY[action_type]
            await action_class.validate_params(params)

            parsed_actions.append(Action(
                type=action_type,
                params=params
            ))

        return parsed_actions

    async def validate_conditions(self, conditions: Dict):
        """Validate condition structure and syntax."""

        try:
            await self.parse_conditions(conditions)
        except Exception as e:
            raise InvalidWorkflowDefinition(f"Invalid conditions: {e}")

    async def validate_actions(self, actions: List[Dict]):
        """Validate action definitions."""

        try:
            await self.parse_actions(actions)
        except Exception as e:
            raise InvalidWorkflowDefinition(f"Invalid actions: {e}")
```

---

## 4. Condition Evaluator (`condition_evaluator.py`)

### Overview

The **Condition Evaluator** evaluates workflow conditions against conversation data using boolean logic.

### Supported Conditions

1. **language** - Customer language detection
   - Operators: `equals`, `not_equals`, `in`, `not_in`
   - Values: ISO language codes (`es`, `en`, `pt`, etc.)

2. **intent** - Detected conversation intent
   - Operators: `equals`, `not_equals`, `contains`, `starts_with`
   - Values: Intent identifiers (`booking.new`, `support.complaint`, etc.)

3. **sentiment** - Customer sentiment
   - Operators: `equals`, `not_equals`
   - Values: `positive`, `neutral`, `negative`

4. **customer_type** - Customer tier or type
   - Operators: `equals`, `not_equals`, `in`
   - Values: `vip`, `premium`, `free`, or custom types

5. **priority** - Current conversation priority
   - Operators: `equals`, `greater_than`, `less_than`
   - Values: `low`, `normal`, `high`, `urgent`, `vip`

6. **time_of_day** - Current time
   - Operators: `between`, `before`, `after`
   - Values: Time ranges (`09:00-17:00`, `after 18:00`, etc.)

### Architecture

```python
class ConditionEvaluator:
    """
    Evaluates workflow conditions against event data.
    """

    def __init__(self):
        self.condition_handlers = {
            "language": LanguageCondition(),
            "intent": IntentCondition(),
            "sentiment": SentimentCondition(),
            "customer_type": CustomerTypeCondition(),
            "priority": PriorityCondition(),
            "time_of_day": TimeCondition()
        }

    async def evaluate(
        self,
        conditions: Dict,
        event_data: Dict
    ) -> bool:
        """
        Evaluate condition tree.

        Args:
            conditions: Condition definition (JSON)
            event_data: Conversation/message data

        Returns:
            True if conditions match, False otherwise
        """

        # Parse into condition tree
        parser = RuleParser()
        condition_tree = await parser.parse_conditions(conditions)

        # Evaluate tree
        return await self._evaluate_node(condition_tree, event_data)

    async def _evaluate_node(
        self,
        node: ConditionNode,
        event_data: Dict
    ) -> bool:
        """Recursively evaluate condition tree."""

        if isinstance(node, CompoundCondition):
            # Evaluate compound condition (AND/OR/NOT)
            return await self._evaluate_compound(node, event_data)
        else:
            # Evaluate leaf condition
            return await self._evaluate_leaf(node, event_data)

    async def _evaluate_compound(
        self,
        node: CompoundCondition,
        event_data: Dict
    ) -> bool:
        """Evaluate compound condition (AND/OR/NOT)."""

        if node.operator == "AND":
            # All conditions must be true
            for condition in node.conditions:
                if not await self._evaluate_node(condition, event_data):
                    return False  # Short-circuit
            return True

        elif node.operator == "OR":
            # At least one condition must be true
            for condition in node.conditions:
                if await self._evaluate_node(condition, event_data):
                    return True  # Short-circuit
            return False

        elif node.operator == "NOT":
            # Negate condition
            if not node.conditions:
                return False
            return not await self._evaluate_node(node.conditions[0], event_data)

        else:
            raise UnsupportedOperator(f"Unknown operator: {node.operator}")

    async def _evaluate_leaf(
        self,
        node: LeafCondition,
        event_data: Dict
    ) -> bool:
        """Evaluate leaf condition."""

        # Get condition handler
        handler = self.condition_handlers.get(node.type)

        if not handler:
            raise UnsupportedCondition(f"Unknown condition type: {node.type}")

        # Evaluate condition
        return await handler.evaluate(
            operator=node.operator,
            value=node.value,
            event_data=event_data,
            field=node.field
        )
```

### Example Condition Handlers

```python
# conditions/language_condition.py

class LanguageCondition(BaseCondition):
    """Evaluate language conditions."""

    async def evaluate(
        self,
        operator: str,
        value: Any,
        event_data: Dict,
        field: Optional[str] = None
    ) -> bool:
        """
        Evaluate language condition.

        Example:
            operator: "equals"
            value: "es"
            event_data: {"conversation": {...}, "message": {...}}
        """

        # Get detected language from event data
        conversation = event_data.get("conversation")
        if not conversation:
            return False

        detected_language = conversation.get("customer_language")

        if operator == "equals":
            return detected_language == value

        elif operator == "not_equals":
            return detected_language != value

        elif operator == "in":
            # value is a list of languages
            return detected_language in value

        elif operator == "not_in":
            return detected_language not in value

        else:
            raise UnsupportedOperator(f"Unknown operator: {operator}")
```

```python
# conditions/time_condition.py

class TimeCondition(BaseCondition):
    """Evaluate time-based conditions."""

    async def evaluate(
        self,
        operator: str,
        value: Any,
        event_data: Dict,
        field: Optional[str] = None
    ) -> bool:
        """
        Evaluate time condition.

        Example:
            operator: "between"
            value: {"start": "09:00", "end": "17:00"}
        """

        current_time = datetime.utcnow().time()

        if operator == "between":
            start = datetime.strptime(value["start"], "%H:%M").time()
            end = datetime.strptime(value["end"], "%H:%M").time()
            return start <= current_time <= end

        elif operator == "after":
            threshold = datetime.strptime(value, "%H:%M").time()
            return current_time > threshold

        elif operator == "before":
            threshold = datetime.strptime(value, "%H:%M").time()
            return current_time < threshold

        else:
            raise UnsupportedOperator(f"Unknown operator: {operator}")
```

---

## 5. Action Dispatcher (`action_dispatcher.py`)

### Overview

The **Action Dispatcher** executes workflow actions by delegating to specialized action handlers.

### Supported Actions

1. **route_to_queue** - Route conversation to specific queue
   - Parameters: `queue_id`, `priority` (optional)
   - Integrates with: `services/queue/queue_manager.py`

2. **assign_agent** - Assign conversation to specific agent
   - Parameters: `agent_id`
   - Integrates with: `services/queue/assignment_engine.py`

3. **set_priority** - Change conversation priority
   - Parameters: `priority` (low, normal, high, urgent, vip)
   - Integrates with: `services/queue/priority_router.py`

4. **send_auto_reply** - Send automated message
   - Parameters: `message`, `translate` (optional)
   - Integrates with: `services/conversations/message_service.py`

5. **trigger_webhook** - Call external webhook
   - Parameters: `url`, `method`, `payload`
   - Integrates with: `services/integrations/webhook_handler.py`

6. **escalate_conversation** - Escalate to supervisor/manager
   - Parameters: `escalation_queue_id`, `reason`
   - Integrates with: `services/queue/escalation/escalation_manager.py`

### Architecture

```python
class ActionDispatcher:
    """
    Dispatches workflow actions to appropriate handlers.
    """

    def __init__(self):
        self.action_handlers = {
            "route_to_queue": RouteToQueueAction(),
            "assign_agent": AssignAgentAction(),
            "set_priority": SetPriorityAction(),
            "send_auto_reply": SendAutoReplyAction(),
            "trigger_webhook": TriggerWebhookAction(),
            "escalate_conversation": EscalateConversationAction()
        }

    async def dispatch(
        self,
        action_def: Dict,
        event_data: Dict,
        tenant_id: str
    ) -> ActionResult:
        """
        Execute workflow action.

        Args:
            action_def: Action definition with type and params
            event_data: Conversation/message data
            tenant_id: Tenant identifier

        Returns:
            ActionResult with execution details
        """

        action_type = action_def["type"]
        params = action_def.get("params", {})

        # Get action handler
        handler = self.action_handlers.get(action_type)

        if not handler:
            raise UnsupportedAction(f"Unknown action type: {action_type}")

        # Execute action
        try:
            result = await handler.execute(
                params=params,
                event_data=event_data,
                tenant_id=tenant_id
            )

            return ActionResult(
                action_type=action_type,
                success=True,
                result=result
            )

        except Exception as e:
            logger.error(f"Action {action_type} failed: {e}")
            return ActionResult(
                action_type=action_type,
                success=False,
                error=str(e)
            )
```

### Example Action Handlers

```python
# actions/route_to_queue_action.py

class RouteToQueueAction(BaseAction):
    """Route conversation to specific queue."""

    async def execute(
        self,
        params: Dict,
        event_data: Dict,
        tenant_id: str
    ) -> Dict:
        """
        Execute queue routing action.

        Params:
            queue_id: Target queue ID
            priority: Optional priority override
        """

        queue_id = params["queue_id"]
        priority = params.get("priority")

        conversation_id = event_data["conversation"]["id"]

        # Get services
        queue_manager = QueueManager()
        priority_router = PriorityRouter()

        # Determine priority
        if priority:
            # Use workflow-specified priority
            priority_value = ConversationPriority[priority.upper()]
        else:
            # Auto-detect priority
            conversation = event_data["conversation"]
            message = event_data.get("message")
            priority_value = await priority_router.classify_priority(
                conversation,
                message
            )

        # Enqueue conversation
        queue_entry = await queue_manager.enqueue_conversation(
            conversation_id=conversation_id,
            queue_id=queue_id,
            priority=priority_value,
            metadata={"workflow_routed": True}
        )

        return {
            "queue_id": queue_id,
            "priority": priority_value.value,
            "queue_position": queue_entry.queue_position,
            "estimated_wait_time": queue_entry.estimated_wait_time
        }
```

```python
# actions/send_auto_reply_action.py

class SendAutoReplyAction(BaseAction):
    """Send automated reply message."""

    async def execute(
        self,
        params: Dict,
        event_data: Dict,
        tenant_id: str
    ) -> Dict:
        """
        Send auto-reply.

        Params:
            message: Message text
            translate: Whether to translate to customer language
        """

        message_text = params["message"]
        translate = params.get("translate", True)

        conversation_id = event_data["conversation"]["id"]
        conversation = event_data["conversation"]

        # Get message service
        message_service = MessageService()

        # Translate if needed
        if translate and conversation.get("customer_language"):
            translator = Translator()
            translation = await translator.translate(
                text=message_text,
                source_lang="en",  # Assume workflow messages in English
                target_lang=conversation["customer_language"]
            )
            message_text = translation["translated_text"]

        # Send message
        message = await message_service.send_message(
            conversation_id=conversation_id,
            sender_type="system",
            text=message_text,
            metadata={"automated": True, "workflow_generated": True}
        )

        return {
            "message_id": message.id,
            "translated": translate,
            "target_language": conversation.get("customer_language")
        }
```

---

## Workflow Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Customer Message Received                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  Translation Pipeline│
                │  (Detect Language)   │
                └──────────┬───────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │      🆕 Workflow Automation Engine        │
        │                                           │
        │  1. Load workflows for tenant            │
        │  2. Filter by trigger: message_received  │
        │  3. Evaluate conditions                  │
        └──────────────────┬───────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
         Workflow   │             │ No Workflow
         Matched    │             │ Matched
                    │             │
                    ▼             ▼
        ┌───────────────────┐  ┌──────────────────┐
        │  Execute Actions  │  │  Fallback to     │
        │                   │  │  Intent Detection│
        │  ✓ Route to queue │  │  (Existing Flow) │
        │  ✓ Set priority   │  └──────────────────┘
        │  ✓ Send auto-reply│
        │  ✓ Trigger webhook│
        │  ✓ Assign agent   │
        └─────────┬─────────┘
                  │
                  ▼
        ┌──────────────────┐
        │  Actions Complete│
        │                  │
        │  Continue normal │
        │  flow            │
        └──────────────────┘
```

### Example Workflow Execution

**Workflow Definition**:
```json
{
  "name": "Spanish Booking Priority Routing",
  "trigger_type": "message_received",
  "priority": 10,
  "conditions": {
    "operator": "AND",
    "conditions": [
      {
        "type": "language",
        "operator": "equals",
        "value": "es"
      },
      {
        "type": "intent",
        "operator": "in",
        "value": ["booking.new", "booking.modify"]
      }
    ]
  },
  "actions": [
    {
      "type": "send_auto_reply",
      "params": {
        "message": "Gracias por contactarnos. Procesando su solicitud de reserva...",
        "translate": false
      }
    },
    {
      "type": "set_priority",
      "params": {
        "priority": "high"
      }
    },
    {
      "type": "route_to_queue",
      "params": {
        "queue_id": "spanish-booking-queue-uuid"
      }
    },
    {
      "type": "trigger_webhook",
      "params": {
        "url": "https://customer-crm.com/api/lead",
        "method": "POST",
        "payload": {
          "source": "chat",
          "language": "es",
          "type": "booking"
        }
      }
    }
  ]
}
```

**Execution**:
```
Customer: "Hola, quiero reservar una habitación para el 15 de abril"

1. Translation detects language: es
2. Workflow Engine processes:
   - Load workflows for tenant
   - Find workflows with trigger = message_received
   - Evaluate conditions:
     ✓ language = es → TRUE
     ✓ intent = booking.new → TRUE (after intent detection)
     ✓ AND → TRUE

3. Execute actions in order:
   ✓ send_auto_reply → Send: "Gracias por contactarnos..."
   ✓ set_priority → Set priority to HIGH
   ✓ route_to_queue → Enqueue to spanish-booking-queue
   ✓ trigger_webhook → POST to CRM API

4. Result: Conversation routed to Spanish booking queue with high priority
```

---

## Integration with Existing Systems

### 1. Integration with Intent Detection

Workflows can trigger **after** intent detection:

```python
# In services/automation/intent_detector.py

async def detect_intent(
    self,
    message: str,
    conversation_context: ConversationContext
) -> IntentResult:
    # ... existing intent detection ...

    intent_result = await self.llm_client.detect_intent(message)

    # 🆕 Trigger workflow with intent detected
    workflow_engine = WorkflowEngine()
    await workflow_engine.process_event(
        event_type="intent_detected",
        event_data={
            "conversation": conversation_context.conversation,
            "message": message,
            "intent": intent_result.intent,
            "confidence": intent_result.confidence
        },
        tenant_id=conversation_context.tenant_id
    )

    return intent_result
```

### 2. Integration with Queue Management

Workflows use queue services directly:

```python
# Workflow action calls queue manager
from services.queue.queue_manager import QueueManager

queue_manager = QueueManager()
await queue_manager.enqueue_conversation(
    conversation_id=conversation_id,
    queue_id=workflow_queue_id,
    priority=priority
)
```

### 3. Integration with Real-Time Services

Workflows can send WebSocket notifications:

```python
# actions/notify_agent_action.py

class NotifyAgentAction(BaseAction):
    """Send notification to specific agent."""

    async def execute(self, params, event_data, tenant_id):
        agent_id = params["agent_id"]
        message = params["message"]

        # Use real-time notification service
        queue_notifier = QueueNotifier()
        await queue_notifier.notify_agent(
            agent_id=agent_id,
            notification_type="workflow_alert",
            message=message
        )
```

### 4. Integration with Conversation Services

Workflows can update conversation metadata:

```python
# Update conversation via conversation service
from services.conversations.conversation_service import ConversationService

conversation_service = ConversationService()
await conversation_service.update_metadata(
    conversation_id=conversation_id,
    metadata={
        "workflow_processed": True,
        "workflow_id": workflow.id,
        "custom_field": "value"
    }
)
```

---

## Database Schema (Conceptual for Phase 3)

### 1. `workflows` Table

```sql
CREATE TABLE workflows (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    -- Workflow metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Trigger
    trigger_type VARCHAR(100) NOT NULL,  -- message_received, conversation_created, etc.

    -- Conditions (stored as JSON)
    conditions JSONB NOT NULL,

    -- Actions (stored as JSON array)
    actions JSONB NOT NULL,

    -- Execution
    priority INTEGER DEFAULT 0,          -- Higher = executes first
    is_active BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_by UUID,                     -- User who created workflow
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_workflows_tenant ON workflows(tenant_id);
CREATE INDEX idx_workflows_trigger ON workflows(trigger_type);
CREATE INDEX idx_workflows_active ON workflows(is_active) WHERE is_active = true;
CREATE INDEX idx_workflows_priority ON workflows(priority DESC);
```

### 2. `workflow_executions` Table

```sql
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workflow_id UUID NOT NULL,
    conversation_id UUID,

    -- Execution details
    matched BOOLEAN DEFAULT FALSE,       -- Did conditions match?
    success BOOLEAN DEFAULT TRUE,        -- Did actions succeed?

    -- Actions executed
    actions_executed JSONB,              -- List of executed actions with results

    -- Performance
    execution_time_ms INTEGER,

    -- Error handling
    error TEXT,

    -- Timestamp
    executed_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_conversation ON workflow_executions(conversation_id);
CREATE INDEX idx_workflow_executions_executed_at ON workflow_executions(executed_at DESC);
CREATE INDEX idx_workflow_executions_matched ON workflow_executions(matched) WHERE matched = true;
```

---

## Multi-Tenant SaaS Considerations

### Tenant Isolation

1. **Workflow Scoping**
   - All workflows scoped to `tenant_id`
   - Workflows can only access tenant's own resources
   - Queue IDs, agent IDs validated against tenant

2. **Resource Limits**
   - Max workflows per tenant (e.g., 50 for starter, 200 for enterprise)
   - Max actions per workflow (e.g., 10)
   - Execution timeout per workflow (e.g., 5 seconds)

3. **Performance Isolation**
   - Workflow execution in isolated async tasks
   - Rate limiting per tenant
   - CPU/memory quotas

### Security

1. **Webhook Security**
   - Webhook URLs validated (no localhost, internal IPs)
   - HTTPS required for production
   - Payload sanitization

2. **Action Validation**
   - Queue IDs validated against tenant's queues
   - Agent IDs validated against tenant's agents
   - Prevent privilege escalation

---

## Workflow Analytics

### Metrics Tracked

1. **Execution Metrics**
   - Workflows triggered per day
   - Match rate (% of triggers that matched conditions)
   - Success rate (% of executions that succeeded)
   - Average execution time

2. **Action Metrics**
   - Most used actions
   - Action success rates
   - Action execution time

3. **Business Metrics**
   - Conversations routed via workflows
   - Auto-replies sent
   - Escalations triggered
   - Webhooks called

---

## Phase 3 Readiness Confirmation

### ✅ Workflow Automation Engine Architecture Complete

The workflow automation engine is **fully designed and ready for Phase 3: Database Schema Design**.

### What's Been Added

1. ✅ **Workflow Engine** - Lifecycle management and event processing
2. ✅ **Workflow Executor** - Condition evaluation and action execution
3. ✅ **Rule Parser** - JSON to executable conversion
4. ✅ **Condition Evaluator** - Boolean logic evaluation with 6 condition types
5. ✅ **Action Dispatcher** - 6 workflow actions with integration points
6. ✅ **Multi-Tenant Support** - Full tenant isolation and resource limits
7. ✅ **Security** - Validation and sanitization
8. ✅ **Analytics** - Execution tracking and metrics

### Integration Points Confirmed

- ✅ **services/automation/** - Intent detection triggers workflows
- ✅ **services/queue/** - Queue routing and priority actions
- ✅ **services/conversations/** - Message and conversation actions
- ✅ **services/realtime/** - WebSocket notification actions

### Supported Workflow Conditions

- ✅ `language` - Customer language detection
- ✅ `intent` - Detected conversation intent
- ✅ `sentiment` - Customer sentiment analysis
- ✅ `customer_type` - Customer tier/type
- ✅ `priority` - Current conversation priority
- ✅ `time_of_day` - Time-based routing

### Supported Workflow Actions

- ✅ `route_to_queue` - Queue routing with priority
- ✅ `assign_agent` - Direct agent assignment
- ✅ `set_priority` - Priority adjustment
- ✅ `send_auto_reply` - Automated responses
- ✅ `trigger_webhook` - External integrations
- ✅ `escalate_conversation` - Escalation handling

### Database Entities Defined

- ✅ `workflows` - Workflow definitions with conditions and actions
- ✅ `workflow_executions` - Execution logs and analytics

---

## Next Steps for Phase 3

In Phase 3, we will:

1. **Finalize Database Schema** - Complete SQL with indexes and constraints
2. **Design Workflow UI** - Visual workflow builder mockups
3. **Plan Workflow Testing** - Test cases for complex condition logic
4. **Performance Optimization** - Caching strategy for workflow evaluation

**Status**: ✅ **Ready for Phase 3: Database Schema Design**
