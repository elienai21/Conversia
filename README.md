# Conversia

Conversia is a multi-tenant customer support platform with real-time inbox, AI copilot, translations, analytics, and external integrations.

## Official backend

The TypeScript backend is the official backend for this repository.

- Official API/runtime: `backend-ts`
- Frontend app: `frontend`
- Legacy reference implementation: `backend` (kept temporarily for historical reference only; do not use for new development or deployment)

## Local development

The local Docker Compose stack brings up PostgreSQL, Redis, and the official TypeScript backend.

```bash
docker compose up --build
```

Default local endpoints:

- API health check: `http://localhost:8000/health`
- Frontend dev server: `http://localhost:5173`

## Deployment

Railway is already configured to build and deploy the official backend from `backend-ts/Dockerfile`.
