# Conversia - Queue Management System Architecture

**Date**: 2026-03-15
**Version**: 2.1 - Queue Management Extension
**Status**: Architecture Design Phase

---

## Executive Summary

This document extends the Conversia architecture with a **professional Queue Management System** for routing customer support conversations to human agents efficiently in a multi-tenant SaaS environment.

### Queue System Goals

1. **Intelligent Routing** - Match conversations to best-fit agents based on skills, availability, and load
2. **Multi-Tenant Isolation** - Separate queues per tenant with configurable policies
3. **Priority Management** - Handle urgent/VIP conversations with SLA enforcement
4. **Team-Based Routing** - Support department-based queues (sales, support, reservations)
5. **Scalability** - Handle 1000+ concurrent conversations with sub-second routing
6. **Analytics** - Track queue metrics (wait time, abandonment rate, agent performance)

---

## Updated Folder Structure

```
backend/app/services/
│
├── queue/                                          # ⭐ NEW: Queue Management System
│   ├── __init__.py
│   ├── queue_manager.py                           # Core queue orchestration
│   ├── assignment_engine.py                       # Conversation-to-agent assignment
│   ├── agent_availability_service.py              # Agent status & capacity tracking
│   ├── priority_router.py                         # Priority-based routing logic
│   ├── queue_policies.py                          # Configurable routing policies
│   │
│   ├── strategies/                                # Assignment strategies
│   │   ├── __init__.py
│   │   ├── base_strategy.py                      # Abstract strategy interface
│   │   ├── round_robin.py                        # Round-robin assignment
│   │   ├── least_busy.py                         # Least conversations first
│   │   ├── skills_based.py                       # Skill matching
│   │   ├── load_balancing.py                     # Advanced load balancing
│   │   └── vip_priority.py                       # VIP customer routing
│   │
│   ├── escalation/                                # Escalation rules
│   │   ├── __init__.py
│   │   ├── escalation_manager.py                 # Monitor SLA breaches
│   │   ├── escalation_rules.py                   # Escalation rule engine
│   │   └── notification_service.py               # Alert supervisors
│   │
│   └── analytics/                                 # Queue analytics
│       ├── __init__.py
│       ├── queue_metrics.py                      # Real-time queue metrics
│       ├── agent_performance.py                  # Agent KPIs
│       └── sla_monitor.py                        # SLA compliance tracking
│
├── agent/
│   ├── copilot/                                   # Existing copilot system
│   ├── agent_manager.py                          # ⭐ NEW: Agent lifecycle management
│   └── team_manager.py                           # ⭐ NEW: Team/group management
│
├── automation/                                     # Existing automation
│   ├── intent_detector.py
│   ├── intent_classifier.py
│   ├── action_router.py
│   └── queue_router.py                           # ⭐ NEW: Route to queue vs AI
│
├── realtime/                                       # Existing real-time services
│   ├── websocket_manager.py
│   ├── presence_service.py
│   ├── typing_indicator.py
│   ├── message_dispatcher.py
│   └── queue_notifier.py                         # ⭐ NEW: Notify agents of assignments
│
├── ai/                                             # Existing AI services
│   └── ...
│
└── analytics/                                      # Existing analytics
    ├── event_tracker.py
    ├── metrics_aggregator.py
    ├── ai_performance_tracker.py
    └── queue_analytics.py                        # ⭐ NEW: Queue analytics integration
```

---

## 1. Queue Manager (`queue_manager.py`)

### Overview

The Queue Manager is the central orchestrator for all conversation queuing operations. It maintains waiting lists, manages queue lifecycle, and coordinates with the assignment engine.

### Responsibilities

1. **Queue Lifecycle Management**
   - Create/update/delete queues per tenant
   - Maintain queue configurations and policies
   - Handle queue activation/deactivation

2. **Conversation Queuing**
   - Add conversations to appropriate queues
   - Remove conversations when assigned or closed
   - Reorder queue based on priority changes
   - Handle queue transfers between teams

3. **Queue State Management**
   - Track queue depth (number of waiting conversations)
   - Monitor average wait time
   - Maintain queue statistics in real-time

4. **Multi-Tenant Isolation**
   - Ensure queues are scoped to tenants
   - Enforce tenant-specific policies
   - Prevent cross-tenant queue access

### Architecture

```python
class QueueManager:
    """
    Central queue orchestration service.

    Manages multiple queues per tenant with Redis-backed queue storage
    for high-performance operations.
    """

    def __init__(self):
        self.redis_client = get_redis_client()
        self.db = get_database_session()
        self.assignment_engine = AssignmentEngine()
        self.policy_engine = QueuePolicies()

    # ==================== Queue Lifecycle ====================

    async def create_queue(
        self,
        tenant_id: str,
        queue_name: str,
        queue_type: str,              # sales, support, reservations, etc.
        config: QueueConfig
    ) -> Queue:
        """
        Create a new queue for a tenant.

        Args:
            tenant_id: Tenant identifier
            queue_name: Human-readable queue name
            queue_type: Queue category/department
            config: Queue configuration (routing strategy, capacity, etc.)

        Returns:
            Queue object with unique queue_id
        """

    async def get_queue(
        self,
        queue_id: str,
        tenant_id: str
    ) -> Queue:
        """Retrieve queue by ID with tenant validation."""

    async def list_queues(
        self,
        tenant_id: str,
        filters: Dict = None
    ) -> List[Queue]:
        """List all queues for a tenant."""

    # ==================== Conversation Queuing ====================

    async def enqueue_conversation(
        self,
        conversation_id: str,
        queue_id: str,
        priority: ConversationPriority,
        metadata: Dict = None
    ) -> QueueEntry:
        """
        Add conversation to queue.

        Flow:
        1. Validate conversation and queue
        2. Calculate priority score
        3. Insert into Redis sorted set (sorted by priority + timestamp)
        4. Update queue metrics
        5. Trigger assignment if agents available
        6. Start SLA timer

        Returns:
            QueueEntry with position and estimated wait time
        """

        # Validate
        conversation = await self._validate_conversation(conversation_id)
        queue = await self._validate_queue(queue_id, conversation.tenant_id)

        # Calculate priority score
        priority_score = await self._calculate_priority_score(
            priority=priority,
            customer=conversation.customer,
            queue_policy=queue.policy
        )

        # Redis sorted set key pattern: queue:{tenant_id}:{queue_id}
        redis_key = f"queue:{conversation.tenant_id}:{queue_id}"

        # Add to Redis sorted set (score = priority_score + timestamp)
        timestamp = datetime.utcnow().timestamp()
        score = (priority_score * 1_000_000) + timestamp  # Priority takes precedence

        await self.redis_client.zadd(
            redis_key,
            {conversation_id: score}
        )

        # Create database record
        queue_entry = QueueEntry(
            conversation_id=conversation_id,
            queue_id=queue_id,
            tenant_id=conversation.tenant_id,
            priority=priority,
            priority_score=priority_score,
            enqueued_at=datetime.utcnow(),
            estimated_wait_time=await self._estimate_wait_time(queue_id)
        )
        self.db.add(queue_entry)
        await self.db.commit()

        # Update queue metrics
        await self._update_queue_metrics(queue_id)

        # Start SLA timer
        await self._start_sla_timer(queue_entry)

        # Trigger assignment check
        await self.assignment_engine.process_queue(queue_id)

        return queue_entry

    async def dequeue_conversation(
        self,
        conversation_id: str,
        reason: str = "assigned"
    ):
        """
        Remove conversation from queue.

        Reasons: assigned, closed, transferred, timed_out
        """

        queue_entry = await self._get_queue_entry(conversation_id)

        # Remove from Redis
        redis_key = f"queue:{queue_entry.tenant_id}:{queue_entry.queue_id}"
        await self.redis_client.zrem(redis_key, conversation_id)

        # Update database
        queue_entry.dequeued_at = datetime.utcnow()
        queue_entry.dequeue_reason = reason
        queue_entry.wait_time_seconds = (
            queue_entry.dequeued_at - queue_entry.enqueued_at
        ).total_seconds()

        await self.db.commit()

        # Update metrics
        await self._update_queue_metrics(queue_entry.queue_id)

    async def requeue_conversation(
        self,
        conversation_id: str,
        new_queue_id: str,
        reason: str = "transfer"
    ):
        """
        Transfer conversation to different queue.

        Use cases:
        - Transfer from support to technical support
        - Escalate to supervisor queue
        - Reassign to different department
        """

        # Dequeue from current
        await self.dequeue_conversation(conversation_id, reason="transfer")

        # Get conversation priority
        conversation = await self._get_conversation(conversation_id)

        # Enqueue to new queue
        await self.enqueue_conversation(
            conversation_id=conversation_id,
            queue_id=new_queue_id,
            priority=conversation.priority,
            metadata={"transfer_reason": reason}
        )

    # ==================== Queue Inspection ====================

    async def get_queue_position(
        self,
        conversation_id: str
    ) -> int:
        """Get conversation's position in queue (1-indexed)."""

        queue_entry = await self._get_queue_entry(conversation_id)
        redis_key = f"queue:{queue_entry.tenant_id}:{queue_entry.queue_id}"

        # Get rank in sorted set (0-indexed)
        rank = await self.redis_client.zrevrank(redis_key, conversation_id)
        return (rank + 1) if rank is not None else None

    async def get_queue_depth(
        self,
        queue_id: str,
        tenant_id: str
    ) -> int:
        """Get number of waiting conversations."""

        redis_key = f"queue:{tenant_id}:{queue_id}"
        return await self.redis_client.zcard(redis_key)

    async def get_next_conversation(
        self,
        queue_id: str,
        tenant_id: str
    ) -> Optional[str]:
        """
        Get highest priority conversation without removing from queue.

        Returns conversation_id or None if queue empty.
        """

        redis_key = f"queue:{tenant_id}:{queue_id}"

        # Get highest score (ZREVRANGE returns highest first)
        result = await self.redis_client.zrevrange(
            redis_key,
            start=0,
            end=0
        )

        return result[0] if result else None

    async def peek_queue(
        self,
        queue_id: str,
        tenant_id: str,
        limit: int = 10
    ) -> List[QueueEntry]:
        """Get top N conversations in queue without dequeuing."""

        redis_key = f"queue:{tenant_id}:{queue_id}"

        # Get top conversations by score
        conversation_ids = await self.redis_client.zrevrange(
            redis_key,
            start=0,
            end=limit - 1
        )

        # Fetch queue entries
        return await self._get_queue_entries(conversation_ids)

    # ==================== Metrics & Analytics ====================

    async def get_queue_metrics(
        self,
        queue_id: str,
        tenant_id: str
    ) -> QueueMetrics:
        """
        Get real-time queue metrics.

        Returns:
            QueueMetrics with:
            - current_depth: Number of waiting conversations
            - avg_wait_time: Average wait time (seconds)
            - longest_wait: Longest waiting conversation
            - conversations_today: Total queued today
            - avg_assignment_time: Average time to assignment
        """

    async def _estimate_wait_time(
        self,
        queue_id: str
    ) -> int:
        """
        Estimate wait time in seconds based on:
        - Current queue depth
        - Available agents
        - Historical average handling time
        """

        queue_depth = await self.get_queue_depth(queue_id, tenant_id)
        available_agents = await self.agent_availability.get_available_count(queue_id)
        avg_handling_time = await self._get_avg_handling_time(queue_id)

        if available_agents == 0:
            # No agents available - return worst case
            return queue_depth * avg_handling_time

        # Simple estimation: (queue_depth / available_agents) * avg_handling_time
        return int((queue_depth / available_agents) * avg_handling_time)

    async def _calculate_priority_score(
        self,
        priority: ConversationPriority,
        customer: Customer,
        queue_policy: QueuePolicy
    ) -> float:
        """
        Calculate priority score (0-100).

        Factors:
        - Base priority (low=10, normal=50, high=75, urgent=90, vip=95)
        - Customer tier (free=0, premium=+10, vip=+20)
        - Wait time penalty (+1 per minute waiting)
        - SLA proximity (near breach = +15)
        """

        # Base priority
        base_scores = {
            ConversationPriority.LOW: 10,
            ConversationPriority.NORMAL: 50,
            ConversationPriority.HIGH: 75,
            ConversationPriority.URGENT: 90,
            ConversationPriority.VIP: 95
        }
        score = base_scores.get(priority, 50)

        # Customer tier bonus
        if customer.tier == "vip":
            score += 20
        elif customer.tier == "premium":
            score += 10

        # Apply queue policy modifiers
        if queue_policy.vip_boost_enabled and customer.tier == "vip":
            score = min(100, score + queue_policy.vip_boost_amount)

        return float(score)

    # ==================== SLA Management ====================

    async def _start_sla_timer(
        self,
        queue_entry: QueueEntry
    ):
        """
        Start SLA timer for conversation.

        Creates Redis key with TTL matching SLA target.
        When TTL expires, triggers escalation.
        """

        queue = await self.get_queue(queue_entry.queue_id, queue_entry.tenant_id)
        sla_seconds = queue.sla_target_seconds

        if sla_seconds:
            # Redis key: sla_timer:{conversation_id}
            sla_key = f"sla_timer:{queue_entry.conversation_id}"

            # Store queue entry data with TTL
            await self.redis_client.setex(
                sla_key,
                sla_seconds,
                queue_entry.json()
            )

            # Set up keyspace notification for expiration
            # (Handled by escalation_manager listening to Redis keyspace events)
```

### Queue Storage Strategy

**Redis Sorted Sets** for active queues:
- Key: `queue:{tenant_id}:{queue_id}`
- Members: `conversation_id`
- Scores: `(priority_score * 1,000,000) + timestamp`
- Benefits:
  - O(log N) insertion and removal
  - O(1) queue depth check
  - Automatic sorting by priority
  - Sub-millisecond queue operations

**PostgreSQL** for queue history:
- Permanent record of queue entries
- Analytics and reporting
- SLA compliance auditing

---

## 2. Assignment Engine (`assignment_engine.py`)

### Overview

The Assignment Engine is responsible for matching conversations from queues to available agents using configurable strategies.

### Responsibilities

1. **Strategy Execution**
   - Execute configured assignment strategy (round-robin, least-busy, skills-based)
   - Handle multiple strategies per queue
   - Support fallback strategies

2. **Agent Selection**
   - Find best-fit agent based on strategy
   - Respect agent capacity limits
   - Consider agent skills and preferences

3. **Assignment Lifecycle**
   - Create conversation-agent assignment
   - Update agent workload
   - Notify agent via WebSocket
   - Track assignment metrics

### Architecture

```python
class AssignmentEngine:
    """
    Conversation-to-agent assignment orchestrator.

    Executes configurable routing strategies to match
    conversations with the best available agents.
    """

    def __init__(self):
        self.db = get_database_session()
        self.redis_client = get_redis_client()
        self.agent_availability = AgentAvailabilityService()
        self.queue_notifier = QueueNotifier()

        # Strategy registry
        self.strategies = {
            "round_robin": RoundRobinStrategy(),
            "least_busy": LeastBusyStrategy(),
            "skills_based": SkillsBasedStrategy(),
            "load_balancing": LoadBalancingStrategy(),
            "vip_priority": VIPPriorityStrategy()
        }

    # ==================== Main Assignment Flow ====================

    async def process_queue(
        self,
        queue_id: str
    ):
        """
        Process queue and assign conversations to agents.

        Called when:
        - New conversation enters queue
        - Agent becomes available
        - Agent closes conversation (capacity freed)
        - Periodic queue processing (every 5 seconds)

        Flow:
        1. Get queue configuration
        2. Get available agents for this queue
        3. While (queue not empty AND agents available):
           a. Get next conversation from queue
           b. Execute assignment strategy
           c. Assign conversation to selected agent
           d. Update agent capacity
           e. Notify agent
        """

        queue = await self._get_queue(queue_id)

        # Get available agents
        available_agents = await self.agent_availability.get_available_agents(
            queue_id=queue_id,
            tenant_id=queue.tenant_id
        )

        if not available_agents:
            # No agents available - exit
            return

        # Get assignment strategy
        strategy = self.strategies.get(
            queue.routing_strategy,
            self.strategies["round_robin"]  # Default
        )

        # Process queue until empty or no agents available
        assignments_made = 0

        while available_agents:
            # Get next conversation
            conversation_id = await self.queue_manager.get_next_conversation(
                queue_id=queue_id,
                tenant_id=queue.tenant_id
            )

            if not conversation_id:
                # Queue empty
                break

            # Execute strategy to select agent
            selected_agent = await strategy.select_agent(
                conversation_id=conversation_id,
                available_agents=available_agents,
                queue=queue
            )

            if not selected_agent:
                # Strategy couldn't find suitable agent
                break

            # Assign conversation to agent
            assignment = await self.assign_conversation(
                conversation_id=conversation_id,
                agent_id=selected_agent.id,
                queue_id=queue_id
            )

            assignments_made += 1

            # Update available agents list
            if not await self.agent_availability.has_capacity(selected_agent.id):
                available_agents.remove(selected_agent)

        # Log assignment batch
        if assignments_made > 0:
            await self._log_assignment_batch(
                queue_id=queue_id,
                assignments_count=assignments_made
            )

    async def assign_conversation(
        self,
        conversation_id: str,
        agent_id: str,
        queue_id: str
    ) -> Assignment:
        """
        Assign conversation to agent.

        Steps:
        1. Remove from queue
        2. Create assignment record
        3. Update conversation status
        4. Update agent workload
        5. Notify agent via WebSocket
        6. Track metrics
        """

        conversation = await self._get_conversation(conversation_id)
        agent = await self._get_agent(agent_id)
        queue_entry = await self._get_queue_entry(conversation_id)

        # Remove from queue
        await self.queue_manager.dequeue_conversation(
            conversation_id=conversation_id,
            reason="assigned"
        )

        # Create assignment
        assignment = Assignment(
            conversation_id=conversation_id,
            agent_id=agent_id,
            queue_id=queue_id,
            tenant_id=conversation.tenant_id,
            assigned_at=datetime.utcnow(),
            wait_time_seconds=queue_entry.wait_time_seconds
        )
        self.db.add(assignment)

        # Update conversation
        conversation.status = "assigned"
        conversation.assigned_agent_id = agent_id
        conversation.assigned_at = datetime.utcnow()

        # Update agent workload
        await self.agent_availability.increment_workload(agent_id)

        await self.db.commit()

        # Notify agent via WebSocket
        await self.queue_notifier.notify_assignment(
            agent_id=agent_id,
            conversation=conversation,
            assignment=assignment
        )

        # Track metrics
        await self._track_assignment_metrics(assignment, queue_entry)

        return assignment

    async def unassign_conversation(
        self,
        conversation_id: str,
        reason: str = "closed"
    ):
        """
        Unassign conversation from agent.

        Reasons: closed, transferred, reassigned, timed_out
        """

        assignment = await self._get_active_assignment(conversation_id)

        # Update assignment
        assignment.unassigned_at = datetime.utcnow()
        assignment.unassign_reason = reason
        assignment.duration_seconds = (
            assignment.unassigned_at - assignment.assigned_at
        ).total_seconds()

        # Update conversation
        conversation = await self._get_conversation(conversation_id)
        conversation.assigned_agent_id = None

        # Update agent workload
        await self.agent_availability.decrement_workload(assignment.agent_id)

        await self.db.commit()

        # Trigger queue processing (agent now has capacity)
        await self.process_queue(assignment.queue_id)

    # ==================== Strategy Selection ====================

    async def get_strategy(
        self,
        queue: Queue
    ) -> AssignmentStrategy:
        """
        Get assignment strategy for queue.

        Supports:
        - Primary strategy (configured)
        - Fallback strategy (if primary fails)
        - Time-based strategy switching
        """

        strategy_name = queue.routing_strategy

        # Check for time-based overrides
        if queue.routing_overrides:
            current_hour = datetime.utcnow().hour
            for override in queue.routing_overrides:
                if override["start_hour"] <= current_hour < override["end_hour"]:
                    strategy_name = override["strategy"]
                    break

        return self.strategies.get(
            strategy_name,
            self.strategies["round_robin"]
        )
```

---

## 3. Agent Availability Service (`agent_availability_service.py`)

### Overview

Tracks agent online/offline status, active conversations, and capacity limits in real-time.

### Responsibilities

1. **Status Tracking**
   - Track agent online/offline/away/busy status
   - Monitor last activity timestamp
   - Handle automatic status changes (idle timeout)

2. **Capacity Management**
   - Track active conversations per agent
   - Enforce max conversation limits
   - Calculate available capacity

3. **Agent Filtering**
   - Get available agents for queue
   - Filter by skills, team, status
   - Sort by workload or priority

### Architecture

```python
class AgentAvailabilityService:
    """
    Real-time agent status and capacity tracking.

    Uses Redis for fast status checks and PostgreSQL
    for persistent agent configuration.
    """

    def __init__(self):
        self.redis_client = get_redis_client()
        self.db = get_database_session()

    # ==================== Status Management ====================

    async def set_status(
        self,
        agent_id: str,
        status: AgentStatus,
        tenant_id: str
    ):
        """
        Set agent status.

        Statuses:
        - online: Ready to receive conversations
        - busy: At capacity, no new conversations
        - away: Temporarily unavailable
        - offline: Not working

        Redis storage:
        Key: agent_status:{tenant_id}:{agent_id}
        Value: {"status": "online", "updated_at": "2026-03-15T10:30:00Z"}
        TTL: 5 minutes (auto-offline if no heartbeat)
        """

        redis_key = f"agent_status:{tenant_id}:{agent_id}"

        status_data = {
            "status": status.value,
            "updated_at": datetime.utcnow().isoformat()
        }

        # Set with TTL
        await self.redis_client.setex(
            redis_key,
            300,  # 5 minutes
            json.dumps(status_data)
        )

        # Update database
        agent = await self._get_agent(agent_id)
        agent.current_status = status
        agent.status_updated_at = datetime.utcnow()
        await self.db.commit()

        # If going online, trigger queue processing
        if status == AgentStatus.ONLINE:
            await self._trigger_queue_processing_for_agent(agent_id)

    async def get_status(
        self,
        agent_id: str,
        tenant_id: str
    ) -> AgentStatus:
        """Get current agent status."""

        redis_key = f"agent_status:{tenant_id}:{agent_id}"
        status_data = await self.redis_client.get(redis_key)

        if status_data:
            data = json.loads(status_data)
            return AgentStatus(data["status"])

        # Not in Redis = offline
        return AgentStatus.OFFLINE

    async def heartbeat(
        self,
        agent_id: str,
        tenant_id: str
    ):
        """
        Agent heartbeat to prevent auto-offline.

        Called every 30 seconds from agent frontend.
        Refreshes TTL on status key.
        """

        current_status = await self.get_status(agent_id, tenant_id)

        if current_status != AgentStatus.OFFLINE:
            await self.set_status(agent_id, current_status, tenant_id)

    # ==================== Capacity Management ====================

    async def get_workload(
        self,
        agent_id: str
    ) -> int:
        """Get number of active conversations for agent."""

        redis_key = f"agent_workload:{agent_id}"
        workload = await self.redis_client.get(redis_key)
        return int(workload) if workload else 0

    async def increment_workload(
        self,
        agent_id: str
    ):
        """Increment active conversation count."""

        redis_key = f"agent_workload:{agent_id}"
        new_workload = await self.redis_client.incr(redis_key)

        # Check if now at capacity
        agent = await self._get_agent(agent_id)
        if new_workload >= agent.max_conversations:
            await self.set_status(agent_id, AgentStatus.BUSY, agent.tenant_id)

    async def decrement_workload(
        self,
        agent_id: str
    ):
        """Decrement active conversation count."""

        redis_key = f"agent_workload:{agent_id}"
        new_workload = await self.redis_client.decr(redis_key)

        # Ensure non-negative
        if new_workload < 0:
            await self.redis_client.set(redis_key, 0)
            new_workload = 0

        # If was busy and now has capacity, set to online
        agent = await self._get_agent(agent_id)
        current_status = await self.get_status(agent_id, agent.tenant_id)

        if current_status == AgentStatus.BUSY and new_workload < agent.max_conversations:
            await self.set_status(agent_id, AgentStatus.ONLINE, agent.tenant_id)

    async def has_capacity(
        self,
        agent_id: str
    ) -> bool:
        """Check if agent can accept new conversations."""

        agent = await self._get_agent(agent_id)
        workload = await self.get_workload(agent_id)
        status = await self.get_status(agent_id, agent.tenant_id)

        return (
            status == AgentStatus.ONLINE and
            workload < agent.max_conversations
        )

    # ==================== Agent Filtering ====================

    async def get_available_agents(
        self,
        queue_id: str,
        tenant_id: str,
        filters: Dict = None
    ) -> List[Agent]:
        """
        Get agents available for queue.

        Filters:
        - status = online
        - has capacity
        - member of queue (via queue_members table)
        - matches skill requirements (if applicable)
        - not on break

        Returns agents sorted by workload (least busy first).
        """

        # Get queue members
        queue_members = await self._get_queue_members(queue_id)
        agent_ids = [m.agent_id for m in queue_members]

        if not agent_ids:
            return []

        # Get agents
        agents = await self.db.query(Agent).filter(
            Agent.id.in_(agent_ids),
            Agent.tenant_id == tenant_id,
            Agent.is_active == True
        ).all()

        # Filter by availability
        available = []
        for agent in agents:
            if await self.has_capacity(agent.id):
                workload = await self.get_workload(agent.id)
                agent.current_workload = workload
                available.append(agent)

        # Sort by workload (least busy first)
        available.sort(key=lambda a: a.current_workload)

        return available

    async def get_available_count(
        self,
        queue_id: str
    ) -> int:
        """Get count of available agents for queue."""

        agents = await self.get_available_agents(queue_id)
        return len(agents)
```

---

## 4. Priority Router (`priority_router.py`)

### Overview

Manages conversation priority levels, SLA enforcement, and priority-based routing decisions.

### Responsibilities

1. **Priority Classification**
   - Assign priority to conversations (low, normal, high, urgent, vip)
   - Auto-detect urgency from message content
   - Apply VIP customer priority

2. **SLA Management**
   - Define SLA targets per queue/priority
   - Monitor SLA compliance
   - Trigger escalation on SLA breach

3. **Priority-Based Routing**
   - Route high-priority conversations first
   - Boost priority for long-waiting conversations
   - Apply queue policies for priority handling

### Architecture

```python
class PriorityRouter:
    """
    Conversation priority management and SLA enforcement.
    """

    def __init__(self):
        self.db = get_database_session()
        self.intent_detector = IntentDetector()

    # ==================== Priority Classification ====================

    async def classify_priority(
        self,
        conversation: Conversation,
        message: Message
    ) -> ConversationPriority:
        """
        Classify conversation priority.

        Priority Factors:
        1. Customer tier (vip=VIP, premium=HIGH, free=NORMAL)
        2. Message urgency (detected from text)
        3. Intent type (complaint=HIGH, inquiry=NORMAL)
        4. Time sensitivity (booking today=URGENT)
        5. Previous escalations (escalated before=HIGH)

        Priority Levels:
        - VIP: VIP customers, critical issues
        - URGENT: Time-sensitive, requires immediate attention
        - HIGH: Important but not critical
        - NORMAL: Standard priority
        - LOW: Non-urgent inquiries
        """

        customer = conversation.customer

        # VIP customer = VIP priority
        if customer.tier == "vip":
            return ConversationPriority.VIP

        # Detect urgency from message
        urgency_signals = await self._detect_urgency_signals(message.text)

        if urgency_signals["is_urgent"]:
            return ConversationPriority.URGENT

        # Check intent
        intent_result = await self.intent_detector.detect_intent(
            message.text,
            conversation_context=None
        )

        if intent_result.intent in ["support.complaint", "booking.urgent"]:
            return ConversationPriority.HIGH

        # Premium customer = HIGH
        if customer.tier == "premium":
            return ConversationPriority.HIGH

        # Default
        return ConversationPriority.NORMAL

    async def _detect_urgency_signals(
        self,
        message_text: str
    ) -> Dict:
        """
        Detect urgency from message text.

        Signals:
        - Keywords: "urgent", "emergency", "asap", "immediately"
        - Time references: "today", "right now", "as soon as possible"
        - Emotional intensity: excessive caps, exclamation marks

        Returns:
            {
                "is_urgent": bool,
                "urgency_score": 0-100,
                "signals": ["urgent_keyword", "time_pressure"]
            }
        """

        text_lower = message_text.lower()
        signals = []
        score = 0

        # Urgency keywords
        urgent_keywords = ["urgent", "emergency", "asap", "critical", "immediately"]
        if any(keyword in text_lower for keyword in urgent_keywords):
            signals.append("urgent_keyword")
            score += 40

        # Time pressure
        time_keywords = ["today", "right now", "as soon as possible", "within the hour"]
        if any(keyword in text_lower for keyword in time_keywords):
            signals.append("time_pressure")
            score += 30

        # Emotional intensity
        caps_ratio = sum(1 for c in message_text if c.isupper()) / max(len(message_text), 1)
        if caps_ratio > 0.5:
            signals.append("high_caps")
            score += 20

        exclamation_count = message_text.count("!")
        if exclamation_count >= 3:
            signals.append("multiple_exclamations")
            score += 10

        return {
            "is_urgent": score >= 50,
            "urgency_score": min(score, 100),
            "signals": signals
        }

    # ==================== SLA Management ====================

    async def get_sla_target(
        self,
        queue_id: str,
        priority: ConversationPriority
    ) -> int:
        """
        Get SLA target time in seconds for queue and priority.

        Example SLA targets:
        VIP: 60 seconds (1 minute)
        URGENT: 300 seconds (5 minutes)
        HIGH: 600 seconds (10 minutes)
        NORMAL: 1800 seconds (30 minutes)
        LOW: 3600 seconds (1 hour)
        """

        queue = await self._get_queue(queue_id)

        # Check queue-specific SLA rules
        if queue.sla_rules:
            for rule in queue.sla_rules:
                if rule["priority"] == priority.value:
                    return rule["target_seconds"]

        # Default SLA targets
        defaults = {
            ConversationPriority.VIP: 60,
            ConversationPriority.URGENT: 300,
            ConversationPriority.HIGH: 600,
            ConversationPriority.NORMAL: 1800,
            ConversationPriority.LOW: 3600
        }

        return defaults.get(priority, 1800)

    async def check_sla_compliance(
        self,
        queue_entry: QueueEntry
    ) -> bool:
        """Check if conversation is within SLA target."""

        sla_target = await self.get_sla_target(
            queue_entry.queue_id,
            queue_entry.priority
        )

        wait_time = (datetime.utcnow() - queue_entry.enqueued_at).total_seconds()

        return wait_time <= sla_target

    async def get_sla_breach_time(
        self,
        queue_entry: QueueEntry
    ) -> Optional[datetime]:
        """Calculate when SLA will be breached."""

        sla_target = await self.get_sla_target(
            queue_entry.queue_id,
            queue_entry.priority
        )

        return queue_entry.enqueued_at + timedelta(seconds=sla_target)
```

---

## 5. Queue Policies (`queue_policies.py`)

### Overview

Defines configurable policies for queue behavior, assignment rules, and overflow strategies.

### Responsibilities

1. **Assignment Policies**
   - Max conversations per agent
   - Agent availability requirements
   - Skill matching rules

2. **Overflow Strategies**
   - What to do when all agents busy
   - Transfer to backup queue
   - Enable callback requests
   - AI-only mode

3. **Routing Rules**
   - Time-based routing
   - VIP customer handling
   - Priority boosting rules

### Architecture

```python
class QueuePolicies:
    """
    Configurable policies for queue behavior.
    """

    # ==================== Policy Definition ====================

    class QueuePolicy(BaseModel):
        """Queue policy configuration."""

        # Assignment limits
        max_conversations_per_agent: int = 5
        require_online_status: bool = True
        require_skill_match: bool = False

        # Overflow handling
        overflow_strategy: str = "queue"  # queue, transfer, callback, ai_only
        overflow_queue_id: Optional[str] = None
        enable_callback: bool = True

        # Priority handling
        vip_boost_enabled: bool = True
        vip_boost_amount: int = 20
        wait_time_boost_enabled: bool = True
        wait_time_boost_per_minute: int = 1

        # Time-based rules
        business_hours_only: bool = False
        business_hours: Optional[Dict] = None  # {"start": "09:00", "end": "17:00"}
        after_hours_strategy: str = "queue"  # queue, ai_only, callback

        # SLA settings
        sla_enabled: bool = True
        sla_targets: Dict[str, int] = {
            "vip": 60,
            "urgent": 300,
            "high": 600,
            "normal": 1800,
            "low": 3600
        }

    # ==================== Policy Enforcement ====================

    async def enforce_policy(
        self,
        queue: Queue,
        conversation: Conversation
    ) -> Dict:
        """
        Enforce queue policy for conversation.

        Returns:
            {
                "allowed": bool,
                "action": "queue" | "transfer" | "ai_only",
                "reason": str,
                "target_queue_id": Optional[str]
            }
        """

        policy = queue.policy

        # Check business hours
        if policy.business_hours_only:
            in_business_hours = await self._check_business_hours(
                policy.business_hours
            )

            if not in_business_hours:
                if policy.after_hours_strategy == "ai_only":
                    return {
                        "allowed": False,
                        "action": "ai_only",
                        "reason": "Outside business hours - AI handling only"
                    }
                elif policy.after_hours_strategy == "callback":
                    return {
                        "allowed": False,
                        "action": "callback",
                        "reason": "Outside business hours - callback requested"
                    }

        # Check overflow
        queue_depth = await self.queue_manager.get_queue_depth(
            queue.id,
            queue.tenant_id
        )
        available_agents = await self.agent_availability.get_available_count(
            queue.id
        )

        if available_agents == 0 and queue_depth > 10:
            # Apply overflow strategy
            if policy.overflow_strategy == "transfer" and policy.overflow_queue_id:
                return {
                    "allowed": True,
                    "action": "transfer",
                    "reason": "Queue at capacity - transferring to overflow queue",
                    "target_queue_id": policy.overflow_queue_id
                }
            elif policy.overflow_strategy == "ai_only":
                return {
                    "allowed": False,
                    "action": "ai_only",
                    "reason": "Queue at capacity - AI handling only"
                }

        # Allow queueing
        return {
            "allowed": True,
            "action": "queue",
            "reason": "Normal queueing"
        }

    async def _check_business_hours(
        self,
        business_hours: Dict
    ) -> bool:
        """Check if current time is within business hours."""

        now = datetime.utcnow()
        current_time = now.time()

        start_time = datetime.strptime(business_hours["start"], "%H:%M").time()
        end_time = datetime.strptime(business_hours["end"], "%H:%M").time()

        return start_time <= current_time <= end_time
```

---

## Assignment Strategies

### Base Strategy Interface

```python
class AssignmentStrategy(ABC):
    """Abstract base class for assignment strategies."""

    @abstractmethod
    async def select_agent(
        self,
        conversation_id: str,
        available_agents: List[Agent],
        queue: Queue
    ) -> Optional[Agent]:
        """
        Select best agent for conversation.

        Returns:
            Agent object or None if no suitable agent found
        """
        pass
```

### 1. Round Robin Strategy (`strategies/round_robin.py`)

```python
class RoundRobinStrategy(AssignmentStrategy):
    """
    Round-robin assignment - cycle through agents equally.

    Maintains counter in Redis to track last assigned agent.
    """

    async def select_agent(
        self,
        conversation_id: str,
        available_agents: List[Agent],
        queue: Queue
    ) -> Optional[Agent]:
        if not available_agents:
            return None

        # Get last assigned agent index from Redis
        redis_key = f"rr_counter:{queue.id}"
        last_index = await redis_client.get(redis_key)
        last_index = int(last_index) if last_index else -1

        # Next agent (circular)
        next_index = (last_index + 1) % len(available_agents)

        # Update counter
        await redis_client.set(redis_key, next_index)

        return available_agents[next_index]
```

### 2. Least Busy Strategy (`strategies/least_busy.py`)

```python
class LeastBusyStrategy(AssignmentStrategy):
    """
    Assign to agent with fewest active conversations.
    """

    async def select_agent(
        self,
        conversation_id: str,
        available_agents: List[Agent],
        queue: Queue
    ) -> Optional[Agent]:
        if not available_agents:
            return None

        # Agents already sorted by workload in get_available_agents()
        # Return first (least busy)
        return available_agents[0]
```

### 3. Skills-Based Strategy (`strategies/skills_based.py`)

```python
class SkillsBasedStrategy(AssignmentStrategy):
    """
    Match conversation requirements to agent skills.

    Use cases:
    - Technical support → agents with "technical" skill
    - Spanish conversation → agents with "spanish" skill
    - VIP customer → agents with "vip_handling" skill
    """

    async def select_agent(
        self,
        conversation_id: str,
        available_agents: List[Agent],
        queue: Queue
    ) -> Optional[Agent]:

        conversation = await self._get_conversation(conversation_id)

        # Determine required skills
        required_skills = await self._get_required_skills(conversation)

        # Filter agents by skills
        skilled_agents = []
        for agent in available_agents:
            agent_skills = set(agent.skills or [])
            if required_skills.issubset(agent_skills):
                skilled_agents.append(agent)

        if not skilled_agents:
            # Fallback to least busy if no skill match
            return available_agents[0] if available_agents else None

        # Return least busy skilled agent
        return skilled_agents[0]

    async def _get_required_skills(
        self,
        conversation: Conversation
    ) -> Set[str]:
        """Determine required skills for conversation."""

        skills = set()

        # Language skill
        if conversation.customer_language != "en":
            skills.add(f"language_{conversation.customer_language}")

        # VIP handling
        if conversation.customer.tier == "vip":
            skills.add("vip_handling")

        # Technical support (based on intent)
        # ... (intent-based skill detection)

        return skills
```

---

## Queue Routing Flow (Complete)

```
┌─────────────────────────────────────────────────────────────┐
│                    Customer Message Received                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Intent Detection                          │
│                 (services/automation/intent_detector.py)     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
         Automatable│             │Requires Human
                    │             │
                    ▼             ▼
        ┌───────────────┐  ┌───────────────┐
        │ AI Automation │  │ Queue Router  │
        │    Handles    │  │  Routes to    │
        │  (Complete)   │  │    Queue      │
        └───────────────┘  └───────┬───────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   Priority Classification    │
                    │  (priority_router.py)        │
                    │  - Detect urgency            │
                    │  - Check customer tier       │
                    │  - Calculate priority score  │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │    Enforce Queue Policy      │
                    │  (queue_policies.py)         │
                    │  - Check business hours      │
                    │  - Check overflow            │
                    │  - Determine action          │
                    └──────────┬───────────────────┘
                               │
                        ┌──────┴──────┐
                        │             │
               Allowed  │             │ Not Allowed
                        │             │
                        ▼             ▼
        ┌───────────────────┐  ┌─────────────────┐
        │  Enqueue          │  │  AI-Only or     │
        │  Conversation     │  │  Callback       │
        │  (queue_manager)  │  └─────────────────┘
        └────────┬──────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │  Add to Redis Sorted Set   │
    │  Score = Priority + Time   │
    │  Start SLA Timer           │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │  Trigger Assignment        │
    │  (assignment_engine)       │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │  Get Available Agents      │
    │  (agent_availability)      │
    │  - Status = online         │
    │  - Has capacity            │
    │  - Queue member            │
    └────────┬───────────────────┘
             │
      ┌──────┴──────┐
      │             │
  Agents│           │No Agents
Available│           │
      │             │
      ▼             ▼
┌─────────────┐  ┌──────────────┐
│   Execute   │  │ Conversation │
│  Strategy   │  │ Remains in   │
│             │  │    Queue     │
└──────┬──────┘  └──────────────┘
       │
       ▼
┌────────────────────┐
│  Select Agent      │
│  - Round Robin     │
│  - Least Busy      │
│  - Skills-Based    │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Assign            │
│  - Remove from Q   │
│  - Create assign   │
│  - Update workload │
│  - Notify agent    │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Agent Dashboard   │
│  Shows new convo   │
│  via WebSocket     │
└────────────────────┘
```

---

## Integration with AI Automation Layer

### Decision Point: Queue vs Automate

```python
# services/automation/queue_router.py

class QueueRouter:
    """
    Decides whether to route to queue or handle via AI automation.
    """

    async def route(
        self,
        message: Message,
        conversation: Conversation
    ) -> RoutingDecision:
        """
        Routing logic:

        1. Detect intent
        2. Classify (automatable vs human-required)
        3. If automatable:
           - Execute action handler
           - If successful → done
           - If failed → fallback to queue
        4. If human-required:
           - Route to queue
        5. If ambiguous:
           - AI response first
           - Queue if customer unsatisfied
        """

        # Step 1: Detect intent
        intent_result = await self.intent_detector.detect_intent(
            message.text,
            conversation_context=await self.context_builder.build_context(
                conversation.id
            )
        )

        # Step 2: Classify
        classification = await self.intent_classifier.classify(
            intent_result,
            conversation
        )

        # Step 3: Route based on classification
        if classification.category == "automatable":
            # Try automation
            action_result = await self.action_router.route(
                classification,
                message,
                conversation
            )

            if action_result.success:
                return RoutingDecision(
                    action="automated",
                    handler=action_result.handler,
                    result=action_result
                )
            else:
                # Automation failed → queue
                return RoutingDecision(
                    action="queue",
                    queue_id=await self._select_queue(conversation),
                    reason="automation_failed",
                    fallback=True
                )

        elif classification.category == "human_required":
            # Route to queue
            queue_id = await self._select_queue(conversation)

            return RoutingDecision(
                action="queue",
                queue_id=queue_id,
                reason="human_required"
            )

        elif classification.category == "ai_assisted":
            # AI can provide response, but offer human option
            ai_response = await self.llm_client.generate_response(
                intent_result,
                conversation
            )

            # Send AI response
            await self.message_service.send_message(
                conversation_id=conversation.id,
                sender_id="ai",
                text=ai_response.text,
                metadata={"ai_generated": True}
            )

            # Append "Would you like to speak with an agent?" option
            return RoutingDecision(
                action="ai_with_human_option",
                ai_response=ai_response,
                queue_option=True
            )

        else:
            # Ambiguous → queue by default
            return RoutingDecision(
                action="queue",
                queue_id=await self._select_queue(conversation),
                reason="ambiguous_intent"
            )

    async def _select_queue(
        self,
        conversation: Conversation
    ) -> str:
        """
        Select appropriate queue based on:
        - Intent type (sales, support, technical)
        - Customer tier (vip → dedicated queue)
        - Language (multilingual queues)
        - Time of day (business hours vs after-hours)
        """

        # VIP customers → VIP queue
        if conversation.customer.tier == "vip":
            return await self._get_vip_queue_id(conversation.tenant_id)

        # Intent-based routing
        intent_result = await self.intent_detector.detect_intent_cached(
            conversation.id
        )

        if "booking" in intent_result.intent:
            return await self._get_booking_queue_id(conversation.tenant_id)
        elif "support" in intent_result.intent:
            return await self._get_support_queue_id(conversation.tenant_id)
        elif "technical" in intent_result.intent:
            return await self._get_technical_queue_id(conversation.tenant_id)

        # Default queue
        return await self._get_default_queue_id(conversation.tenant_id)
```

### Hybrid Flow Example

```
Customer: "I want to book a room for April 15-18"
    ↓
Intent Detection: booking.new (confidence: 0.97)
    ↓
Classification: automatable
    ↓
Action Router → Booking Handler
    ↓
Check availability via PMS API
    ↓
If available:
  → AI: "Great! We have availability. Would you prefer Standard ($120) or Deluxe ($180)?"
  → Customer responds
  → Complete booking automatically
  → Done (no queue needed)
    ↓
If NOT available:
  → AI: "I'm sorry, we're fully booked for those dates."
  → Fallback: "Let me connect you with our reservations team to find alternatives."
  → Route to Queue (Reservations Queue)
  → Queue Manager enqueues conversation
  → Assignment Engine assigns to available agent
  → Agent sees: "Customer looking for April 15-18 (not available). Help find alternative dates."
```

---

## Data Entities (Conceptual for Phase 3)

### 1. `queues` Table

```sql
CREATE TABLE queues (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    name VARCHAR(255) NOT NULL,           -- "Sales Queue", "VIP Support"
    queue_type VARCHAR(100),              -- sales, support, technical, vip
    description TEXT,

    -- Routing
    routing_strategy VARCHAR(50),         -- round_robin, least_busy, skills_based
    routing_overrides JSONB,              -- Time-based strategy changes

    -- Capacity
    max_queue_depth INTEGER,              -- Max waiting conversations
    overflow_queue_id UUID,               -- Overflow destination

    -- SLA
    sla_enabled BOOLEAN DEFAULT TRUE,
    sla_target_seconds INTEGER,           -- Default SLA target
    sla_rules JSONB,                      -- Priority-specific SLA

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (overflow_queue_id) REFERENCES queues(id)
);

CREATE INDEX idx_queues_tenant ON queues(tenant_id);
CREATE INDEX idx_queues_type ON queues(queue_type);
CREATE INDEX idx_queues_active ON queues(is_active) WHERE is_active = true;
```

### 2. `queue_members` Table

```sql
CREATE TABLE queue_members (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    queue_id UUID NOT NULL,
    agent_id UUID NOT NULL,

    -- Skills
    skills JSONB,                         -- ["spanish", "vip_handling", "technical"]

    -- Capacity
    max_conversations INTEGER DEFAULT 5,  -- Agent-specific limit
    priority_level INTEGER DEFAULT 0,     -- Agent priority within queue

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(queue_id, agent_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (queue_id) REFERENCES queues(id),
    FOREIGN KEY (agent_id) REFERENCES users(id)
);

CREATE INDEX idx_queue_members_queue ON queue_members(queue_id);
CREATE INDEX idx_queue_members_agent ON queue_members(agent_id);
```

### 3. `queue_entries` Table

```sql
CREATE TABLE queue_entries (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    queue_id UUID NOT NULL,

    -- Priority
    priority VARCHAR(50),                 -- low, normal, high, urgent, vip
    priority_score DECIMAL(5, 2),         -- Calculated score (0-100)

    -- Timestamps
    enqueued_at TIMESTAMP DEFAULT NOW(),
    dequeued_at TIMESTAMP,

    -- Metrics
    wait_time_seconds INTEGER,            -- Time spent in queue
    estimated_wait_time INTEGER,          -- Estimate given to customer
    queue_position INTEGER,               -- Position when enqueued

    -- Outcome
    dequeue_reason VARCHAR(50),           -- assigned, closed, transferred, timed_out

    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (queue_id) REFERENCES queues(id)
);

CREATE INDEX idx_queue_entries_conversation ON queue_entries(conversation_id);
CREATE INDEX idx_queue_entries_queue ON queue_entries(queue_id);
CREATE INDEX idx_queue_entries_enqueued ON queue_entries(enqueued_at DESC);
```

### 4. `queue_assignments` Table

```sql
CREATE TABLE queue_assignments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    queue_id UUID NOT NULL,

    -- Assignment
    assigned_at TIMESTAMP DEFAULT NOW(),
    unassigned_at TIMESTAMP,

    -- Metrics
    wait_time_seconds INTEGER,            -- Time in queue before assignment
    duration_seconds INTEGER,             -- Time agent handled conversation

    -- Outcome
    assignment_strategy VARCHAR(50),      -- Strategy used for assignment
    unassign_reason VARCHAR(50),          -- closed, transferred, reassigned

    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (agent_id) REFERENCES users(id),
    FOREIGN KEY (queue_id) REFERENCES queues(id)
);

CREATE INDEX idx_assignments_conversation ON queue_assignments(conversation_id);
CREATE INDEX idx_assignments_agent ON queue_assignments(agent_id);
CREATE INDEX idx_assignments_queue ON queue_assignments(queue_id);
CREATE INDEX idx_assignments_assigned_at ON queue_assignments(assigned_at DESC);
```

### 5. `agent_status` Table

```sql
CREATE TABLE agent_status (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    agent_id UUID NOT NULL,

    -- Status
    current_status VARCHAR(50),           -- online, busy, away, offline
    status_updated_at TIMESTAMP,

    -- Capacity
    max_conversations INTEGER DEFAULT 5,
    current_workload INTEGER DEFAULT 0,   -- Active conversations

    -- Availability
    last_activity_at TIMESTAMP,
    auto_away_minutes INTEGER DEFAULT 15,

    UNIQUE(agent_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (agent_id) REFERENCES users(id)
);

CREATE INDEX idx_agent_status_tenant ON agent_status(tenant_id);
CREATE INDEX idx_agent_status_status ON agent_status(current_status);
```

### 6. `conversation_priority` Table

```sql
CREATE TABLE conversation_priority (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,

    priority VARCHAR(50),                 -- low, normal, high, urgent, vip
    priority_score DECIMAL(5, 2),

    -- Detection
    auto_detected BOOLEAN DEFAULT FALSE,
    detection_reason JSONB,               -- Urgency signals, customer tier, etc.

    -- Changes
    previous_priority VARCHAR(50),
    escalated BOOLEAN DEFAULT FALSE,
    escalated_at TIMESTAMP,

    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(conversation_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_priority_conversation ON conversation_priority(conversation_id);
CREATE INDEX idx_priority_level ON conversation_priority(priority);
```

### 7. `sla_rules` Table

```sql
CREATE TABLE sla_rules (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    queue_id UUID,                        -- NULL = global rule

    priority VARCHAR(50) NOT NULL,        -- vip, urgent, high, normal, low
    target_seconds INTEGER NOT NULL,      -- SLA target time

    -- Escalation
    escalation_enabled BOOLEAN DEFAULT TRUE,
    escalation_queue_id UUID,             -- Queue to escalate to
    escalation_offset_seconds INTEGER,    -- Warn N seconds before breach

    is_active BOOLEAN DEFAULT TRUE,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (queue_id) REFERENCES queues(id),
    FOREIGN KEY (escalation_queue_id) REFERENCES queues(id)
);

CREATE INDEX idx_sla_rules_tenant ON sla_rules(tenant_id);
CREATE INDEX idx_sla_rules_queue ON sla_rules(queue_id);
```

---

## Dashboard Support

### Agent Dashboard Views

#### 1. **Queue View**

```typescript
// Frontend component showing queue status

interface QueueDashboardProps {
  queueId: string;
}

const QueueDashboard: FC<QueueDashboardProps> = ({ queueId }) => {
  const { data: queueMetrics } = useQueueMetrics(queueId);
  const { data: waitingConversations } = useWaitingConversations(queueId);

  return (
    <div className="queue-dashboard">
      <QueueMetrics
        depth={queueMetrics.current_depth}
        avgWaitTime={queueMetrics.avg_wait_time}
        longestWait={queueMetrics.longest_wait}
      />

      <WaitingList conversations={waitingConversations} />

      <AgentStatusPanel queueId={queueId} />
    </div>
  );
};
```

**Shows**:
- Pending conversations (count)
- Assigned conversations (my active chats)
- Queue waiting time (avg and max)
- Queue priority distribution
- My position in round-robin rotation

#### 2. **My Conversations View**

```typescript
const MyConversations: FC = () => {
  const { data: assignments } = useMyAssignments();

  return (
    <div className="my-conversations">
      <h3>Active Conversations ({assignments.length}/5)</h3>

      {assignments.map(assignment => (
        <ConversationCard
          key={assignment.id}
          conversation={assignment.conversation}
          priority={assignment.conversation.priority}
          waitTime={assignment.wait_time_seconds}
        />
      ))}
    </div>
  );
};
```

### Admin Configuration UI

#### 1. **Queue Configuration**

```typescript
const QueueConfig: FC<{ queueId: string }> = ({ queueId }) => {
  return (
    <Form>
      <FormGroup label="Queue Name">
        <Input name="name" />
      </FormGroup>

      <FormGroup label="Routing Strategy">
        <Select name="routing_strategy">
          <option value="round_robin">Round Robin</option>
          <option value="least_busy">Least Busy</option>
          <option value="skills_based">Skills-Based</option>
          <option value="load_balancing">Load Balancing</option>
        </Select>
      </FormGroup>

      <FormGroup label="Max Queue Depth">
        <Input type="number" name="max_queue_depth" />
      </FormGroup>

      <FormGroup label="SLA Target (seconds)">
        <Input type="number" name="sla_target_seconds" />
      </FormGroup>

      <FormGroup label="Overflow Queue">
        <QueueSelector name="overflow_queue_id" />
      </FormGroup>
    </Form>
  );
};
```

#### 2. **Agent Capacity Settings**

```typescript
const AgentCapacityConfig: FC<{ agentId: string }> = ({ agentId }) => {
  return (
    <Form>
      <FormGroup label="Max Concurrent Conversations">
        <Slider min={1} max={10} name="max_conversations" />
      </FormGroup>

      <FormGroup label="Skills">
        <MultiSelect
          options={["spanish", "technical", "vip_handling", "billing"]}
          name="skills"
        />
      </FormGroup>

      <FormGroup label="Assigned Queues">
        <QueueMultiSelect name="queues" />
      </FormGroup>
    </Form>
  );
};
```

---

## Queue Analytics

### Real-Time Metrics

```python
# services/queue/analytics/queue_metrics.py

class QueueMetrics:
    """Real-time queue analytics."""

    async def get_metrics(
        self,
        queue_id: str,
        tenant_id: str,
        time_range: str = "today"
    ) -> Dict:
        """
        Returns:
            {
                "current_depth": 12,
                "avg_wait_time": 180,  # seconds
                "longest_wait": 420,
                "total_queued_today": 156,
                "total_assigned_today": 142,
                "abandonment_rate": 0.08,  # 8%
                "avg_assignment_time": 145,
                "sla_compliance_rate": 0.92  # 92%
            }
        """
```

### Agent Performance KPIs

```python
class AgentPerformance:
    """Agent-level performance metrics."""

    async def get_agent_kpis(
        self,
        agent_id: str,
        time_range: str = "today"
    ) -> Dict:
        """
        Returns:
            {
                "conversations_handled": 28,
                "avg_handle_time": 320,  # seconds
                "current_workload": 4,
                "max_capacity": 5,
                "utilization_rate": 0.80,  # 80%
                "avg_customer_rating": 4.5,
                "first_response_time": 25  # seconds
            }
        """
```

---

## Phase 3 Readiness Confirmation

### ✅ Queue Management System Architecture Complete

The queue management system is **fully designed and ready for Phase 3: Database Schema Design**.

### What's Been Added

1. ✅ **Queue Manager** - Core queue orchestration with Redis-backed storage
2. ✅ **Assignment Engine** - Configurable conversation-to-agent assignment
3. ✅ **Agent Availability Service** - Real-time status and capacity tracking
4. ✅ **Priority Router** - Priority classification and SLA enforcement
5. ✅ **Queue Policies** - Configurable routing rules and overflow strategies
6. ✅ **Assignment Strategies** - Round-robin, least-busy, skills-based, VIP
7. ✅ **Escalation System** - SLA monitoring and breach handling
8. ✅ **Queue Analytics** - Real-time metrics and agent performance KPIs
9. ✅ **Multi-Tenant Support** - Full tenant isolation for all queue operations
10. ✅ **Dashboard Support** - Agent and admin UI requirements defined

### Integration Points Confirmed

- ✅ **services/automation/** - Queue router for AI vs human decision
- ✅ **services/realtime/** - WebSocket notifications for assignments
- ✅ **services/agent/** - Agent management and team structures
- ✅ **services/analytics/** - Queue metrics integration

### Database Entities Defined

- ✅ `queues` - Queue configuration and policies
- ✅ `queue_members` - Agent-queue assignments
- ✅ `queue_entries` - Conversation queue history
- ✅ `queue_assignments` - Assignment records
- ✅ `agent_status` - Agent availability tracking
- ✅ `conversation_priority` - Priority management
- ✅ `sla_rules` - SLA targets and escalation

---

## Next Steps for Phase 3

In Phase 3, we will:

1. **Finalize Database Schema** - Complete SQL definitions with all constraints
2. **Create Entity Relationships** - Define all foreign keys and indexes
3. **Design Alembic Migrations** - Version-controlled schema changes
4. **Optimize Indexes** - Performance tuning for queue operations
5. **Add Partitioning Strategy** - For high-volume tables (queue_entries, assignments)

**Status**: ✅ **Ready for Phase 3: Database Schema Design**
