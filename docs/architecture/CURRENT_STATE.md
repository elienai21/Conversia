# Conversia — Current Architecture & Feature State

**Last updated**: 2026-03-28
**Status**: Production / Active Development
**Backend**: TypeScript (Fastify 5) — the Python `backend/` folder is legacy and not used.

---

## 1. Runtime Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  React 19 + Vite 8 (port 5173)                               │
│  Socket.IO client → real-time push                           │
└─────────────────────────────┬────────────────────────────────┘
                              │ REST + WS
┌─────────────────────────────▼────────────────────────────────┐
│  Fastify 5  (port 8000)                                      │
│  ├── Routes (23 modules, JWT-authenticated)                  │
│  ├── Socket.IO server (rooms: tenant_{id}, conv_{id})        │
│  └── BullMQ workers (copilot, auto-response)                 │
└──────────────┬───────────────────────────────────────────────┘
               │
   ┌───────────┴──────────┐
   │                      │
┌──▼──────────────┐  ┌────▼──────────┐
│ PostgreSQL 16   │  │ Redis 7       │
│ + pgvector      │  │ BullMQ queues │
│ (all data,      │  │ Socket.IO     │
│  embeddings)    │  │  adapter      │
└─────────────────┘  └───────────────┘
```

---

## 2. Data Model Summary

### Core entities

```
Tenant (1)
  └─ TenantSettings (1:1)       — AI config, integrations, business hours, contact options
  └─ User[] (1:N)               — Agents/admins (role: admin | agent)
  └─ Customer[] (1:N)           — Contact records
  └─ Conversation[] (1:N)       — Chat threads
       └─ Message[] (1:N)       — Messages (soft-delete via deletedAt)
            └─ MessageTranslation[] (1:N)
            └─ MessageAttachment[] (1:N)
  └─ KnowledgeBase[] (1:N)      — RAG entries with vector embedding
  └─ ServiceOrder[] (1:N)       — Maintenance/task orders
  └─ Campaign[] (1:N)           — Bulk messaging campaigns
  └─ UsageLog[] (1:N)           — AI token usage tracking
  └─ AuditLog[] (1:N)           — Admin action audit trail
```

### Key flags on Message
| Field | Type | Purpose |
|---|---|---|
| `senderType` | string | `customer` \| `agent` \| `system` |
| `senderId` | string? | User.id when senderType = agent |
| `senderName` | string? | Resolved at query time from User table |
| `isInternal` | boolean | Private team note (hidden from customer + AI) |
| `deletedAt` | DateTime? | Soft-delete timestamp |

### TenantSettings — notable fields
| Field | Purpose |
|---|---|
| `autoResponseMode` | `always` \| `outside_hours` \| `manual` |
| `enableAutoResponse` | boolean master switch |
| `autoResponseIntents` | JSON string[] — intent allow-list |
| `aiSystemPrompt` | Custom system prompt for AI |
| `openaiApiKey` | AES-256-GCM encrypted |
| `openaiModel` | e.g. `gpt-4o` |
| `customerTagOptions` | JSON string[] — dynamic tag options |
| `customerRoleOptions` | JSON {value,label}[] — dynamic contact type options |
| `businessHoursStart/End` | HH:MM strings |
| `businessHoursDays` | JSON number[] — e.g. [1,2,3,4,5] |
| `evolutionApiUrl/Key/Instance` | WhatsApp integration |
| `instagramPageAccessToken` | Instagram integration (encrypted) |
| `winkerLogin/Password` | CRM integration (encrypted) |

---

## 3. Request Flow — Inbound WhatsApp Message

```
Phone sends WhatsApp message
        │
        ▼
Evolution API → POST /webhooks/evolution
        │
        ▼
webhook.routes.ts
  ├── Normalize payload (MESSAGES_UPSERT / MESSAGES_SET)
  ├── Upsert Customer
  ├── Find or create Conversation
  ├── saveMessage() → DB
  ├── Detect language
  ├── SocketService.emitToConversation("message.new")  → UI updates
  │
  ├── If outbound (from phone): saveOutboundMessage + attachments
  │
  └── Enqueue BullMQ jobs:
        ├── copilot-suggestions (generates AI suggestion for agent)
        └── auto-response (sends autonomous reply if configured)
```

---

## 4. AI Copilot Flow

```
BullMQ job: copilot-suggestions
        │
        ▼
copilot.service.ts
  1. Fetch TenantSettings
  2. Fetch last 15 messages (deletedAt=null, with attachments)
  3. RAG query: last 3 customer messages → generateEmbedding()
        → pgvector <=> similarity → top 5 KB entries
  4. Resolve API key (tenant key or global fallback)
  5. Build system prompt (custom or default + KB context)
  6. Filter internal notes from conversation context
  7. chatCompletion() with CRM tools (up to 5 iterations)
        └── executeCrmToolCall() for each tool_call
  8. Save suggestion → DB
  9. SocketService.emitToTenant("copilot.suggestion")
 10. Log AI usage (tokens)
```

---

## 5. Auto-Response Flow

```
BullMQ job: auto-response
        │
        ▼
auto-response.service.ts
  1. Fetch TenantSettings
  2. resolveAutoResponseEnabled() — check mode + business hours
  3. Check intent against allowedIntents list
  4. RAG: last 3 customer messages → embedding → pgvector → 5 KB entries
  5. Resolve API key + model
  6. Build systemDirective (custom prompt + KB + rules + context instruction)
  7. chatCompletion() with CRM tools (up to 5 iterations)
  8. Log AI usage
  9. If answer = "NO_MATCH" → return false (fall through to agent assignment)
 10. saveMessage(senderType="system")
 11. If detectedLang ≠ tenantLang → translateText() + saveTranslation()
 12. sendWhatsappMessage() or sendInstagramMessage()
 13. SocketService.emitToConversation("message.new")
```

---

## 6. Role & Permission System

### User roles
- **admin**: Full platform access
- **agent**: Communication features only

### What agents (operators) can access
- Inbox (Hóspedes, Equipe, Diretoria)
- Service Orders (O.S.) board
- Staff directory

### What only admins can access
- Dashboard (analytics overview)
- Daily Tasks / Missões Diárias
- Customers management
- Full Analytics page
- Campaigns
- Audit Logs
- Property Config
- Billing / Plan
- Settings (all tabs)
- Agent filter in inbox

### Enforcement
- **Frontend**: `DashboardLayout.tsx` gates nav items with `user?.role === "admin"`
- **Backend**: `requireAdmin` Fastify hook on protected routes

---

## 7. Dynamic Contact Options

Admins can manage tag and contact-type options without code changes:

```
Settings → Tags & Tipos tab (ContactOptionsTab.tsx)
        │
        ▼
GET  /tenants/me/contact-options  → returns { tags: string[], roles: {value, label}[] }
PUT  /tenants/me/contact-options  → saves to TenantSettings.customerTagOptions / customerRoleOptions
        │
        ▼
EditCustomerModal / NewCustomerModal  → useContactOptions() hook → dynamic dropdowns
```

---

## 8. Agent Identification in Messages

```
Agent sends message via InboxPage
        │
        ▼
POST /messages  { senderId: user.id, senderType: "agent", ... }
        │
        ▼
getConversationMessages()
  - Collects unique senderIds where senderType = "agent"
  - Batch-fetches User.fullName from DB
  - Injects senderName into message objects
        │
        ▼
InboxPage renders:
  {msg.senderType === 'agent' && msg.senderName && msg.senderId !== user.id && (
    <div className="agent-sender-label">{msg.senderName}</div>
  )}
```

---

## 9. WhatsApp Webhook — MESSAGES_SET Support

The `MESSAGES_SET` event is sent by Evolution API when reconnecting/syncing historical messages. It arrives as an array of messages in a different format.

```typescript
// webhook.routes.ts normalizes it:
if (event === "messages.set") {
  // Convert Evolution MESSAGES_SET format → messages.upsert format
  // Process each message as if it were a new MESSAGES_UPSERT
}
```

This ensures all conversations (including Equipe/Diretoria contacts) get synced when Evolution API reconnects.

---

## 10. Service Orders (O.S.) — Kanban Board

**Columns**: Pendente → Em Andamento → Aguard. Material → Concluído → Cancelado

**Operations**:
- `GET /service-orders` — list all for tenant
- `POST /service-orders` — create
- `PATCH /service-orders/:id` — update (including drag-and-drop status change)
- `DELETE /service-orders/:id` — delete (with tenant ownership check)

The frontend uses HTML5 drag-and-drop API to move cards between columns and optimistically updates state before the PATCH resolves.

---

## 11. Contact Filters (CustomersPage)

Three client-side filters applied in sequence:

1. **Sort**: Alphabetical A→Z / Z→A (by `name`)
2. **Role filter**: Filter by `contactType` field
3. **Platform filter**: Filter by `channel` field (whatsapp, instagram, etc.)

Options for role/type filter are dynamically loaded from `useContactOptions()` hook.

---

## 12. Development Gotchas

| Issue | Solution |
|---|---|
| Windows paths in bash | Use `/c/Projetos/` not `c:\Projetos\` |
| Schema change not reflected | Run `npm run db:push` (prisma db push) |
| New column missing in prod | Check Railway pre-deploy step runs migration |
| API key decryption fails | ENCRYPTION_KEY must be identical to when key was encrypted |
| pgvector query fails | Extension must be enabled: `CREATE EXTENSION vector` |
| Socket.IO rooms | Rooms are `tenant_{id}` (tenant-wide) and `conv_{id}` (per conversation) |
| `accent-danger` CSS var | Doesn't exist — use `accent-error` |
| Backend port | Always 8000 (not 3000) |

---

## 13. File Locations Quick Reference

| What | Where |
|---|---|
| Prisma schema | `backend-ts/prisma/schema.prisma` |
| Environment config | `backend-ts/src/config.ts` |
| AI copilot service | `backend-ts/src/services/copilot.service.ts` |
| Auto-response service | `backend-ts/src/services/auto-response.service.ts` |
| WhatsApp webhook | `backend-ts/src/routes/webhook.routes.ts` |
| Evolution API routes | `backend-ts/src/routes/evolution.routes.ts` |
| Message service | `backend-ts/src/services/message.service.ts` |
| AI client wrapper | `backend-ts/src/lib/ai-client.ts` |
| Encryption helpers | `backend-ts/src/lib/encryption.ts` |
| Main inbox UI | `frontend/src/pages/InboxPage.tsx` |
| Customers page | `frontend/src/pages/CustomersPage.tsx` |
| Service Orders page | `frontend/src/pages/ServiceOrdersPage.tsx` |
| Settings page | `frontend/src/pages/SettingsPage.tsx` |
| Contact options tab | `frontend/src/pages/settings/ContactOptionsTab.tsx` |
| Dashboard layout | `frontend/src/components/layouts/DashboardLayout.tsx` |
| API service class | `frontend/src/services/api.ts` |
| Contact options hook | `frontend/src/hooks/useContactOptions.ts` |
| Docker compose | `docker-compose.yml` (root) |
