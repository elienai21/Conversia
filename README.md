# Conversia

**Conversia** is a production-grade, multi-tenant AI customer support SaaS platform. It provides a real-time inbox, AI copilot, automated responses, multilingual support, CRM integration, analytics, and operational tooling — all scoped per tenant with full data isolation.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Deployment](#deployment)
- [API Conventions](#api-conventions)
- [Role & Permission System](#role--permission-system)
- [AI System](#ai-system)
- [Integrations](#integrations)
- [Default Credentials](#default-credentials)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Vite)          port 5173                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  DashboardLayout  →  Pages (Inbox, Customers, Analytics…)   │    │
│  │  Socket.IO client  →  Real-time message / conversation push │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / WebSocket
┌────────────────────────────▼────────────────────────────────────────┐
│  Fastify 5 API Server                          port 8000             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │  REST Routes │  │ Socket.IO    │  │ BullMQ Workers             │  │
│  │  (auth JWT)  │  │ (rooms by    │  │  - copilot suggestions     │  │
│  │             │  │  tenant/conv) │  │  - ai auto-response        │  │
│  └──────┬──────┘  └──────────────┘  └────────────────────────────┘  │
│         │                                                            │
│  ┌──────▼──────────────────────────────────────────────────────┐    │
│  │  Services Layer                                              │    │
│  │  message · conversation · translation · embedding · copilot │    │
│  │  auto-response · crm-tools · usage-log · business-hours     │    │
│  └──────┬──────────────────────────────────────────────────────┘    │
└─────────┼───────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────┐   ┌──────────────────────────────┐
│  PostgreSQL 16 (pgvector)        │   │  Redis 7                     │
│  - All tenant data (isolated)    │   │  - BullMQ job queues         │
│  - Vector embeddings for RAG     │   │  - Socket.IO adapter         │
│  - Soft-delete on messages       │   └──────────────────────────────┘
└─────────────────────────────────┘
```

**Real-time flow**: Incoming WhatsApp/Instagram messages → Evolution API webhook → Fastify route → saveMessage → SocketService.emit → Socket.IO room `conv_{id}` → browser updates instantly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js 20 + TypeScript |
| HTTP framework | Fastify 5 |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 + pgvector extension |
| Cache / Queue | Redis 7 + BullMQ |
| Real-time | Socket.IO 4 |
| AI | OpenAI SDK (GPT-4o / configurable per tenant) |
| Translation | DeepL API (primary) + OpenAI fallback |
| Frontend | React 19 + Vite 8 |
| Routing | react-router-dom 7 |
| Styling | CSS Modules + CSS variables (glassmorphism dark theme) |
| Icons | lucide-react |
| Auth | JWT (fastify-jwt) |
| Encryption | AES-256-GCM (API keys at rest) |

---

## Project Structure

```
Conversia/
├── backend-ts/                  ← Official TypeScript backend
│   ├── prisma/
│   │   └── schema.prisma        ← Full database schema
│   └── src/
│       ├── config.ts            ← Environment config (Zod-validated)
│       ├── server.ts            ← Fastify app bootstrap
│       ├── adapters/
│       │   └── crm/             ← CRM adapter factory (Winker, etc.)
│       ├── lib/
│       │   ├── ai-client.ts     ← Unified AI client (OpenAI / fallback)
│       │   ├── encryption.ts    ← AES-256-GCM helpers
│       │   ├── logger.ts        ← Pino structured logging
│       │   └── prisma.ts        ← Prisma client singleton
│       ├── routes/              ← 23 route modules (one per resource)
│       │   ├── auth.routes.ts
│       │   ├── conversation.routes.ts
│       │   ├── message.routes.ts
│       │   ├── customer.routes.ts
│       │   ├── agent.routes.ts
│       │   ├── tenant.routes.ts
│       │   ├── webhook.routes.ts
│       │   ├── evolution.routes.ts
│       │   ├── serviceorder.routes.ts
│       │   ├── campaign.routes.ts
│       │   ├── analytics.routes.ts
│       │   ├── billing.routes.ts
│       │   ├── kb.routes.ts
│       │   ├── upsell.routes.ts
│       │   ├── task.routes.ts
│       │   └── ...
│       ├── services/            ← Business logic
│       │   ├── auto-response.service.ts
│       │   ├── copilot.service.ts
│       │   ├── message.service.ts
│       │   ├── translation.service.ts
│       │   ├── embedding.service.ts
│       │   ├── crm-tools.service.ts
│       │   ├── business-hours.service.ts
│       │   ├── usage-log.service.ts
│       │   ├── socket.service.ts
│       │   └── whatsapp.service.ts
│       └── workers/             ← BullMQ background workers
│           ├── copilot.worker.ts
│           └── auto-response.worker.ts
│
├── frontend/                    ← React + Vite frontend
│   └── src/
│       ├── contexts/            ← AuthContext, ThemeContext, SocketContext
│       ├── hooks/               ← useContactOptions, custom hooks
│       ├── services/
│       │   └── api.ts           ← ApiService static class
│       ├── components/
│       │   ├── layouts/
│       │   │   └── DashboardLayout.tsx
│       │   ├── AiModeToggle.tsx
│       │   ├── EditCustomerModal.tsx
│       │   ├── NewCustomerModal.tsx
│       │   ├── ServiceOrderModal.tsx
│       │   └── ...
│       └── pages/
│           ├── InboxPage.tsx        ← Main chat interface
│           ├── CustomersPage.tsx    ← Contact list with filters
│           ├── ServiceOrdersPage.tsx ← Kanban O.S. board
│           ├── AnalyticsPage.tsx
│           ├── SettingsPage.tsx     ← All settings tabs
│           └── ...
│
├── docs/
│   └── architecture/            ← Architecture documentation
│
├── docker-compose.yml           ← PostgreSQL + Redis for local dev
└── README.md
```

---

## Features

### Core Inbox
- **Unified inbox** for WhatsApp and Instagram conversations
- **Real-time updates** via Socket.IO — messages appear instantly without polling
- **Multi-channel routing**: conversations tagged by channel (`whatsapp`, `instagram`)
- **Conversation scopes**: Hóspedes (guests), Equipe (team/operations), Diretoria (owners/management)
- **Unread badge counts** per scope, refreshed on Socket.IO events
- **Agent assignment** — conversations can be assigned to specific agents
- **Internal notes** — private team messages not visible to customers or AI
- **Message forwarding** — forward messages between conversations
- **Soft-delete** on messages (deletedAt field, not physically removed)

### AI Copilot
- **Contextual suggestions** generated in the background via BullMQ
- **RAG (Retrieval-Augmented Generation)**: knowledge base entries retrieved using pgvector semantic similarity search
- **RAG query uses last 3 customer messages** concatenated for better intent capture across multi-turn conversations
- **15-message conversation context** passed to AI (internal notes excluded)
- **CRM tool calling**: AI can call `search_available_listings`, `calculate_price`, `get_reservation_details`, `get_listing_details`, `get_all_properties`, `get_house_rules`
- **Up to 5 function-calling iterations** per response cycle
- **Per-tenant AI model & system prompt** configuration
- **Per-tenant OpenAI API key** (AES-256-GCM encrypted at rest)
- **AI usage logging** per tenant (input/output token tracking)

### Auto-Response
- **Fully autonomous AI responses** when no agent is available
- **Business hours mode**: always / outside hours / manual (disabled)
- **Intent allow-list**: only respond to configured intents
- **Same RAG + CRM tool loop** as copilot
- **Translation**: response translated to customer's detected language if different from tenant default
- Sends via WhatsApp or Instagram automatically

### Multilingual Support
- **Language detection** on every inbound message
- **DeepL translation** (primary) with OpenAI fallback
- **Per-message translations** stored in `MessageTranslation` table
- Toggle to view original or translated text in UI

### Knowledge Base
- Entries with title, content, category, and vector embedding
- Semantic search via `pgvector` (`<=>` cosine distance operator)
- Fallback to category-based text search when embedding is unavailable

### Contacts (Customers)
- Full contact list with name, phone, email, tag, role/type, platform
- **Filters**: alphabetical sort, contact type filter, messaging platform filter
- **Dynamic tags & contact types**: admins can add/remove options from Settings without code changes
- Edit contact from conversation ⋮ menu directly in inbox
- Contact creation modal with all fields

### Service Orders (O.S.)
- **Kanban board** with 5 columns: Pendente → Em Andamento → Aguard. Material → Concluído → Cancelado
- Drag-and-drop to move cards between columns
- Fields: location, category, description, priority, assignee, guest name, impact on stay, payment responsible
- **Delete O.S.** with confirmation dialog
- Sequential numbering per tenant
- Linked to conversations (optional)

### Staff & Operations
- Staff member management (internal team contacts)
- Operations inbox scoped to team conversations
- Owners/Directors inbox for management-level conversations

### Campaigns
- Bulk WhatsApp message campaigns
- Per-tenant campaign management

### Analytics
- Conversation volume, response times, CSAT scores
- AI usage tracking (tokens consumed per tenant)
- Agent performance metrics

### Settings (Admin)
- **General**: tenant name, timezone, language
- **AI**: system prompt, model selection, OpenAI API key
- **Auto-Response**: mode, business hours, allowed intents
- **Tags & Contact Types**: dynamic add/remove without code changes
- **Integrations**: WhatsApp (Evolution API), Instagram, CRM (Winker)
- **Knowledge Base**: CRUD for KB entries
- **Business Hours**: opening/closing times per day

### Billing
- Plan & billing management per tenant

### Audit Logs
- Full audit trail of admin actions

### Role-Based Access Control
See [Role & Permission System](#role--permission-system) below.

---

## Local Development

### Prerequisites
- Docker Desktop
- Node.js 20+
- npm 10+

### 1. Start infrastructure

```bash
# From project root
docker compose up -d
```

This starts:
- PostgreSQL 16 on port 5432 (with pgvector extension)
- Redis 7 on port 6379

### 2. Backend setup

```bash
cd backend-ts
cp .env.example .env   # edit as needed
npm install
npm run db:push        # apply schema (prisma db push)
npm run seed           # seed demo tenant + admin user
npm run dev            # start with tsx watch on port 8000
```

### 3. Frontend setup

```bash
cd frontend
cp .env.example .env   # set VITE_API_URL=http://localhost:8000
npm install
npm run dev            # Vite dev server on port 5173
```

### Useful scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm run db:push` | Sync Prisma schema to DB (no migration file) |
| `npm run db:deploy` | Run pending migrations (production-safe) |
| `npm run seed` | Seed demo data |
| `npm run studio` | Open Prisma Studio |

---

## Environment Variables

### Backend (`backend-ts/.env`)

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/conversia
# DIRECT_URL = same as DATABASE_URL locally; in Railway with PgBouncer, set to the
# direct (non-pooled) connection string. Required by Prisma at startup.
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/conversia

# Redis
REDIS_URL=redis://localhost:6379/0

# Auth — MUST be changed before production (server blocks startup if default)
SECRET_KEY=change-me-in-production

# Encryption — MUST be changed before production; changing after storing API keys
# makes all encrypted values permanently unreadable. Never rotate without migration.
ENCRYPTION_SALT=your-unique-salt-here

# AI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini

# Translation
DEEPL_API_KEY=...

# Evolution API webhook validation (strongly recommended in production)
EVOLUTION_WEBHOOK_SECRET=

# Server
PORT=8000
NODE_ENV=development

# Optional — Supabase Storage for media uploads
SUPABASE_URL=
SUPABASE_KEY=

# Optional — Stripe billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_PROFESSIONAL=
STRIPE_PRICE_SCALE=
STRIPE_PRICE_ENTERPRISE=

# Optional — Gemini fallback (when OpenAI key is unavailable)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

# Optional — backend public URL for Evolution API webhook auto-config
BACKEND_URL=https://your-railway-app.railway.app
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:8000
```

---

## Database

### Key Models (Prisma)

| Model | Description |
|---|---|
| `Tenant` | SaaS tenant (isolated by `tenantId`) |
| `TenantSettings` | AI config, integrations, business hours, contact options |
| `User` | Agents/admins (role: `admin` \| `agent`) |
| `Customer` | Contact/customer per tenant |
| `Conversation` | Chat thread (channel, status, scope, assignedTo) |
| `Message` | Individual message (senderType, isInternal, soft-delete) |
| `MessageTranslation` | Translated version of a message |
| `MessageAttachment` | Media/file attachments |
| `KnowledgeBase` | RAG knowledge entries with vector embedding |
| `ServiceOrder` | Maintenance/task order |
| `Campaign` | Bulk messaging campaign |
| `UsageLog` | AI token usage per tenant |
| `AuditLog` | Admin action audit trail |

### pgvector

Used for semantic similarity search in the knowledge base:

```sql
SELECT title, content, category
FROM knowledge_base
WHERE tenant_id = $1 AND is_active = true
ORDER BY embedding <=> $2::vector
LIMIT 5;
```

---

## Deployment

Deployed on **Railway**. The `backend-ts/Dockerfile` builds the TypeScript backend. The pre-deploy command runs `prisma db push` (or `prisma migrate deploy`) to apply schema changes before the new server starts.

### Railway environment variables
All variables from `backend-ts/.env` section above, plus any tenant-specific keys configured through the Settings UI (stored encrypted in the database).

---

## API Conventions

- **Base URL**: `http://localhost:8000` (dev) or Railway URL (prod)
- **Auth**: `Authorization: Bearer <jwt>` header required on all routes except `/auth/*` and `/webhooks/*`
- **Response format**: JSON, snake_case from DB, camelCase in frontend (mapped via `mapOrder`, etc.)
- **Pagination**: `?page=1&limit=20` where supported
- **Errors**: `{ error: string, message?: string }` with appropriate HTTP status

### Route modules (23 total)

```
POST   /auth/login
POST   /auth/register

GET    /conversations
GET    /conversations/:id
PATCH  /conversations/:id
GET    /conversations/unread-summary

GET    /messages/:conversationId
POST   /messages
DELETE /messages/:id

GET    /customers
POST   /customers
GET    /customers/:id
PUT    /customers/:id

GET    /agents                    ← Admin only: list all agents
POST   /agents/invite

GET    /tenants/me
PUT    /tenants/me
GET    /tenants/me/contact-options
PUT    /tenants/me/contact-options

POST   /webhooks/evolution        ← Evolution API inbound webhook
POST   /webhooks/instagram

GET    /service-orders
POST   /service-orders
PATCH  /service-orders/:id
DELETE /service-orders/:id

GET    /analytics/summary
GET    /knowledge-base
POST   /knowledge-base
...
```

---

## Role & Permission System

Two roles exist on the `User` model: `admin` and `agent`.

### Admin
Full access to all features:
- Dashboard, Analytics, Campaigns, Audit Logs
- Settings (all tabs including integrations, AI, billing)
- Customer management, task management
- All inbox scopes (Hóspedes, Equipe, Diretoria)
- Agent filter in inbox (see messages by specific operator)
- Agent invite/management

### Agent (Operator)
Communication-only access:
- Inbox (Hóspedes scope by default)
- Operations inbox (Equipe)
- Service Orders (O.S.)
- Staff directory

The `DashboardLayout` hides admin-only nav items based on `user.role`. Backend routes use `requireAdmin` hook to enforce server-side authorization.

### Operator identification in messages
When an agent sends a message, their `senderId` (User.id) is stored in the Message record. The `getConversationMessages` service resolves agent names in batch from the User table and returns them in `senderName`. The frontend shows the agent's name above messages they sent (when different from the current user).

---

## AI System

### Copilot flow (background)
1. New message arrives → BullMQ job enqueued
2. Worker fetches tenant settings, conversation context (15 messages)
3. RAG: last 3 customer messages concatenated → embedding generated → pgvector similarity search → top 5 KB entries retrieved
4. System prompt assembled (tenant custom prompt or default + KB context)
5. AI completion with CRM tool calling (up to 5 iterations)
6. Suggestion saved to DB, emitted via Socket.IO to agent's screen

### Auto-response flow
1. Triggered after copilot if no agent is assigned
2. Checks `autoResponseMode` + business hours (`resolveAutoResponseEnabled`)
3. Checks intent against allowed-intents list
4. Same RAG + LLM + tool loop as copilot
5. `NO_MATCH` → falls through to agent assignment
6. Valid response → translated if needed → sent via Evolution API / Instagram

### AI context quality
- **15 messages** of history passed to LLM (excluding internal notes)
- **RAG uses 3 customer messages** (not just the latest) to capture multi-turn context
- Internal team notes are **never** passed to the AI
- Conversation history is passed in **chronological order** (oldest first)

---

## Integrations

### WhatsApp — Evolution API
- Self-hosted Evolution API instance
- Tenant stores `evolutionApiUrl`, `evolutionApiKey`, `evolutionInstance` in TenantSettings (encrypted)
- Webhook events: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_SET`, `QRCODE_UPDATED`, `CONNECTION_UPDATE`
- `MESSAGES_SET` syncs historical messages when a new instance connects
- `send_messages_from_me: true` captures messages sent from the phone

### Instagram
- Direct Messenger API integration
- Token stored encrypted in `instagramPageAccessToken`

### CRM — Winker
- Adapter pattern: `CrmAdapterFactory.getAdapter(tenantId)`
- Credentials stored encrypted in TenantSettings
- Exposes tools: `search_available_listings`, `calculate_price`, `get_reservation_details`, `get_listing_details`, `get_all_properties`, `get_house_rules`

---

## Default Credentials

```
Email:    admin@hoteldemo.com
Password: admin123
```

> ⚠️ Change these before any production deployment.
