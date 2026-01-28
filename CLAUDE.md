# Triathlon Assistant Bot (Clawdbot + WHOOP)

## Goal
A personal training copilot accessed via Clawdbot chat (Telegram/WhatsApp). Fetches WHOOP fitness data and generates personalized daily training plans.

## Architecture
```
Telegram/WhatsApp → Clawdbot (triathlon-coach skill) → API (:3000) → WHOOP API
```

- **API**: Express server with WHOOP OAuth integration
- **Bot**: Clawdbot skill that calls the API endpoints
- **Auth**: API key (Bearer token)

## API Endpoints
- `GET /health` - Health check (no auth)
- `GET /api/whoop/today` - Current WHOOP metrics + raw WHOOP payloads
- `POST /api/today-plan` - Generate training plan
- `GET /api/whoop/connect` - Start WHOOP OAuth
- `GET /api/whoop/callback` - OAuth callback
- `GET /api/whoop/status` - Connection status
- `POST /api/whoop/disconnect` - Disconnect WHOOP

## Usage (via Clawdbot)
- Ask naturally: "give me my training plan", "how should I train today?"
- The skill fetches WHOOP data and asks for missing inputs

## WHOOP Today Response
`/api/whoop/today` returns a compact summary plus full raw objects when available:
- Summary: `sleepHours`, `sleepScore`, `recoveryScore`, `strain`, `avgHeartRate`, `maxHeartRate`, `kilojoule`, `hrv`, `restingHeartRate`
- Raw payloads: `raw.cycle`, `raw.sleep`, `raw.recovery`

## Environment Variables
```
API_KEY=              # API auth (optional)
WHOOP_CLIENT_ID=      # WHOOP Developer app
WHOOP_CLIENT_SECRET=  # WHOOP Developer app
WHOOP_REDIRECT_URI=   # e.g., http://localhost:3000/api/whoop/callback
LOG_LEVEL=info
PORT=3000
```

## Development
```bash
pnpm install
pnpm api:dev          # Run API with hot reload
pnpm bot:dev          # Run CLI bot (testing)
pnpm build            # Build for production
```

## Clawdbot Integration
Skill located at: `~/clawd/skills/triathlon-coach/SKILL.md`

Config in `~/.clawdbot/clawdbot.json`:
```json
{
  "skills": {
    "entries": {
      "triathlon-coach": {
        "enabled": true,
        "env": {
          "TRIATHLON_API_URL": "http://localhost:3000",
          "TRIATHLON_API_KEY": ""
        }
      }
    }
  }
}
```

## Security Rules
- Never log OAuth tokens
- Use API_KEY for endpoint protection
- Keep secrets in .env (not committed)

## Coding Guidelines
- TypeScript strict mode
- Small modules: auth/, whoop/, routes/
- 8s timeout on all HTTP calls
- Friendly error messages
