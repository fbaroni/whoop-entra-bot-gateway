# Triathlon Assistant Bot (Clawdbot + Entra + WHOOP)

## Goal
A private training copilot accessed via Clawdbot chat. The bot calls a protected API (Azure Container Apps)
to generate today's training plan and (optionally) fetch WHOOP recovery/sleep.

## Architecture (high level)
- Bot runtime: Clawdbot channel adapter (Telegram/WhatsApp)
- Bot service: Node/TypeScript (or minimal handler) that:
  - Requests Entra token (client credentials)
  - Calls the API endpoints:
    - POST /api/today-plan
    - GET /api/whoop/today (optional)
- API auth: Entra ID JWT validation (audience/issuer/roles)

## Key flows
1) User types "plan"
2) Bot tries GET /api/whoop/today (autofill sleepHours + recoveryScore)
3) Bot asks user for missing inputs (muscleSoreness, activityType if needed)
4) Bot calls POST /api/today-plan
5) Bot responds with a short plan summary.

## Commands
- plan
- set activity <zwift|strength|walk|swim>
- status
- help
- connect whoop (optional, if OAuth is implemented)

## Environments
### Bot env vars
- API_BASE_URL=
- TENANT_ID=
- BOT_CLIENT_ID=
- BOT_CLIENT_SECRET=
- API_AUDIENCE=api://<triathlon-assistant-api-app-id>
- LOG_LEVEL=info

### API env vars (Azure)
- TENANT_ID=
- API_AUDIENCE=api://<triathlon-assistant-api-app-id>
- WHOOP_CLIENT_ID= (optional)
- WHOOP_CLIENT_SECRET= (optional)
- WHOOP_REDIRECT_URI= (optional)

## Local development
- Install: pnpm install
- Run bot: pnpm bot:dev
- Run api: pnpm api:dev

## Security rules
- Never log OAuth tokens (WHOOP or Entra)
- Use Entra app roles; require role Whoop.Read for /api/whoop/*
- Requests must validate issuer + audience
- Keep secrets in Azure Container Apps secrets / local env only

## Coding guidelines
- TypeScript strict
- Small modules: auth/, whoop/, apiClient/, commands/
- Timeouts on all HTTP calls (8s)
- Friendly error messages for network/auth failures

## Tasks (incremental)
1) Implement Entra token client in bot
2) Implement JWT validation middleware in API
3) Protect /api/whoop/today and /api/today-plan
4) Add WHOOP endpoints (optional)
5) Add daily automation/webhooks (optional)
